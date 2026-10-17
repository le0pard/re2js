import { Regexp } from './Regexp.js'
import { Utils } from './Utils.js'
import { RE2Flags } from './RE2Flags.js'
import { Unicode } from './Unicode.js'
import { RegexpWalker } from './RegexpWalker.js'

// High-speed, single-pass Aho-Corasick string matcher optimized for V8.
// Builds a trie with failure links to search for multiple prefixes simultaneously.
class AhoCorasick {
  constructor(wordArrays) {
    this.next = [Object.create(null)]
    this.fail = [0]
    this.match = [false]

    // Build Trie
    for (const word of wordArrays) {
      let node = 0
      for (let i = 0; i < word.length; i++) {
        const val = word[i]
        if (!(val in this.next[node])) {
          this.next.push(Object.create(null))
          this.fail.push(0)
          this.match.push(false)
          this.next[node][val] = this.next.length - 1
        }
        node = this.next[node][val]
      }
      this.match[node] = true
    }

    // Build Failure Links (BFS)
    const queue = []
    for (const val in this.next[0]) {
      if (Object.prototype.hasOwnProperty.call(this.next[0], val)) {
        const child = this.next[0][val]
        this.fail[child] = 0
        queue.push(child)
      }
    }

    while (queue.length > 0) {
      const curr = queue.shift()
      for (const val in this.next[curr]) {
        if (Object.prototype.hasOwnProperty.call(this.next[curr], val)) {
          const child = this.next[curr][val]
          let failNode = this.fail[curr]

          while (failNode !== 0 && !(val in this.next[failNode])) {
            failNode = this.fail[failNode]
          }

          if (val in this.next[failNode]) {
            this.fail[child] = this.next[failNode][val]
          } else {
            this.fail[child] = 0
          }

          this.match[child] = this.match[child] || this.match[this.fail[child]]
          queue.push(child)
        }
      }
    }
  }

  searchUTF16(charSeq, start, end) {
    let node = 0
    for (let i = start; i < end; i++) {
      const val = charSeq.charCodeAt(i)
      while (node !== 0 && !(val in this.next[node])) {
        node = this.fail[node]
      }
      if (val in this.next[node]) {
        node = this.next[node][val]
      }
      if (this.match[node]) return true
    }
    return false
  }

  searchUTF8(bytes, start, end) {
    let node = 0
    for (let i = start; i < end; i++) {
      const val = bytes[i]
      while (node !== 0 && !(val in this.next[node])) {
        node = this.fail[node]
      }
      if (val in this.next[node]) {
        node = this.next[node][val]
      }
      if (this.match[node]) return true
    }
    return false
  }
}

class Prefilter {
  static Type = { NONE: 0, EXACT: 1, AND: 2, OR: 3 }

  constructor(type) {
    this.type = type
    this.subs = []
    this.str = ''
    this.bytes = null
    this.ac16 = null
    this.ac8 = null
  }

  eval(input, pos) {
    switch (this.type) {
      case Prefilter.Type.NONE:
        return true
      case Prefilter.Type.EXACT:
        return input.hasString(this, pos)
      case Prefilter.Type.AND:
        for (let i = 0; i < this.subs.length; i++) {
          if (!this.subs[i].eval(input, pos)) return false
        }
        return true
      case Prefilter.Type.OR:
        // Exploit Aho-Corasick if it was successfully built
        if (this.ac16 && this.ac8) {
          return input.hasAnyString(this, pos)
        }
        for (let i = 0; i < this.subs.length; i++) {
          if (this.subs[i].eval(input, pos)) return true
        }
        return false
      default:
        return true
    }
  }
}

class PrefilterTree {
  // build returns the prefilter for the (simplified) regexp re: the literal strings every match
  // must contain, as a tree of EXACT, AND and OR nodes, already simplified. The regexp is walked
  // bottom-up without recursion (see RegexpWalker); enter/child/leave are the handler, and each
  // AND or OR node is simplified as its children arrive.
  static build(re) {
    if (!re) return new Prefilter(Prefilter.Type.NONE)
    return RegexpWalker.walk(re, PrefilterTree.WALKER)
  }

  static WALKER = {
    leaf: (re) => PrefilterTree.leaf(re),
    enter: (re) => PrefilterTree.enter(re),
    child: (re, state, result) => PrefilterTree.child(re, state, result),
    leave: (re, state) => PrefilterTree.leave(re, state)
  }

  // leaf returns the prefilter of a node without subexpressions: a literal requires itself,
  // everything else (classes, anchors, empty groups) requires nothing.
  static leaf(re) {
    if (re.op !== Regexp.Op.LITERAL) {
      return new Prefilter(Prefilter.Type.NONE)
    }
    if (re.runes.length === 0 || (re.flags & RE2Flags.FOLD_CASE) !== 0) {
      // Skip case-folded literals for simplicity
      return new Prefilter(Prefilter.Type.NONE)
    }
    let str = ''
    for (let i = 0; i < re.runes.length; i++) {
      if (re.runes[i] === Unicode.RUNE_ERROR) {
        // Invalid UTF-8 bytes decode to U+FFFD but never contain its encoding, so a
        // literal U+FFFD cannot be required as a byte string (see Prog.prefix).
        return new Prefilter(Prefilter.Type.NONE)
      }
      str += String.fromCodePoint(re.runes[i])
    }
    const pf = new Prefilter(Prefilter.Type.EXACT)
    pf.str = str
    pf.bytes = Utils.stringToUtf8ByteArray(pf.str)
    return pf
  }

  // enter returns the walk state for a node with subexpressions, or a state holding the
  // result when the subexpressions need not be visited.
  static enter(re) {
    switch (re.op) {
      case Regexp.Op.CAPTURE:
      case Regexp.Op.PLUS:
        // The prefilter of the subexpression
        return { sub: null }

      case Regexp.Op.REPEAT:
        if (re.min >= 1) {
          return { sub: null }
        }
        return { result: new Prefilter(Prefilter.Type.NONE) }

      case Regexp.Op.CONCAT:
        return { pf: new Prefilter(Prefilter.Type.AND), subs: [] }

      case Regexp.Op.ALTERNATE:
        return { pf: new Prefilter(Prefilter.Type.OR), subs: [] }

      default:
        // Lookbehinds, anchors, classes and everything else require no particular string
        return { result: new Prefilter(Prefilter.Type.NONE) }
    }
  }

  static child(re, state, s) {
    if (state.subs === void 0) {
      state.sub = s
      return
    }
    if (state.pf.type === Prefilter.Type.AND) {
      if (s.type === Prefilter.Type.NONE) {
        return
      }
      if (s.type === Prefilter.Type.AND) {
        for (let j = 0; j < s.subs.length; j++) {
          state.subs.push(s.subs[j])
        }
        return
      }
      state.subs.push(s)
      return
    }
    // OR
    if (s.type === Prefilter.Type.NONE) {
      // If any branch of an OR has no requirements, the whole OR has no requirements
      state.result = new Prefilter(Prefilter.Type.NONE)
      return
    }
    if (s.type === Prefilter.Type.OR) {
      for (let j = 0; j < s.subs.length; j++) {
        state.subs.push(s.subs[j])
      }
      return
    }
    state.subs.push(s)
  }

  static leave(re, state) {
    if (state.subs === void 0) {
      return state.sub
    }
    const pf = state.pf
    const newSubs = state.subs
    if (newSubs.length === 0) return new Prefilter(Prefilter.Type.NONE)
    if (newSubs.length === 1) return newSubs[0]

    if (pf.type === Prefilter.Type.AND) {
      pf.subs = newSubs
      return pf
    }

    // De-duplicate EXACT branches
    const seen = new Set()
    const uniqueSubs = []
    for (const sub of newSubs) {
      if (sub.type === Prefilter.Type.EXACT) {
        if (!seen.has(sub.str)) {
          seen.add(sub.str)
          uniqueSubs.push(sub)
        }
      } else {
        uniqueSubs.push(sub)
      }
    }
    pf.subs = uniqueSubs

    // Build an Aho-Corasick automaton if all children are exact matches
    let allExact = true
    for (const sub of uniqueSubs) {
      if (sub.type !== Prefilter.Type.EXACT) {
        allExact = false
        break
      }
    }

    if (allExact && uniqueSubs.length > 1) {
      const words16 = uniqueSubs.map((s) => {
        const arr = []
        for (let i = 0; i < s.str.length; i++) {
          arr.push(s.str.charCodeAt(i))
        }
        return arr
      })
      pf.ac16 = new AhoCorasick(words16)

      const words8 = uniqueSubs.map((s) => s.bytes)
      pf.ac8 = new AhoCorasick(words8)
    }

    return pf
  }
}

export { Prefilter, PrefilterTree }
