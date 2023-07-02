/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
/**
 * A single instruction in the regular expression virtual machine.
 *
 * @see http://swtch.com/~rsc/regexp/regexp2.html
 * @class
 */
import { RE2Flags } from './RE2Flags'
import { Utils } from './Utils'
import { Unicode } from './Unicode'

export class Inst {
  constructor(op) {
    if (this.op === undefined) {
      this.op = 0
    }
    if (this.out === undefined) {
      this.out = 0
    }
    if (this.arg === undefined) {
      this.arg = 0
    }
    if (this.runes === undefined) {
      this.runes = null
    }
    this.op = op
  }
  static isRuneOp(op) {
    return Inst.RUNE <= op && op <= Inst.RUNE_ANY_NOT_NL
  }
  matchRune(r) {
    if (this.runes.length === 1) {
      const r0 = this.runes[0]
      if ((this.arg & RE2Flags.FOLD_CASE) !== 0) {
        return Unicode.equalsIgnoreCase(r0, r)
      }
      return r === r0
    }
    for (let j = 0; j < this.runes.length && j <= 8; j += 2) {
      {
        if (r < this.runes[j]) {
          return false
        }
        if (r <= this.runes[j + 1]) {
          return true
        }
      }
    }
    for (let lo = 0, hi = (this.runes.length / 2) | 0; lo < hi; ) {
      {
        const m = lo + (((hi - lo) / 2) | 0)
        const c = this.runes[2 * m]
        if (c <= r) {
          if (r <= this.runes[2 * m + 1]) {
            return true
          }
          lo = m + 1
        } else {
          hi = m
        }
      }
    }
    return false
  }
  /**
   *
   * @return {string}
   */
  toString() {
    switch (this.op) {
      case 1 /* ALT */:
        return 'alt -> ' + this.out + ', ' + this.arg
      case 2 /* ALT_MATCH */:
        return 'altmatch -> ' + this.out + ', ' + this.arg
      case 3 /* CAPTURE */:
        return 'cap ' + this.arg + ' -> ' + this.out
      case 4 /* EMPTY_WIDTH */:
        return 'empty ' + this.arg + ' -> ' + this.out
      case 6 /* MATCH */:
        return 'match'
      case 5 /* FAIL */:
        return 'fail'
      case 7 /* NOP */:
        return 'nop -> ' + this.out
      case 8 /* RUNE */:
        if (this.runes == null) {
          return 'rune <null>'
        }
        return (
          'rune ' +
          Inst.escapeRunes(this.runes) +
          ((this.arg & RE2Flags.FOLD_CASE) !== 0 ? '/i' : '') +
          ' -> ' +
          this.out
        )
      case 9 /* RUNE1 */:
        return 'rune1 ' + Inst.escapeRunes(this.runes) + ' -> ' + this.out
      case 10 /* RUNE_ANY */:
        return 'any -> ' + this.out
      case 11 /* RUNE_ANY_NOT_NL */:
        return 'anynotnl -> ' + this.out
      default:
        throw Object.defineProperty(new Error('unhandled case in Inst.toString'), '__classes', {
          configurable: true,
          value: [
            'java.lang.Throwable',
            'java.lang.IllegalStateException',
            'java.lang.Object',
            'java.lang.RuntimeException',
            'java.lang.Exception'
          ]
        })
    }
  }
  /*private*/ static escapeRunes(runes) {
    const out = {
      str: '',
      toString: function () {
        return this.str
      }
    }
    /* append */ ;((sb) => {
      sb.str += '"'
      return sb
    })(out)
    for (let index = 0; index < runes.length; index++) {
      let rune = runes[index]
      out.str += Utils.escapeRune(rune)
    }
    /* append */ ;((sb) => {
      sb.str += '"'
      return sb
    })(out)
    return /* toString */ out.str
  }
}
Inst.ALT = 1
Inst.ALT_MATCH = 2
Inst.CAPTURE = 3
Inst.EMPTY_WIDTH = 4
Inst.FAIL = 5
Inst.MATCH = 6
Inst.NOP = 7
Inst.RUNE = 8
Inst.RUNE1 = 9
Inst.RUNE_ANY = 10
Inst.RUNE_ANY_NOT_NL = 11
Inst['__class'] = 'quickstart.Inst'
