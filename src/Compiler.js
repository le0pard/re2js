import { Codepoint } from './Codepoint'
import { RE2Flags } from './RE2Flags'
import { Unicode } from './Unicode'
import { Utils } from './Utils'
import { Regexp } from './Regexp'
import { Inst } from './Inst'
import { Prog } from './Prog'

/**
 * A fragment of a compiled regular expression program.
 *
 * @see http://swtch.com/~rsc/regexp/regexp1.html
 * @class
 */
class Frag {
  constructor(i = 0, out = 0, nullable = false) {
    this.i = i // an instruction address (pc).
    this.out = out // a patch list; see explanation in Prog.js
    this.nullable = nullable // whether the fragment can match the empty string
  }
}
/**
 * Compiler from {@code Regexp} (RE2 abstract syntax) to {@code RE2} (compiled regular expression).
 *
 * The only entry point is {@link #compileRegexp}.
 */
class Compiler {
  static ANY_RUNE_NOT_NL() {
    return [0, Codepoint.CODES.get('\n') - 1, Codepoint.CODES.get('\n') + 1, Unicode.MAX_RUNE]
  }

  static ANY_RUNE() {
    return [0, Unicode.MAX_RUNE]
  }

  static compileRegexp(re) {
    const c = new Compiler()
    const f = c.compile(re)
    c.prog.patch(f.out, c.newInst(Inst.MATCH).i)
    c.prog.start = f.i
    return c.prog
  }

  constructor() {
    this.prog = new Prog()
    this.newInst(Inst.FAIL)
  }

  newInst(op) {
    this.prog.addInst(op)
    return new Frag(this.prog.numInst() - 1, 0, true)
  }

  // Returns a no-op fragment.  Sometimes unavoidable.
  nop() {
    const f = this.newInst(Inst.NOP)
    f.out = f.i << 1
    return f
  }

  fail() {
    return new Frag()
  }

  // Given fragment a, returns (a) capturing as \n.
  // Given a fragment a, returns a fragment with capturing parens around a.
  cap(arg) {
    const f = this.newInst(Inst.CAPTURE)
    f.out = f.i << 1
    this.prog.getInst(f.i).arg = arg
    if (this.prog.numCap < arg + 1) {
      this.prog.numCap = arg + 1
    }
    return f
  }

  // Given fragments a and b, returns ab; a|b
  cat(f1, f2) {
    // concat of failure is failure
    if (f1.i === 0 || f2.i === 0) {
      return this.fail()
    }
    // TODO(rsc): elide nop
    this.prog.patch(f1.out, f2.i)
    return new Frag(f1.i, f2.out, f1.nullable && f2.nullable)
  }

  // Given fragments for a and b, returns fragment for a|b.
  alt(f1, f2) {
    // alt of failure is other
    if (f1.i === 0) {
      return f2
    }
    if (f2.i === 0) {
      return f1
    }
    const f = this.newInst(Inst.ALT)
    const i = this.prog.getInst(f.i)
    i.out = f1.i
    i.arg = f2.i
    f.out = this.prog.append(f1.out, f2.out)
    f.nullable = f1.nullable || f2.nullable
    return f
  }

  // loop returns the fragment for the main loop of a plus or star.
  // For plus, it can be used directly. with f1.i as the entry.
  // For star, it can be used directly when f1 can't match an empty string.
  // (When f1 can match an empty string, f1* must be implemented as (f1+)?
  // to get the priority match order correct.)
  loop(f1, nongreedy) {
    const f = this.newInst(Inst.ALT)
    const i = this.prog.getInst(f.i)
    if (nongreedy) {
      i.arg = f1.i
      f.out = f.i << 1
    } else {
      i.out = f1.i
      f.out = (f.i << 1) | 1
    }
    this.prog.patch(f1.out, f.i)
    return f
  }

  // Given a fragment for a, returns a fragment for a? or a?? (if nongreedy)
  quest(f1, nongreedy) {
    const f = this.newInst(Inst.ALT)
    const i = this.prog.getInst(f.i)
    if (nongreedy) {
      i.arg = f1.i
      f.out = f.i << 1
    } else {
      i.out = f1.i
      f.out = (f.i << 1) | 1
    }
    f.out = this.prog.append(f.out, f1.out)
    return f
  }

  // Given a fragment a, returns a fragment for a* or a*? (if nongreedy)
  star(f1, nongreedy) {
    if (f1.nullable) {
      return this.quest(this.plus(f1, nongreedy), nongreedy)
    }
    return this.loop(f1, nongreedy)
  }

  // Given a fragment for a, returns a fragment for a+ or a+? (if nongreedy)
  plus(f1, nongreedy) {
    return new Frag(f1.i, this.loop(f1, nongreedy).out, f1.nullable)
  }

  // op is a bitmask of EMPTY_* flags.
  empty(op) {
    const f = this.newInst(Inst.EMPTY_WIDTH)
    this.prog.getInst(f.i).arg = op
    f.out = f.i << 1
    return f
  }

  // flags : parser flags
  rune(runes, flags) {
    const f = this.newInst(Inst.RUNE)
    f.nullable = false
    const i = this.prog.getInst(f.i)
    i.runes = runes
    flags &= RE2Flags.FOLD_CASE
    if (runes.length !== 1 || Unicode.simpleFold(runes[0]) === runes[0]) {
      flags &= ~RE2Flags.FOLD_CASE
    }
    i.arg = flags
    f.out = f.i << 1
    if (
      ((flags & RE2Flags.FOLD_CASE) === 0 && runes.length === 1) ||
      (runes.length === 2 && runes[0] === runes[1])
    ) {
      i.op = Inst.RUNE1
    } else if (runes.length === 2 && runes[0] === 0 && runes[1] === Unicode.MAX_RUNE) {
      i.op = Inst.RUNE_ANY
    } else if (
      runes.length === 4 &&
      runes[0] === 0 &&
      runes[1] === Codepoint.CODES.get('\n') - 1 &&
      runes[2] === Codepoint.CODES.get('\n') + 1 &&
      runes[3] === Unicode.MAX_RUNE
    ) {
      i.op = Inst.RUNE_ANY_NOT_NL
    }
    return f
  }

  compile(re) {
    switch (re.op) {
      case Regexp.Op.NO_MATCH:
        return this.fail()
      case Regexp.Op.EMPTY_MATCH:
        return this.nop()
      case Regexp.Op.LITERAL:
        if (re.runes.length === 0) {
          return this.nop()
        } else {
          let f = null
          for (let r of re.runes) {
            const f1 = this.rune([r], re.flags)
            f = f === null ? f1 : this.cat(f, f1)
          }
          return f
        }
      case Regexp.Op.CHAR_CLASS:
        return this.rune(re.runes, re.flags)
      case Regexp.Op.ANY_CHAR_NOT_NL:
        return this.rune(Compiler.ANY_RUNE_NOT_NL(), 0)
      case Regexp.Op.ANY_CHAR:
        return this.rune(Compiler.ANY_RUNE(), 0)
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
        const ket = this.cap((re.cap << 1) | 1)
        return this.cat(this.cat(bra, sub), ket)
      }
      case Regexp.Op.STAR:
        return this.star(this.compile(re.subs[0]), (re.flags & RE2Flags.NON_GREEDY) !== 0)
      case Regexp.Op.PLUS:
        return this.plus(this.compile(re.subs[0]), (re.flags & RE2Flags.NON_GREEDY) !== 0)
      case Regexp.Op.QUEST:
        return this.quest(this.compile(re.subs[0]), (re.flags & RE2Flags.NON_GREEDY) !== 0)
      case Regexp.Op.CONCAT: {
        if (re.subs.length === 0) {
          return this.nop()
        } else {
          let f = null
          for (let sub of re.subs) {
            const f1 = this.compile(sub)
            f = f === null ? f1 : this.cat(f, f1)
          }
          return f
        }
      }
      case Regexp.Op.ALTERNATE: {
        if (re.subs.length === 0) {
          return this.nop()
        } else {
          let f = null
          for (let sub of re.subs) {
            const f1 = this.compile(sub)
            f = f === null ? f1 : this.alt(f, f1)
          }
          return f
        }
      }
      default:
        throw new Error('regexp: unhandled case in compile')
    }
  }
}

export { Compiler }
