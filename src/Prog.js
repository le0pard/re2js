import { Re2Flags } from './RE2Flags'
import { Inst } from './Inst'

class Prog {
  constructor() {
    this.inst = Array(10).fill(null)
    this.instSize = 0
    this.start = 0
    this.numCap = 2
  }

  getInst(pc) {
    return this.inst[pc]
  }

  numInst() {
    return this.instSize
  }

  addInst(op) {
    if (this.instSize >= this.inst.length) {
      this.inst = [...this.inst, ...Array(this.inst.length).fill(null)]
    }
    this.inst[this.instSize] = new Inst(op)
    this.instSize++
  }

  skipNop(pc) {
    let i = this.inst[pc]
    while (i.op === Inst.NOP || i.op === Inst.CAPTURE) {
      i = this.inst[pc]
      pc = i.out
    }
    return i
  }

  prefix(prefix) {
    let i = this.skipNop(this.start)
    if (!Inst.isRuneOp(i.op) || i.runes.length !== 1) {
      return i.op === Inst.MATCH
    }

    while (Inst.isRuneOp(i.op) && i.runes.length === 1 && (i.arg & Re2Flags.FOLD_CASE) === 0) {
      prefix.appendCodePoint(i.runes[0])
      i = this.skipNop(i.out)
    }
    return i.op === Inst.MATCH
  }

  startCond() {
    let flag = 0
    let pc = this.start
    loop:
    for (; ;) {
      let i = this.inst[pc]
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

  next(l) {
    let i = this.inst[l >> 1]
    if ((l & 1) === 0) {
      return i.out
    }
    return i.arg
  }

  patch(l, val) {
    while (l !== 0) {
      let i = this.inst[l >> 1]
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
    for (; ;) {
      let next = this.next(last)
      if (next === 0) {
        break
      }
      last = next
    }
    let i = this.inst[last >> 1]
    if ((last & 1) === 0) {
      i.out = l2
    } else {
      i.arg = l2
    }
    return l1
  }

  toString() {
    let out = ''
    for (let pc = 0; pc < this.instSize; ++pc) {
      let len = out.length
      out += pc
      if (pc === this.start) {
        out += '*'
      }
      out += '        '.substring(out.length - len) + this.inst[pc] + '\n'
    }
    return out
  }
}

export { Prog }
