/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
/**
 * Regular expression abstract syntax tree. Produced by parser, used by compiler. NB, this
 * corresponds to {@code syntax.regexp} in the Go implementation; Go's {@code regexp} is called
 * {@code RE2} in Java.
 * @class
 */
import { Codepoint } from './Codepoint'
import { RE2Flags } from './RE2Flags'
import { Unicode } from './Unicode'
import { Utils } from './Utils'

export class Regexp {
  constructor(op) {
    if (typeof op === 'number' || op === null) {
      if (this.op === undefined) {
        this.op = null
      }
      if (this.flags === undefined) {
        this.flags = 0
      }
      if (this.subs === undefined) {
        this.subs = null
      }
      if (this.runes === undefined) {
        this.runes = null
      }
      if (this.min === undefined) {
        this.min = 0
      }
      if (this.max === undefined) {
        this.max = 0
      }
      if (this.cap === undefined) {
        this.cap = 0
      }
      if (this.name === undefined) {
        this.name = null
      }
      this.namedGroups = {}
      this.op = op
    } else if ((op != null && op instanceof Regexp) || op === null) {
      if (this.op === undefined) {
        this.op = null
      }
      if (this.flags === undefined) {
        this.flags = 0
      }
      if (this.subs === undefined) {
        this.subs = null
      }
      if (this.runes === undefined) {
        this.runes = null
      }
      if (this.min === undefined) {
        this.min = 0
      }
      if (this.max === undefined) {
        this.max = 0
      }
      if (this.cap === undefined) {
        this.cap = 0
      }
      if (this.name === undefined) {
        this.name = null
      }
      this.namedGroups = {}
      this.op = op.op
      this.flags = op.flags
      this.subs = op.subs
      this.runes = op.runes
      this.cap = this.min = this.max = 0
      this.name = op.name
      this.namedGroups = op.namedGroups
    } else {
      throw new Error('invalid overload')
    }
  }
  static EMPTY_SUBS_$LI$() {
    if (Regexp.EMPTY_SUBS == null) {
      Regexp.EMPTY_SUBS = []
    }
    return Regexp.EMPTY_SUBS
  }
  reinit() {
    this.flags = 0
    this.subs = Regexp.EMPTY_SUBS_$LI$()
    this.runes = null
    this.cap = 0
    this.min = 0
    this.max = 0
    this.name = null
    this.namedGroups = {}
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
    this.appendTo(out)
    return /* toString */ out.str
  }
  static quoteIfHyphen(rune) {
    if (rune === Codepoint.CODES.get('')) {
      return '\\'
    }
    return ''
  }
  appendTo(out) {
    switch (this.op) {
      case Regexp.Op.NO_MATCH:
        /* append */ ;((sb) => {
          sb.str += '[^\\x00-\\x{10FFFF}]'
          return sb
        })(out)
        break
      case Regexp.Op.EMPTY_MATCH:
        /* append */ ;((sb) => {
          sb.str += '(?:)'
          return sb
        })(out)
        break
      case Regexp.Op.STAR:
      case Regexp.Op.PLUS:
      case Regexp.Op.QUEST:
      case Regexp.Op.REPEAT: {
        const sub = this.subs[0]
        if (
          /* Enum.ordinal */ Regexp.Op[Regexp.Op[sub.op]] >
            /* Enum.ordinal */ Regexp.Op[Regexp.Op[Regexp.Op.CAPTURE]] ||
          (sub.op === Regexp.Op.LITERAL && sub.runes.length > 1)
        ) {
          /* append */ ;((sb) => {
            sb.str += '(?:'
            return sb
          })(out)
          sub.appendTo(out)
          /* append */
          ;((sb) => {
            sb.str += ')'
            return sb
          })(out)
        } else {
          sub.appendTo(out)
        }
        switch (this.op) {
          case Regexp.Op.STAR:
            /* append */ ;((sb) => {
              sb.str += '*'
              return sb
            })(out)
            break
          case Regexp.Op.PLUS:
            /* append */ ;((sb) => {
              sb.str += '+'
              return sb
            })(out)
            break
          case Regexp.Op.QUEST:
            /* append */ ;((sb) => {
              sb.str += '?'
              return sb
            })(out)
            break
          case Regexp.Op.REPEAT:
            /* append */ ;((sb) => {
              sb.str += this.min
              return sb
            })(
              /* append */ ((sb) => {
                sb.str += '{'
                return sb
              })(out)
            )
            if (this.min !== this.max) {
              /* append */ ;((sb) => {
                sb.str += ','
                return sb
              })(out)
              if (this.max >= 0) {
                /* append */ ;((sb) => {
                  sb.str += this.max
                  return sb
                })(out)
              }
            }
            /* append */ ;((sb) => {
              sb.str += '}'
              return sb
            })(out)
            break
        }
        if ((this.flags & RE2Flags.NON_GREEDY) !== 0) {
          /* append */ ;((sb) => {
            sb.str += '?'
            return sb
          })(out)
        }
        break
      }

      case Regexp.Op.CONCAT:
        for (let index = 0; index < this.subs.length; index++) {
          let sub = this.subs[index]
          {
            if (sub.op === Regexp.Op.ALTERNATE) {
              /* append */ ;((sb) => {
                sb.str += '(?:'
                return sb
              })(out)
              sub.appendTo(out)
              /* append */
              ;((sb) => {
                sb.str += ')'
                return sb
              })(out)
            } else {
              sub.appendTo(out)
            }
          }
        }
        break
      case Regexp.Op.ALTERNATE: {
        let sep = ''
        for (let index = 0; index < this.subs.length; index++) {
          let sub = this.subs[index]
          {
            /* append */ ;((sb) => {
              sb.str += sep
              return sb
            })(out)
            sep = '|'
            sub.appendTo(out)
          }
        }
        break
      }

      case Regexp.Op.LITERAL:
        if ((this.flags & RE2Flags.FOLD_CASE) !== 0) {
          /* append */ ;((sb) => {
            sb.str += '(?i:'
            return sb
          })(out)
        }
        for (let rune of this.runes) {
          out.str += Utils.escapeRune(rune)
        }
        if ((this.flags & RE2Flags.FOLD_CASE) !== 0) {
          /* append */ ;((sb) => {
            sb.str += ')'
            return sb
          })(out)
        }
        break
      case Regexp.Op.ANY_CHAR_NOT_NL:
        /* append */ ;((sb) => {
          sb.str += '(?-s:.)'
          return sb
        })(out)
        break
      case Regexp.Op.ANY_CHAR:
        /* append */ ;((sb) => {
          sb.str += '(?s:.)'
          return sb
        })(out)
        break
      case Regexp.Op.CAPTURE:
        if (this.name == null || /* isEmpty */ this.name.length === 0) {
          /* append */ ;((sb) => {
            sb.str += '('
            return sb
          })(out)
        } else {
          /* append */ ;((sb) => {
            sb.str += '(?P<'
            return sb
          })(out)
          /* append */
          ;((sb) => {
            sb.str += this.name
            return sb
          })(out)
          /* append */
          ;((sb) => {
            sb.str += '>'
            return sb
          })(out)
        }
        if (this.subs[0].op !== Regexp.Op.EMPTY_MATCH) {
          this.subs[0].appendTo(out)
        }
        /* append */ ;((sb) => {
          sb.str += ')'
          return sb
        })(out)
        break
      case Regexp.Op.BEGIN_TEXT:
        /* append */ ;((sb) => {
          sb.str += '\\A'
          return sb
        })(out)
        break
      case Regexp.Op.END_TEXT:
        if ((this.flags & RE2Flags.WAS_DOLLAR) !== 0) {
          /* append */ ;((sb) => {
            sb.str += '(?-m:$)'
            return sb
          })(out)
        } else {
          /* append */ ;((sb) => {
            sb.str += '\\z'
            return sb
          })(out)
        }
        break
      case Regexp.Op.BEGIN_LINE:
        /* append */ ;((sb) => {
          sb.str += '^'
          return sb
        })(out)
        break
      case Regexp.Op.END_LINE:
        /* append */ ;((sb) => {
          sb.str += '$'
          return sb
        })(out)
        break
      case Regexp.Op.WORD_BOUNDARY:
        /* append */ ;((sb) => {
          sb.str += '\\b'
          return sb
        })(out)
        break
      case Regexp.Op.NO_WORD_BOUNDARY:
        /* append */ ;((sb) => {
          sb.str += '\\B'
          return sb
        })(out)
        break
      case Regexp.Op.CHAR_CLASS:
        if (this.runes.length % 2 !== 0) {
          /* append */ ;((sb) => {
            sb.str += '[invalid char class]'
            return sb
          })(out)
          break
        }
        /* append */ ;((sb) => {
          sb.str += '['
          return sb
        })(out)
        if (this.runes.length === 0) {
          /* append */ ;((sb) => {
            sb.str += '^\\x00-\\x{10FFFF}'
            return sb
          })(out)
        } else if (this.runes[0] === 0 && this.runes[this.runes.length - 1] === Unicode.MAX_RUNE) {
          /* append */ ;((sb) => {
            sb.str += '^'
            return sb
          })(out)
          for (let i = 1; i < this.runes.length - 1; i += 2) {
            {
              const lo = this.runes[i] + 1
              const hi = this.runes[i + 1] - 1
              out.str += Regexp.quoteIfHyphen(lo)
              out.str += Utils.escapeRune(lo)
              if (lo !== hi) {
                /* append */ ;((sb) => {
                  sb.str += '-'
                  return sb
                })(out)
                out.str += Regexp.quoteIfHyphen(hi)
                out.str += Utils.escapeRune(hi)
              }
            }
          }
        } else {
          for (let i = 0; i < this.runes.length; i += 2) {
            {
              const lo = this.runes[i]
              const hi = this.runes[i + 1]
              out.str += Regexp.quoteIfHyphen(lo)
              out.str += Utils.escapeRune(lo)
              if (lo !== hi) {
                /* append */ ;((sb) => {
                  sb.str += '-'
                  return sb
                })(out)
                out.str += Regexp.quoteIfHyphen(hi)
                out.str += Utils.escapeRune(hi)
              }
            }
          }
        }
        /* append */ ;((sb) => {
          sb.str += ']'
          return sb
        })(out)
        break
      default:
        /* append */ ;((sb) => {
          sb.str += this.op
          return sb
        })(out)
        break
    }
  }
  maxCap() {
    let m = 0
    if (this.op === Regexp.Op.CAPTURE) {
      m = this.cap
    }
    if (this.subs != null) {
      for (let index = 0; index < this.subs.length; index++) {
        let sub = this.subs[index]
        {
          const n = sub.maxCap()
          if (m < n) {
            m = n
          }
        }
      }
    }
    return m
  }
  /**
   *
   * @return {number}
   */
  hashCode() {
    let hashcode = Regexp.Op['_$wrappers'][this.op].hashCode()
    switch (this.op) {
      case Regexp.Op.END_TEXT:
        hashcode += 31 * (this.flags & RE2Flags.WAS_DOLLAR)
        break
      case Regexp.Op.LITERAL:
      case Regexp.Op.CHAR_CLASS:
        hashcode += 31 * Arrays.hashCode(this.runes)
        break
      case Regexp.Op.ALTERNATE:
      case Regexp.Op.CONCAT:
        hashcode += 31 * Arrays.deepHashCode(this.subs)
        break
      case Regexp.Op.STAR:
      case Regexp.Op.PLUS:
      case Regexp.Op.QUEST:
        hashcode +=
          31 * (this.flags & RE2Flags.NON_GREEDY) +
          31 *
            /* hashCode */ ((o) => {
              if (o.hashCode) {
                return o.hashCode()
              } else {
                return o
                  .toString()
                  .split('')
                  .reduce(
                    (prevHash, currVal) =>
                      ((prevHash << 5) - prevHash + currVal.codePointAt(0)) | 0,
                    0
                  )
              }
            })(this.subs[0])
        break
      case Regexp.Op.REPEAT:
        hashcode +=
          31 * this.min +
          31 * this.max +
          31 *
            /* hashCode */ ((o) => {
              if (o.hashCode) {
                return o.hashCode()
              } else {
                return o
                  .toString()
                  .split('')
                  .reduce(
                    (prevHash, currVal) =>
                      ((prevHash << 5) - prevHash + currVal.codePointAt(0)) | 0,
                    0
                  )
              }
            })(this.subs[0])
        break
      case Regexp.Op.CAPTURE:
        hashcode +=
          31 * this.cap +
          31 *
            (this.name != null
              ? /* hashCode */ ((o) => {
                  if (o.hashCode) {
                    return o.hashCode()
                  } else {
                    return o
                      .toString()
                      .split('')
                      .reduce(
                        (prevHash, currVal) =>
                          ((prevHash << 5) - prevHash + currVal.codePointAt(0)) | 0,
                        0
                      )
                  }
                })(this.name)
              : 0) +
          31 *
            /* hashCode */ ((o) => {
              if (o.hashCode) {
                return o.hashCode()
              } else {
                return o
                  .toString()
                  .split('')
                  .reduce(
                    (prevHash, currVal) =>
                      ((prevHash << 5) - prevHash + currVal.codePointAt(0)) | 0,
                    0
                  )
              }
            })(this.subs[0])
        break
    }
    return hashcode
  }
  /**
   *
   * @param {*} that
   * @return {boolean}
   */
  equals(that) {
    if (!(that != null && that instanceof Regexp)) {
      return false
    }
    const x = this
    const y = that
    if (x.op !== y.op) {
      return false
    }
    switch (x.op) {
      case Regexp.Op.END_TEXT:
        if ((x.flags & RE2Flags.WAS_DOLLAR) !== (y.flags & RE2Flags.WAS_DOLLAR)) {
          return false
        }
        break
      case Regexp.Op.LITERAL:
      case Regexp.Op.CHAR_CLASS:
        if (
          !((a1, a2) => {
            if (a1 == null && a2 == null) {
              return true
            }
            if (a1 == null || a2 == null) {
              return false
            }
            if (a1.length != a2.length) {
              return false
            }
            for (let i = 0; i < a1.length; i++) {
              if (a1[i] != a2[i]) {
                return false
              }
            }
            return true
          })(x.runes, y.runes)
        ) {
          return false
        }
        break
      case Regexp.Op.ALTERNATE:
      case Regexp.Op.CONCAT:
        if (x.subs.length !== y.subs.length) {
          return false
        }
        for (let i = 0; i < x.subs.length; ++i) {
          {
            if (!x.subs[i].equals(y.subs[i])) {
              return false
            }
          }
        }
        break
      case Regexp.Op.STAR:
      case Regexp.Op.PLUS:
      case Regexp.Op.QUEST:
        if (
          (x.flags & RE2Flags.NON_GREEDY) !== (y.flags & RE2Flags.NON_GREEDY) ||
          !x.subs[0].equals(y.subs[0])
        ) {
          return false
        }
        break
      case Regexp.Op.REPEAT:
        if (
          (x.flags & RE2Flags.NON_GREEDY) !== (y.flags & RE2Flags.NON_GREEDY) ||
          x.min !== y.min ||
          x.max !== y.max ||
          !x.subs[0].equals(y.subs[0])
        ) {
          return false
        }
        break
      case Regexp.Op.CAPTURE:
        if (
          x.cap !== y.cap ||
          (x.name == null ? y.name != null : !(x.name === y.name)) ||
          !x.subs[0].equals(y.subs[0])
        ) {
          return false
        }
        break
    }
    return true
  }
}
Regexp['__class'] = 'quickstart.Regexp'
;(function (Regexp) {
  let Op
  ;(function (Op) {
    Op[(Op['NO_MATCH'] = 0)] = 'NO_MATCH'
    Op[(Op['EMPTY_MATCH'] = 1)] = 'EMPTY_MATCH'
    Op[(Op['LITERAL'] = 2)] = 'LITERAL'
    Op[(Op['CHAR_CLASS'] = 3)] = 'CHAR_CLASS'
    Op[(Op['ANY_CHAR_NOT_NL'] = 4)] = 'ANY_CHAR_NOT_NL'
    Op[(Op['ANY_CHAR'] = 5)] = 'ANY_CHAR'
    Op[(Op['BEGIN_LINE'] = 6)] = 'BEGIN_LINE'
    Op[(Op['END_LINE'] = 7)] = 'END_LINE'
    Op[(Op['BEGIN_TEXT'] = 8)] = 'BEGIN_TEXT'
    Op[(Op['END_TEXT'] = 9)] = 'END_TEXT'
    Op[(Op['WORD_BOUNDARY'] = 10)] = 'WORD_BOUNDARY'
    Op[(Op['NO_WORD_BOUNDARY'] = 11)] = 'NO_WORD_BOUNDARY'
    Op[(Op['CAPTURE'] = 12)] = 'CAPTURE'
    Op[(Op['STAR'] = 13)] = 'STAR'
    Op[(Op['PLUS'] = 14)] = 'PLUS'
    Op[(Op['QUEST'] = 15)] = 'QUEST'
    Op[(Op['REPEAT'] = 16)] = 'REPEAT'
    Op[(Op['CONCAT'] = 17)] = 'CONCAT'
    Op[(Op['ALTERNATE'] = 18)] = 'ALTERNATE'
    Op[(Op['LEFT_PAREN'] = 19)] = 'LEFT_PAREN'
    Op[(Op['VERTICAL_BAR'] = 20)] = 'VERTICAL_BAR'
  })((Op = Regexp.Op || (Regexp.Op = {})))
  /** @ignore */
  class Op_$WRAPPER {
    constructor(_$ordinal, _$name) {
      this._$ordinal = _$ordinal
      this._$name = _$name
    }
    isPseudo() {
      return this.ordinal() >= /* Enum.ordinal */ Regexp.Op[Regexp.Op[Op.LEFT_PAREN]]
    }
    name() {
      return this._$name
    }
    ordinal() {
      return this._$ordinal
    }
    compareTo(other) {
      return this._$ordinal - (isNaN(other) ? other._$ordinal : other)
    }
  }
  Regexp.Op_$WRAPPER = Op_$WRAPPER
  Op['__class'] = 'quickstart.Regexp.Op'
  Op['_$wrappers'] = {
    0: new Op_$WRAPPER(0, 'NO_MATCH'),
    1: new Op_$WRAPPER(1, 'EMPTY_MATCH'),
    2: new Op_$WRAPPER(2, 'LITERAL'),
    3: new Op_$WRAPPER(3, 'CHAR_CLASS'),
    4: new Op_$WRAPPER(4, 'ANY_CHAR_NOT_NL'),
    5: new Op_$WRAPPER(5, 'ANY_CHAR'),
    6: new Op_$WRAPPER(6, 'BEGIN_LINE'),
    7: new Op_$WRAPPER(7, 'END_LINE'),
    8: new Op_$WRAPPER(8, 'BEGIN_TEXT'),
    9: new Op_$WRAPPER(9, 'END_TEXT'),
    10: new Op_$WRAPPER(10, 'WORD_BOUNDARY'),
    11: new Op_$WRAPPER(11, 'NO_WORD_BOUNDARY'),
    12: new Op_$WRAPPER(12, 'CAPTURE'),
    13: new Op_$WRAPPER(13, 'STAR'),
    14: new Op_$WRAPPER(14, 'PLUS'),
    15: new Op_$WRAPPER(15, 'QUEST'),
    16: new Op_$WRAPPER(16, 'REPEAT'),
    17: new Op_$WRAPPER(17, 'CONCAT'),
    18: new Op_$WRAPPER(18, 'ALTERNATE'),
    19: new Op_$WRAPPER(19, 'LEFT_PAREN'),
    20: new Op_$WRAPPER(20, 'VERTICAL_BAR')
  }
})(Regexp || (Regexp = {}))
