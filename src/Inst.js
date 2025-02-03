import { RE2Flags } from './RE2Flags'
import { Utils } from './Utils'
import { Unicode } from './Unicode'
/**
 * A single instruction in the regular expression virtual machine.
 *
 * @see http://swtch.com/~rsc/regexp/regexp2.html
 */
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

  static isRuneOp(op) {
    return Inst.RUNE <= op && op <= Inst.RUNE_ANY_NOT_NL
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

  constructor(op) {
    this.op = op
    this.out = 0 // all but MATCH, FAIL
    this.arg = 0 // ALT, ALT_MATCH, CAPTURE, EMPTY_WIDTH
    // length==1 => exact match
    // otherwise a list of [lo,hi] pairs.  hi is *inclusive*.
    this.runes = []
  }

  // MatchRune returns true if the instruction matches (and consumes) r.
  // It should only be called when op == InstRune.
  matchRune(r) {
    // Special case: single-rune slice is from literal string, not char
    // class.
    if (this.runes.length === 1) {
      const r0 = this.runes[0]
      // If this pattern is case-insensitive, apply Unicode case folding to compare the two runes.
      // Note that this may result in a case-folding loop when executed,
      // so attempt to reduce the chance of that occurring
      // by performing case folding on |r0| from the pattern rather than |r| from the input.
      if ((this.arg & RE2Flags.FOLD_CASE) !== 0) {
        return Unicode.equalsIgnoreCase(r0, r)
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
    let lo = 0
    let hi = (this.runes.length / 2) | 0
    while (lo < hi) {
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

    return false
  }
  /**
   *
   * @returns {string}
   */
  toString() {
    switch (this.op) {
      case Inst.ALT:
        return `alt -> ${this.out}, ${this.arg}`
      case Inst.ALT_MATCH:
        return `altmatch -> ${this.out}, ${this.arg}`
      case Inst.CAPTURE:
        return `cap ${this.arg} -> ${this.out}`
      case Inst.EMPTY_WIDTH:
        return `empty ${this.arg} -> ${this.out}`
      case Inst.MATCH:
        return 'match'
      case Inst.FAIL:
        return 'fail'
      case Inst.NOP:
        return `nop -> ${this.out}`
      case Inst.RUNE:
        if (this.runes === null) {
          return 'rune <null>'
        }
        return [
          'rune ',
          Inst.escapeRunes(this.runes),
          (this.arg & RE2Flags.FOLD_CASE) !== 0 ? '/i' : '',
          ' -> ',
          this.out
        ].join('')
      case Inst.RUNE1:
        return `rune1 ${Inst.escapeRunes(this.runes)} -> ${this.out}`
      case Inst.RUNE_ANY:
        return `any -> ${this.out}`
      case Inst.RUNE_ANY_NOT_NL:
        return `anynotnl -> ${this.out}`
      default:
        throw new Error('unhandled case in Inst.toString')
    }
  }
}

export { Inst }
