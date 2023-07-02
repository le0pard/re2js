import { RE2Flags } from './RE2Flags'
import { Inst } from './Inst'
/**
 * A Prog is a compiled regular expression program.
 */
class Prog {
  constructor() {
    this.inst = []
    this.start = 0 // index of start instruction
    // number of CAPTURE insts in re
    // 2 => implicit ( and ) for whole match $0
    this.numCap = 2
  }

  // Returns the instruction at the specified pc.
  // Precondition: pc > 0 && pc < numInst().
  getInst(pc) {
    return this.inst[pc]
  }

  // Returns the number of instructions in this program.
  numInst() {
    return this.inst.length
  }

  // Adds a new instruction to this program, with operator |op| and |pc| equal
  // to |numInst()|.
  addInst(op) {
    this.inst.push(new Inst(op))
  }

  // skipNop() follows any no-op or capturing instructions and returns the
  // resulting instruction.
  skipNop(pc) {
    let i = this.inst[pc]

    while (i.op === Inst.NOP || i.op === Inst.CAPTURE) {
      i = this.inst[pc]
      pc = i.out
    }

    return i
  }

  // prefix() returns a pair of a literal string that all matches for the
  // regexp must start with, and a boolean which is true if the prefix is the
  // entire match.  The string is returned by appending to |prefix|.
  prefix() {
    let prefix = ''
    let i = this.skipNop(this.start)

    if (!Inst.isRuneOp(i.op) || i.runes.length !== 1) {
      return [i.op === Inst.MATCH, prefix]
    }

    while (Inst.isRuneOp(i.op) && i.runes.length === 1 && (i.arg & RE2Flags.FOLD_CASE) === 0) {
      prefix += String.fromCodePoint(i.runes[0])
      i = this.skipNop(i.out)
    }

    return [i.op === Inst.MATCH, prefix]
  }

  // startCond() returns the leading empty-width conditions that must be true
  // in any match.  It returns -1 (all bits set) if no matches are possible.
  startCond() {
    let flag = 0
    let pc = this.start
    loop: for (;;) {
      const i = this.inst[pc]
      switch (i.op) {
        case Inst.EMPTY_WIDTH:
          flag |= i.arg
          break
        case Inst.FAIL:
          return -1
        case Inst.CAPTURE:
        case Inst.NOP:
          break
        default:
          break loop
      }
      pc = i.out
    }
    return flag
  }

  // --- Patch list ---

  // A patchlist is a list of instruction pointers that need to be filled in
  // (patched).  Because the pointers haven't been filled in yet, we can reuse
  // their storage to hold the list.  It's kind of sleazy, but works well in
  // practice.  See http://swtch.com/~rsc/regexp/regexp1.html for inspiration.

  // These aren't really pointers: they're integers, so we can reinterpret them
  // this way without using package unsafe.  A value l denotes p.inst[l>>1].out
  // (l&1==0) or .arg (l&1==1).  l == 0 denotes the empty list, okay because we
  // start every program with a fail instruction, so we'll never want to point
  // at its output link.

  next(l) {
    const i = this.inst[l >> 1]
    if ((l & 1) === 0) {
      return i.out
    }
    return i.arg
  }

  patch(l, val) {
    while (l !== 0) {
      const i = this.inst[l >> 1]
      if ((l & 1) === 0) {
        l = i.out
        i.out = val
      } else {
        l = i.arg
        i.arg = val
      }
    }
  }

  append(l1, l2) {
    if (l1 === 0) {
      return l2
    }

    if (l2 === 0) {
      return l1
    }

    let last = l1
    for (;;) {
      const next = this.next(last)
      if (next === 0) {
        break
      }
      last = next
    }

    const i = this.inst[last >> 1]
    if ((last & 1) === 0) {
      i.out = l2
    } else {
      i.arg = l2
    }

    return l1
  }
  /**
   *
   * @return {string}
   */
  toString() {
    let out = ''
    for (let pc = 0; pc < this.inst.length; pc++) {
      const len = out.length
      out += pc
      if (pc === this.start) {
        out += '*'
      }
      out += '        '.substring(out.length - len)
      out += this.inst[pc]
      out += '\n'
    }
    return out
  }
}

export { Prog }
