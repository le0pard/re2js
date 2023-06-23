import { RE2Flags } from './RE2Flags'
import { Unicode } from './Unicode'
import { Utils } from './Utils'

class Inst {
  static ALT = 1
  static ALT_MATCH = 2
  static CAPTURE = 3
  static EMPTY_WIDTH = 4
  static FAIL = 5
  static MATCH = 6
  static NOP = 7
  static RUNE = 8
  static RUNE1 = 9
  static RUNE_ANY = 10
  static RUNE_ANY_NOT_NL = 11

  constructor(op) {
    this.op = op
    this.out = 0 // all but MATCH, FAIL
    this.arg = 0 // ALT, ALT_MATCH, CAPTURE, EMPTY_WIDTH
    this.runes = null // length==1 => exact match
  }

  static isRuneOp(op) {
    return this.RUNE <= op && op <= this.RUNE_ANY_NOT_NL
  }

  matchRune(r) {
    // Special case: single-rune slice is from literal string, not char class.
    if (this.runes.length === 1) {
      const r0 = this.runes[0]

      if ((this.arg & RE2Flags.FOLD_CASE) !== 0) {
        return Unicode.equalsIgnoreCase(r, r0)
      }
      return r === r0
    }

    // Peek at the first few pairs.
    // Should handle ASCII well.
    for (let j = 0; j < this.runes.length && j <= 8; j += 2) {
      if (r < this.runes[j]) {
        return false
      }
      if (r <= this.runes[j + 1]) {
        return true
      }
    }

    // Otherwise binary search.
    for (let lo = 0, hi = this.runes.length / 2; lo < hi;) {
      const m = lo + Math.floor((hi - lo) / 2)
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
    return false
  }

  toString() {
    switch (this.op) {
      case Inst.ALT:
        return 'alt -> ' + this.out + ', ' + this.arg
      case Inst.ALT_MATCH:
        return 'altmatch -> ' + this.out + ', ' + this.arg
      case Inst.CAPTURE:
        return 'cap ' + this.arg + ' -> ' + this.out
      case Inst.EMPTY_WIDTH:
        return 'empty ' + this.arg + ' -> ' + this.out
      case Inst.MATCH:
        return 'match'
      case Inst.FAIL:
        return 'fail'
      case Inst.NOP:
        return 'nop -> ' + this.out
      case Inst.RUNE:
        if (this.runes === null) {
          return 'rune <null>' // can't happen
        }
        return 'rune '
            + Inst.escapeRunes(this.runes)
            + (((this.arg & RE2Flags.FOLD_CASE) !== 0) ? '/i' : '')
            + ' -> '
            + this.out
      case Inst.RUNE1:
        return 'rune1 ' + Inst.escapeRunes(this.runes) + ' -> ' + this.out
      case Inst.RUNE_ANY:
        return 'any -> ' + this.out
      case Inst.RUNE_ANY_NOT_NL:
        return 'anynotnl -> ' + this.out
      default:
        throw new Error('unhandled case in Inst.toString')
    }
  }

  // Returns an RE2 expression matching exactly |runes|.
  static escapeRunes(runes) {
    let out = '"'
    for (let rune of runes) {
      out += Utils.escapeRune(rune)
    }
    out += '"'
    return out
  }
}

export { Inst }
