import { Regexp } from './Regexp.js'
import { Utils } from './Utils.js'
import { RE2Flags } from './RE2Flags.js'
import { Unicode } from './Unicode.js'
import { RegexpWalker } from './RegexpWalker.js'

// Single-pass Aho-Corasick matcher reporting whether any of a set of words occurs in the input.
//
// The trie is stored in flat typed arrays: node n's children are childUnit/childNode in
// [childStart[n], childStart[n + 1]), sorted by unit and found by binary search, plus a failure
// link and a match flag per node. This costs a few dozen bytes per node, where one dictionary
// object per node cost about 1.8 KB.
class AhoCorasick {
  // |words| are arrays of code units (UTF-16 units or UTF-8 bytes) below |alphabetSize|.
  constructor(words, alphabetSize) {
    // Build the trie; edges are looked up through a temporary map keyed by (node, unit).
    const edges = new Map()
    const parent = [0]
    const unit = [0]
    const depth = [0]
    const terminal = [0]
    for (const word of words) {
      let node = 0
      for (let i = 0; i < word.length; i++) {
        const key = node * alphabetSize + word[i]
        let child = edges.get(key)
        if (child === void 0) {
          child = parent.length
          edges.set(key, child)
          parent.push(node)
          unit.push(word[i])
          depth.push(depth[node] + 1)
          terminal.push(0)
        }
        node = child
      }
      terminal[node] = 1
    }
    const numNodes = parent.length

    // Children grouped by parent and sorted by unit.
    const children = new Int32Array(numNodes - 1)
    for (let c = 1; c < numNodes; c++) {
      children[c - 1] = c
    }
    children.sort((a, b) => parent[a] - parent[b] || unit[a] - unit[b])
    const childStart = new Int32Array(numNodes + 1)
    for (let c = 1; c < numNodes; c++) {
      childStart[parent[c] + 1]++
    }
    for (let n = 0; n < numNodes; n++) {
      childStart[n + 1] += childStart[n]
    }
    const childUnit = new Int32Array(numNodes - 1)
    for (let k = 0; k < children.length; k++) {
      childUnit[k] = unit[children[k]]
    }
    this.childStart = childStart
    this.childUnit = childUnit
    this.childNode = children

    // Failure links, computed in order of depth (breadth-first).
    const byDepth = new Int32Array(numNodes)
    for (let n = 0; n < numNodes; n++) {
      byDepth[n] = n
    }
    byDepth.sort((a, b) => depth[a] - depth[b])
    const fail = new Int32Array(numNodes)
    const match = Uint8Array.from(terminal)
    for (let k = 1; k < numNodes; k++) {
      const c = byDepth[k]
      const p = parent[c]
      if (p !== 0) {
        let f = fail[p]
        let next = this.next(f, unit[c])
        while (next < 0 && f !== 0) {
          f = fail[f]
          next = this.next(f, unit[c])
        }
        fail[c] = next >= 0 ? next : 0
      }
      match[c] |= match[fail[c]]
    }
    this.fail = fail
    this.match = match
  }

  // Returns the child of |node| for |u|, or -1.
  next(node, u) {
    let lo = this.childStart[node]
    let hi = this.childStart[node + 1]
    const units = this.childUnit
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      const m = units[mid]
      if (m === u) return this.childNode[mid]
      if (m < u) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    return -1
  }

  // Advances the automaton from |node| over unit |u|.
  advance(node, u) {
    for (;;) {
      const next = this.next(node, u)
      if (next >= 0) return next
      if (node === 0) return 0
      node = this.fail[node]
    }
  }

  searchUTF16(charSeq, start, end) {
    let node = 0
    for (let i = start; i < end; i++) {
      node = this.advance(node, charSeq.charCodeAt(i))
      if (this.match[node] === 1) return true
    }
    return false
  }

  searchUTF8(bytes, start, end) {
    let node = 0
    for (let i = start; i < end; i++) {
      node = this.advance(node, bytes[i])
      if (this.match[node] === 1) return true
    }
    return false
  }
}

class Prefilter {
  static Type = { NONE: 0, EXACT: 1, AND: 2, OR: 3 }

  // Upper bound on the number of input scans one evaluation may perform: an EXACT node or an
  // automaton-backed OR is one scan, AND and plain OR nodes cost the sum of their children.
  // Larger prefilters are cut down (AND keeps its first requirements, OR requires nothing), so
  // the check never costs more than a few passes over the input.
  static MAX_SCANS = 32
  // Upper bound on the total length of the words of one Aho-Corasick automaton, in code units.
  static MAX_AC_UNITS = 1 << 18

  constructor(type) {
    this.type = type
    this.subs = []
    this.str = ''
    this.bytes = null
    this.cost = type === Prefilter.Type.EXACT ? 1 : 0
    // OR of EXACT nodes only: evaluated with an Aho-Corasick automaton per encoding, built on
    // first use.
    this.allExact = false
    this.ac16 = null
    this.ac8 = null
  }

  automaton16() {
    if (this.ac16 === null) {
      const words = this.subs.map((s) => {
        const arr = new Array(s.str.length)
        for (let i = 0; i < s.str.length; i++) {
          arr[i] = s.str.charCodeAt(i)
        }
        return arr
      })
      this.ac16 = new AhoCorasick(words, 0x10000)
    }
    return this.ac16
  }

  automaton8() {
    if (this.ac8 === null) {
      this.ac8 = new AhoCorasick(
        this.subs.map((s) => s.bytes),
        0x100
      )
    }
    return this.ac8
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
        if (this.allExact) {
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
      if (Unicode.isUnsearchable(re.runes[i])) {
        // U+FFFD and surrogates cannot be required as a plain string (see Prog.prefix).
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

    // Drop repeated EXACT requirements: in an AND they add nothing, in an OR they are the
    // same alternative.
    const seen = new Set()
    const subs = []
    for (const sub of state.subs) {
      if (sub.type === Prefilter.Type.EXACT) {
        if (seen.has(sub.str)) {
          continue
        }
        seen.add(sub.str)
      }
      subs.push(sub)
    }

    if (pf.type === Prefilter.Type.AND) {
      // Keep the first requirements up to the scan budget: any subset of them is still a
      // necessary condition for a match.
      const kept = []
      let cost = 0
      for (const sub of subs) {
        if (cost + sub.cost > Prefilter.MAX_SCANS) {
          continue
        }
        kept.push(sub)
        cost += sub.cost
      }
      if (kept.length === 0) return new Prefilter(Prefilter.Type.NONE)
      if (kept.length === 1) return kept[0]
      pf.subs = kept
      pf.cost = cost
      return pf
    }

    // OR
    if (subs.length === 0) return new Prefilter(Prefilter.Type.NONE)
    if (subs.length === 1) return subs[0]
    pf.subs = subs

    let allExact = true
    let cost = 0
    let units = 0
    for (const sub of subs) {
      if (sub.type !== Prefilter.Type.EXACT) {
        allExact = false
      } else {
        units += sub.bytes.length
      }
      cost += sub.cost
    }

    if (allExact) {
      // One pass with an Aho-Corasick automaton, built on first evaluation.
      if (units > Prefilter.MAX_AC_UNITS) {
        return new Prefilter(Prefilter.Type.NONE)
      }
      pf.allExact = true
      pf.cost = 1
      return pf
    }

    // Every alternative is checked in turn: give up on prefiltering if that is too many scans.
    if (cost > Prefilter.MAX_SCANS) {
      return new Prefilter(Prefilter.Type.NONE)
    }
    pf.cost = cost
    return pf
  }
}

export { Prefilter, PrefilterTree, AhoCorasick }
