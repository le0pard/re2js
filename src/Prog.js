/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
/**
 * A Prog is a compiled regular expression program.
 * @class
 */
import { RE2Flags } from './RE2Flags'
import { Inst } from './Inst'

export class Prog {
  constructor() {
    this.inst = [null, null, null, null, null, null, null, null, null, null]
    this.instSize = 0
    if (this.start === undefined) {
      this.start = 0
    }
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
      this.inst = /* copyOf */ this.inst.slice(0, this.inst.length * 2)
    }
    this.inst[this.instSize] = new Inst(op)
    this.instSize++
  }
  skipNop(pc) {
    let i = this.inst[pc]
    while (i.op === Inst.NOP || i.op === Inst.CAPTURE) {
      {
        i = this.inst[pc]
        pc = i.out
      }
    }

    return i
  }
  prefix(prefix) {
    let i = this.skipNop(this.start)
    if (!Inst.isRuneOp(i.op) || i.runes.length !== 1) {
      return i.op === Inst.MATCH
    }
    while (Inst.isRuneOp(i.op) && i.runes.length === 1 && (i.arg & RE2Flags.FOLD_CASE) === 0) {
      {
        prefix += String.fromCodePoint(i.runes[0])
        i = this.skipNop(i.out)
      }
    }

    return i.op === Inst.MATCH
  }
  startCond() {
    let flag = 0
    let pc = this.start
    loop: for (;;) {
      {
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
    }
    return flag
  }
  next(l) {
    const i = this.inst[l >> 1]
    if ((l & 1) === 0) {
      return i.out
    }
    return i.arg
  }
  patch(l, val) {
    while (l !== 0) {
      {
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
      {
        const next = this.next(last)
        if (next === 0) {
          break
        }
        last = next
      }
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
    const out = {
      str: '',
      toString: function () {
        return this.str
      }
    }
    for (let pc = 0; pc < this.instSize; ++pc) {
      {
        const len = out.str.length
        /* append */ ;((sb) => {
          sb.str += pc
          return sb
        })(out)
        if (pc === this.start) {
          /* append */ ;((sb) => {
            sb.str += '*'
            return sb
          })(out)
        }
        /* append */ ;((sb) => {
          sb.str += '\n'
          return sb
        })(
          /* append */ ((sb) => {
            sb.str += this.inst[pc]
            return sb
          })(
            /* append */ ((sb) => {
              sb.str += '        '.substring(/* length */ out.str.length - len)
              return sb
            })(out)
          )
        )
      }
    }
    return /* toString */ out.str
  }
}
Prog['__class'] = 'quickstart.Prog'
