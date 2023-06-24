import { RE2Flags } from './RE2Flags'
import { Compiler } from './Compiler'
import { Machine } from './Machine'
import { MachineInput } from './MachineInput'
import { MatcherInput } from './MatcherInput'
import { Parser } from './Parser'
import { Simplify } from './Simplify'
import { Utils } from './Utils'

class AtomicReference {
  constructor(initialValue) {
    this._value = initialValue
  }

  // Returns the current value
  get() {
    return this._value
  }

  // Sets to the given value
  set(newValue) {
    this._value = newValue
  }

  // Atomically sets to the given value and returns true if the current value == the expected value
  compareAndSet(expect, update) {
    if (this._value === expect) {
      this._value = update
      return true
    } else {
      return false
    }
  }
}

class RE2 {
  constructor(expr, prog, numSubexp, longest) {
    this.expr = expr
    this.prog = prog
    this.numSubexp = numSubexp
    this.cond = prog.startCond()
    this.longest = longest

    this.prefix = ''
    this.prefixUTF8 = ''
    this.prefixComplete = false
    this.prefixRune = 0
    this.pooled = (new AtomicReference())
    this.namedGroups = new Map()
  }

  _copyFrom(re2) {
    // Copy everything.
    this.expr = re2.expr
    this.prog = re2.prog
    this.cond = re2.cond
    this.numSubexp = re2.numSubexp
    this.longest = re2.longest
    this.prefix = re2.prefix
    this.prefixUTF8 = re2.prefixUTF8
    this.prefixComplete = re2.prefixComplete
    this.prefixRune = re2.prefixRune
  }

  static compile(expr) {
    return this.compileImpl(expr, RE2Flags.PERL, /*longest=*/ false)
  }

  static compilePOSIX(expr) {
    return this.compileImpl(expr, RE2Flags.POSIX, /*longest=*/ true)
  }

  static compileImpl(expr, mode, longest) {
    let re = Parser.parse(expr, mode)
    let maxCap = re.maxCap() // (may shrink during simplify)
    re = Simplify.simplify(re)
    const prog = Compiler.compileRegexp(re)
    const re2 = new RE2(expr, prog, maxCap, longest)
    let prefixBuilder = ''
    re2.prefixComplete = prog.prefix(prefixBuilder)
    re2.prefix = prefixBuilder
    re2.prefixUTF8 = new TextEncoder().encode(re2.prefix)
    if (re2.prefix !== '') {
      re2.prefixRune = re2.prefix.codePointAt(0)
    }
    re2.namedGroups = re.namedGroups
    return re2
  }

  numberOfCapturingGroups() {
    return this.numSubexp
  }

  get() {
    let head
    do {
      {
        head = this.pooled.get()
      }
    } while ((head != null && !this.pooled.compareAndSet(head, head.next)))
    return head
  }
  reset() {
    this.pooled.set(null)
  }
  put(m, isNew) {
    let head
    do {
      {
        head = this.pooled.get()
        if (!isNew && head != null) {
          m = new Machine(m)
          isNew = true
        }
        if (m.next !== head) {
          m.next = head
        }
      }
    } while ((!this.pooled.compareAndSet(head, m)))
  }

  toString() {
    return this.expr
  }

  doExecute(__in, pos, anchor, ncap) {
    let m = this.get()
    let isNew = false
    if (m == null) {
      m = new Machine(this)
      isNew = true
    } else if (m.next != null) {
      m = new Machine(m)
      isNew = true
    }
    m.init(ncap)
    const cap = m.match(__in, pos, anchor) ? m.submatches() : null
    this.put(m, isNew)
    return cap
  }

  match(input, start = 0, end = 0, anchor = null, group = null, ngroup = null) {
    if (input !== null && input instanceof MatcherInput) {
      if (start > end) {
        return false
      }
      const machineInput =
        input.getEncoding() === MatcherInput.ENCODING.UTF_16
          ? MachineInput.fromUTF16(input.asCharSequence(), 0, end)
          : MachineInput.fromUTF8(input.asBytes(), 0, end)
      const groupMatch = this.doExecute(machineInput, start, anchor, 2 * ngroup)

      if (groupMatch === null) {
        return false
      }

      if (group !== null) {
        group.splice(0, group.length, ...groupMatch)
      }
      return true
    }

    return this.doExecute(MachineInput.fromUTF16(input), 0, RE2Flags.UNANCHORED, 0) !== null
  }

  matchUTF8(b) {
    return this.doExecute(MachineInput.fromUTF8(b), 0, RE2Flags.UNANCHORED, 0) !== null
  }

  static match(pattern, s) {
    return RE2.compile(pattern).match(s)
  }

  replaceAll(src, repl) {
    return this.replaceAllFunc(
      src,
      function(orig) { return repl },
      2 * src.length + 1
    )
    // TODO: Is the reasoning correct, there can be at the most 2*len +1
    // replacements. Basically [a-z]*? abc x will be xaxbcx. So should it be
    // len + 1 or 2*len + 1.
  }

  replaceFirst(src, repl) {
    return this.replaceAllFunc(
      src,
      function(orig) { return repl },
      1
    )
  }

  replaceAllFunc(src, repl, maxReplaces) {
    let lastMatchEnd = 0 // end position of the most recent match
    let searchPos = 0 // position where we next look for a match
    let buf = []
    let input = MachineInput.fromUTF16(src)
    let numReplaces = 0
    while (searchPos <= src.length) {
      let a = this.doExecute(input, searchPos, RE2Flags.UNANCHORED, 2)
      if (a === null || a.length === 0) {
        break // no more matches
      }

      // Copy the unmatched characters before this match.
      buf.push(src.substring(lastMatchEnd, a[0]))

      // Now insert a copy of the replacement string, but not for a
      // match of the empty string immediately after another match.
      if (a[1] > lastMatchEnd || a[0] === 0) {
        buf.push(repl(src.substring(a[0], a[1])))
        ++numReplaces
      }
      lastMatchEnd = a[1]

      // Advance past this match; always advance at least one character.
      let width = input.step(searchPos) & 0x7
      if (searchPos + width > a[1]) {
        searchPos += width
      } else if (searchPos + 1 > a[1]) {
        // This clause is only needed at the end of the input
        // string.  In that case, DecodeRuneInString returns width=0.
        searchPos++
      } else {
        searchPos = a[1]
      }
      if (numReplaces >= maxReplaces) {
        // Should never be greater though.
        break
      }
    }

    // Copy the unmatched characters after the last match.
    buf.push(src.substring(lastMatchEnd))

    return buf.join('')
  }

  pad(a) {
    if (a === null) {
      return null // No match.
    }
    let n = (1 + this.numSubexp) * 2
    if (a.length < n) {
      let a2 = new Array(n).fill(-1)
      a2.splice(0, a.length, ...a)
      a = a2
    }
    return a
  }

  allMatches(input, n, deliver) {
    let end = input.endPos()
    if (n < 0) {
      n = end + 1
    }
    for (let pos = 0, i = 0, prevMatchEnd = -1; i < n && pos <= end;) {
      let matches = this.doExecute(input, pos, RE2Flags.UNANCHORED, this.prog.numCap)
      if (matches === null || matches.length === 0) {
        break
      }

      let accept = true
      if (matches[1] === pos) {
        // We've found an empty match.
        if (matches[0] === prevMatchEnd) {
          // We don't allow an empty match right
          // after a previous match, so ignore it.
          accept = false
        }
        let r = input.step(pos)
        if (r < 0) { // EOF
          pos = end + 1
        } else {
          pos += r & 0x7
        }
      } else {
        pos = matches[1]
      }
      prevMatchEnd = matches[1]

      if (accept) {
        deliver(this.pad(matches))
        i++
      }
    }
  }

  findUTF8(b) {
    let a = this.doExecute(MachineInput.fromUTF8(b), 0, RE2Flags.UNANCHORED, 2)
    if (a === null) {
      return null
    }
    return Utils.subarray(b, a[0], a[1])
  }

  findUTF8Index(b) {
    let a = this.doExecute(MachineInput.fromUTF8(b), 0, RE2Flags.UNANCHORED, 2)
    if (a === null) {
      return null
    }
    return Utils.subarray(a, 0, 2)
  }

  find(s) {
    let a = this.doExecute(MachineInput.fromUTF16(s), 0, RE2Flags.UNANCHORED, 2)
    if (a === null) {
      return ''
    }
    return s.substring(a[0], a[1])
  }

  findIndex(s) {
    return this.doExecute(MachineInput.fromUTF16(s), 0, RE2Flags.UNANCHORED, 2)
  }

  findUTF8Submatch(b) {
    let a = this.doExecute(MachineInput.fromUTF8(b), 0, RE2Flags.UNANCHORED, this.prog.numCap)
    if (a === null) {
      return null
    }
    let ret = new Array(1 + this.numSubexp)
    for (let i = 0; i < ret.length; i++) {
      if (2 * i < a.length && a[2 * i] >= 0) {
        ret[i] = Utils.subarray(b, a[2 * i], a[2 * i + 1])
      }
    }
    return ret
  }

  findUTF8SubmatchIndex(b) {
    return this.pad(this.doExecute(MachineInput.fromUTF8(b), 0, RE2Flags.UNANCHORED, this.prog.numCap))
  }

  findSubmatch(s) {
    let a = this.doExecute(MachineInput.fromUTF16(s), 0, RE2Flags.UNANCHORED, this.prog.numCap)
    if (a === null) {
      return null
    }
    let ret = new Array(1 + this.numSubexp)
    for (let i = 0; i < ret.length; i++) {
      if (2 * i < a.length && a[2 * i] >= 0) {
        ret[i] = s.substring(a[2 * i], a[2 * i + 1])
      }
    }
    return ret
  }

  findSubmatchIndex(s) {
    return this.pad(this.doExecute(MachineInput.fromUTF16(s), 0, RE2Flags.UNANCHORED, this.prog.numCap))
  }

  findAllUTF8(b, n) {
    let result = []
    this.allMatches(MachineInput.fromUTF8(b), n, (match) => {
      result.push(Utils.subarray(b, match[0], match[1]))
    })
    if (result.length === 0) {
      return null
    }
    return result
  }

  findAllUTF8Index(b, n) {
    let result = []
    this.allMatches(MachineInput.fromUTF8(b), n, (match) => {
      result.push(Utils.subarray(match, 0, 2))
    })
    if (result.length === 0) {
      return null
    }
    return result
  }

  findAll(s, n) {
    let result = []
    this.allMatches(MachineInput.fromUTF16(s), n, (match) => {
      result.push(s.substring(match[0], match[1]))
    })
    if (result.length === 0) {
      return null
    }
    return result
  }

  findAllIndex(s, n) {
    let result = []
    this.allMatches(MachineInput.fromUTF16(s), n, (match) => {
      result.push(Utils.subarray(match, 0, 2))
    })
    if (result.length === 0) {
      return null
    }
    return result
  }

  findAllUTF8Submatch(b, n) {
    let result = []
    this.allMatches(MachineInput.fromUTF8(b), n, (match) => {
      let slice = new Array(Math.floor(match.length / 2))
      for (let j = 0; j < slice.length; ++j) {
        if (match[2 * j] >= 0) {
          slice[j] = Utils.subarray(b, match[2 * j], match[2 * j + 1])
        }
      }
      result.push(slice)
    })
    if (result.length === 0) {
      return null
    }
    return result
  }

  findAllUTF8SubmatchIndex(b, n) {
    let result = []
    this.allMatches(MachineInput.fromUTF8(b), n, (match) => {
      result.push(match)
    })
    if (result.length === 0) {
      return null
    }
    return result
  }

  findAllSubmatch(s, n) {
    let result = []
    this.allMatches(MachineInput.fromUTF16(s), n, (match) => {
      let slice = new Array(Math.floor(match.length / 2))
      for (let j = 0; j < slice.length; ++j) {
        if (match[2 * j] >= 0) {
          slice[j] = s.substring(match[2 * j], match[2 * j + 1])
        }
      }
      result.push(slice)
    })
    if (result.length === 0) {
      return null
    }
    return result
  }

  findAllSubmatchIndex(s, n) {
    let result = []
    this.allMatches(MachineInput.fromUTF16(s), n, (match) => {
      result.push(match)
    })
    if (result.length === 0) {
      return null
    }
    return result
  }
}

export { RE2 }
