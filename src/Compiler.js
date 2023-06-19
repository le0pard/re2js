import { Regexp } from './Regexp'
import { Prog } from './Prog'
import { Inst } from './Inst'
import { Unicode } from './Unicode'
import { Utils } from './Utils'
import { RE2Flags } from './RE2Flags'

class Frag {
  constructor(i = 0, out = 0, nullable = false) {
    this.i = i
    this.out = out
    this.nullable = nullable
  }
}

class Compiler {
  static ANY_RUNE_NOT_NL = [0, '\n'.codePointAt(0) - 1, '\n'.codePointAt(0) + 1, Unicode.MAX_RUNE]
  static ANY_RUNE = [0, Unicode.MAX_RUNE]

  constructor() {
    this.prog = new Prog() // Program being built
    this.newInst(Inst.FAIL) // always the first instruction
  }

  static compileRegexp(re) {
    let c = new Compiler()
    let f = c.compile(re)
    c.prog.patch(f.out, c.newInst(Inst.MATCH).i)
    c.prog.start = f.i
    return c.prog
  }

  newInst(op) {
    // TODO: impose length limit.
    this.prog.addInst(op)
    return new Frag(this.prog.numInst() - 1, 0, true)
  }

  // Returns a no-op fragment.  Sometimes unavoidable.
  nop() {
    let f = this.newInst(Inst.NOP)
    f.out = f.i << 1
    return f
  }

  fail() {
    return new Frag()
  }

  cap(arg) {
    let f = this.newInst(Inst.CAPTURE)
    f.out = f.i << 1
    this.prog.getInst(f.i).arg = arg
    if (this.prog.numCap < arg + 1) {
      this.prog.numCap = arg + 1
    }
    return f
  }

  cat(f1, f2) {
    // concat of failure is failure
    if (f1.i === 0 || f2.i === 0) {
      return this.fail()
    }
    // TODO: elide nop
    this.prog.patch(f1.out, f2.i)
    return new Frag(f1.i, f2.out, f1.nullable && f2.nullable)
  }

  alt(f1, f2) {
    // alt of failure is other
    if (f1.i === 0) {
      return f2
    }
    if (f2.i === 0) {
      return f1
    }
    let f = this.newInst(Inst.ALT)
    let i = this.prog.getInst(f.i)
    i.out = f1.i
    i.arg = f2.i
    f.out = this.prog.append(f1.out, f2.out)
    f.nullable = f1.nullable || f2.nullable
    return f
  }

  loop(f1, nongreedy) {
    let f = this.newInst(Inst.ALT)
    let i = this.prog.getInst(f.i)
    if (nongreedy) {
      i.arg = f1.i
      f.out = f.i << 1
    } else {
      i.out = f1.i
      f.out = f.i << 1 | 1
    }
    this.prog.patch(f1.out, f.i)
    return f
  }

  quest(f1, nongreedy) {
    let f = this.newInst(Inst.ALT)
    let i = this.prog.getInst(f.i)
    if (nongreedy) {
      i.arg = f1.i
      f.out = f.i << 1
    } else {
      i.out = f1.i
      f.out = f.i << 1 | 1
    }
    this.prog.patch(f1.out, f.i)
    f.nullable = true
    return f
  }

  star(f1, nongreedy) {
    let f = this.loop(f1, nongreedy)
    f.nullable = true
    return f
  }

  plus(f1, nongreedy) {
    return this.cat(f1, this.loop(f1, nongreedy))
  }

  empty(op) {
    let f = this.newInst(op)
    f.out = f.i << 1
    return f
  }

  rune(rune, flags) {
    let f = this.newInst(Inst.RUNE)
    let i = this.prog.getInst(f.i)
    i.runes = rune
    i.flags = flags
    f.out = f.i << 1
    f.nullable = false
    return f
  }

  compile(re) {
    switch (re.op) {
      case Regexp.Op.NO_MATCH:
        return this.fail()
      case Regexp.Op.EMPTY_MATCH:
        return this.nop()
      case Regexp.Op.LITERAL: {
        if (re.runes.length === 0) {
          return this.nop()
        } else {
          let f = null
          for (let r of re.runes) {
            let f1 = this.rune(r, re.flags)
            f = f ? this.cat(f, f1) : f1
          }
          return f
        }
      }
      case Regexp.Op.CHAR_CLASS:
        return this.rune(re.runes, re.flags)
      case Regexp.Op.ANY_CHAR_NOT_NL:
        return this.rune(Compiler.ANY_RUNE_NOT_NL, 0)
      case Regexp.Op.ANY_CHAR:
        return this.rune(Compiler.ANY_RUNE, 0)
      case Regexp.Op.BEGIN_LINE:
        return this.empty(Utils.EMPTY_BEGIN_LINE)
      case Regexp.Op.END_LINE:
        return this.empty(Utils.EMPTY_END_LINE)
      case Regexp.Op.BEGIN_TEXT:
        return this.empty(Utils.EMPTY_BEGIN_TEXT)
      case Regexp.Op.END_TEXT:
        return this.empty(Utils.EMPTY_END_TEXT)
      case Regexp.Op.WORD_BOUNDARY:
        return this.empty(Utils.EMPTY_WORD_BOUNDARY)
      case Regexp.Op.NO_WORD_BOUNDARY:
        return this.empty(Utils.EMPTY_NO_WORD_BOUNDARY)
      case Regexp.Op.CAPTURE: {
        const bra = this.cap(re.cap << 1)
        const sub = this.compile(re.subs[0])
        const ket = this.cap(re.cap << 1 | 1)
        return this.cat(this.cat(bra, sub), ket)
      }
      case Regexp.Op.STAR:
        return this.star(this.compile(re.subs[0]), (re.flags & RE2Flags.NON_GREEDY) !== 0)
      case Regexp.Op.PLUS:
        return this.plus(this.compile(re.subs[0]), (re.flags & RE2Flags.NON_GREEDY) !== 0)
      case Regexp.Op.QUEST:
        return this.quest(this.compile(re.subs[0]), (re.flags & RE2Flags.NON_GREEDY) !== 0)
      case Regexp.Op.CONCAT:
        if (re.subs.length === 0) {
          return this.nop()
        } else {
          let f = null
          for (let sub of re.subs) {
            let f1 = this.compile(sub)
            f = f ? this.cat(f, f1) : f1
          }
          return f
        }
      case Regexp.Op.ALTERNATE:
        if (re.subs.length === 0) {
          return this.nop()
        } else {
          let f = null
          for (let sub of re.subs) {
            let f1 = this.compile(sub)
            f = f ? this.alt(f, f1) : f1
          }
          return f
        }
      default:
        throw new Error('regexp: unhandled case in compile')
    }
  }
}

export { Compiler }
