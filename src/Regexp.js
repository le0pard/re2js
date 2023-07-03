import { Codepoint } from './Codepoint'
import { RE2Flags } from './RE2Flags'
import { Unicode } from './Unicode'
import { Utils } from './Utils'
import { createEnum } from './helpers'

/**
 * Regular expression abstract syntax tree. Produced by parser, used by compiler. NB, this
 * corresponds to {@code syntax.regexp} in the Go implementation; Go's {@code regexp} is called
 * {@code RE2} in Java.
 */
export class Regexp {
  static Op = createEnum([
    'NO_MATCH', // Matches no strings.
    'EMPTY_MATCH', // Matches empty string.
    'LITERAL', // Matches runes[] sequence
    'CHAR_CLASS', // Matches Runes interpreted as range pair list
    'ANY_CHAR_NOT_NL', // Matches any character except '\n'
    'ANY_CHAR', // Matches any character
    'BEGIN_LINE', // Matches empty string at end of line
    'END_LINE', // Matches empty string at end of line
    'BEGIN_TEXT', // Matches empty string at beginning of text
    'END_TEXT', // Matches empty string at end of text
    'WORD_BOUNDARY', // Matches word boundary `\b`
    'NO_WORD_BOUNDARY', // Matches word non-boundary `\B`
    'CAPTURE', // Capturing subexpr with index cap, optional name name
    'STAR', // Matches subs[0] zero or more times.
    'PLUS', // Matches subs[0] one or more times.
    'QUEST', // Matches subs[0] zero or one times.
    'REPEAT', // Matches subs[0] [min, max] times; max=-1 => no limit.
    'CONCAT', // Matches concatenation of subs[]
    'ALTERNATE', // Matches union of subs[]
    // Pseudo ops, used internally by Parser for parsing stack:
    'LEFT_PAREN',
    'VERTICAL_BAR'
  ])

  static isPseudoOp(op) {
    return op >= Regexp.Op.LEFT_PAREN
  }

  static emptySubs() {
    return []
  }

  static quoteIfHyphen(rune) {
    if (rune === Codepoint.CODES.get('-')) {
      return '\\'
    }
    return ''
  }

  static fromRegexp(re) {
    const regex = new Regexp(re.op)
    regex.flags = re.flags
    regex.subs = re.subs
    regex.runes = re.runes
    regex.cap = re.cap
    regex.min = re.min
    regex.max = re.max
    regex.name = re.name
    regex.namedGroups = re.namedGroups
    return regex
  }

  constructor(op) {
    this.op = op // operator
    this.flags = 0 // bitmap of parse flags
    // subexpressions, if any.  Never null.
    // subs[0] is used as the freelist.
    this.subs = Regexp.emptySubs()
    this.runes = null // matched runes, for LITERAL, CHAR_CLASS
    this.min = 0 // min for REPEAT
    this.max = 0 // max for REPEAT
    this.cap = 0 // capturing index, for CAPTURE
    this.name = null // capturing name, for CAPTURE
    this.namedGroups = {} // map of group name -> capturing index
  }

  reinit() {
    this.flags = 0
    this.subs = Regexp.emptySubs()
    this.runes = null
    this.cap = 0
    this.min = 0
    this.max = 0
    this.name = null
    this.namedGroups = {}
  }

  toString() {
    return this.appendTo()
  }

  // appendTo() appends the Perl syntax for |this| regular expression to out
  appendTo() {
    let out = ''
    switch (this.op) {
      case Regexp.Op.NO_MATCH:
        out += '[^\\x00-\\x{10FFFF}]'
        break
      case Regexp.Op.EMPTY_MATCH:
        out += '(?:)'
        break
      case Regexp.Op.STAR:
      case Regexp.Op.PLUS:
      case Regexp.Op.QUEST:
      case Regexp.Op.REPEAT: {
        const sub = this.subs[0]
        if (sub.op > Regexp.Op.CAPTURE || (sub.op === Regexp.Op.LITERAL && sub.runes.length > 1)) {
          out += `(?:${sub.appendTo()})`
        } else {
          out += sub.appendTo()
        }
        switch (this.op) {
          case Regexp.Op.STAR:
            out += '*'
            break
          case Regexp.Op.PLUS:
            out += '+'
            break
          case Regexp.Op.QUEST:
            out += '?'
            break
          case Regexp.Op.REPEAT:
            out += `{${this.min}`
            if (this.min !== this.max) {
              out += ','
              if (this.max >= 0) {
                out += this.max
              }
            }
            out += '}'
            break
        }
        if ((this.flags & RE2Flags.NON_GREEDY) !== 0) {
          out += '?'
        }
        break
      }

      case Regexp.Op.CONCAT:
        for (let sub of this.subs) {
          if (sub.op === Regexp.Op.ALTERNATE) {
            out += `(?:${sub.appendTo()})`
          } else {
            out += sub.appendTo()
          }
        }
        break
      case Regexp.Op.ALTERNATE: {
        let sep = ''
        for (let sub of this.subs) {
          out += sep
          sep = '|'
          out += sub.appendTo()
        }
        break
      }

      case Regexp.Op.LITERAL:
        if ((this.flags & RE2Flags.FOLD_CASE) !== 0) {
          out += '(?i:'
        }
        for (let rune of this.runes) {
          out += Utils.escapeRune(rune)
        }
        if ((this.flags & RE2Flags.FOLD_CASE) !== 0) {
          out += ')'
        }
        break
      case Regexp.Op.ANY_CHAR_NOT_NL:
        out += '(?-s:.)'
        break
      case Regexp.Op.ANY_CHAR:
        out += '(?s:.)'
        break
      case Regexp.Op.CAPTURE:
        if (this.name === null || this.name.length === 0) {
          out += '('
        } else {
          out += `(?P<${this.name}>`
        }
        if (this.subs[0].op !== Regexp.Op.EMPTY_MATCH) {
          out += this.subs[0].appendTo()
        }
        out += ')'
        break
      case Regexp.Op.BEGIN_TEXT:
        out += '\\A'
        break
      case Regexp.Op.END_TEXT:
        if ((this.flags & RE2Flags.WAS_DOLLAR) !== 0) {
          out += '(?-m:$)'
        } else {
          out += '\\z'
        }
        break
      case Regexp.Op.BEGIN_LINE:
        out += '^'
        break
      case Regexp.Op.END_LINE:
        out += '$'
        break
      case Regexp.Op.WORD_BOUNDARY:
        out += '\\b'
        break
      case Regexp.Op.NO_WORD_BOUNDARY:
        out += '\\B'
        break
      case Regexp.Op.CHAR_CLASS:
        if (this.runes.length % 2 !== 0) {
          out += '[invalid char class]'
          break
        }

        out += '['
        if (this.runes.length === 0) {
          out += '^\\x00-\\x{10FFFF}'
        } else if (this.runes[0] === 0 && this.runes[this.runes.length - 1] === Unicode.MAX_RUNE) {
          out += '^'

          for (let i = 1; i < this.runes.length - 1; i += 2) {
            {
              const lo = this.runes[i] + 1
              const hi = this.runes[i + 1] - 1

              out += Regexp.quoteIfHyphen(lo)
              out += Utils.escapeRune(lo)
              if (lo !== hi) {
                out += '-'
                out += Regexp.quoteIfHyphen(hi)
                out += Utils.escapeRune(hi)
              }
            }
          }
        } else {
          for (let i = 0; i < this.runes.length; i += 2) {
            {
              const lo = this.runes[i]
              const hi = this.runes[i + 1]
              out += Regexp.quoteIfHyphen(lo)
              out += Utils.escapeRune(lo)
              if (lo !== hi) {
                out += '-'
                out += Regexp.quoteIfHyphen(hi)
                out += Utils.escapeRune(hi)
              }
            }
          }
        }
        out += ']'
        break
      default:
        out += this.op
        break
    }
    return out
  }

  // maxCap() walks the regexp to find the maximum capture index.
  maxCap() {
    let m = 0
    if (this.op === Regexp.Op.CAPTURE) {
      m = this.cap
    }
    if (this.subs !== null) {
      for (let sub of this.subs) {
        const n = sub.maxCap()
        if (m < n) {
          m = n
        }
      }
    }
    return m
  }

  // hashCode() {
  //   let hashcode = Regexp.Op['_$wrappers'][this.op].hashCode()
  //   switch (this.op) {
  //     case Regexp.Op.END_TEXT:
  //       hashcode += 31 * (this.flags & RE2Flags.WAS_DOLLAR)
  //       break
  //     case Regexp.Op.LITERAL:
  //     case Regexp.Op.CHAR_CLASS:
  //       hashcode += 31 * Arrays.hashCode(this.runes)
  //       break
  //     case Regexp.Op.ALTERNATE:
  //     case Regexp.Op.CONCAT:
  //       hashcode += 31 * Arrays.deepHashCode(this.subs)
  //       break
  //     case Regexp.Op.STAR:
  //     case Regexp.Op.PLUS:
  //     case Regexp.Op.QUEST:
  //       hashcode +=
  //         31 * (this.flags & RE2Flags.NON_GREEDY) +
  //         31 *
  //           /* hashCode */ ((o) => {
  //             if (o.hashCode) {
  //               return o.hashCode()
  //             } else {
  //               return o
  //                 .toString()
  //                 .split('')
  //                 .reduce(
  //                   (prevHash, currVal) =>
  //                     ((prevHash << 5) - prevHash + currVal.codePointAt(0)) | 0,
  //                   0
  //                 )
  //             }
  //           })(this.subs[0])
  //       break
  //     case Regexp.Op.REPEAT:
  //       hashcode +=
  //         31 * this.min +
  //         31 * this.max +
  //         31 *
  //           /* hashCode */ ((o) => {
  //             if (o.hashCode) {
  //               return o.hashCode()
  //             } else {
  //               return o
  //                 .toString()
  //                 .split('')
  //                 .reduce(
  //                   (prevHash, currVal) =>
  //                     ((prevHash << 5) - prevHash + currVal.codePointAt(0)) | 0,
  //                   0
  //                 )
  //             }
  //           })(this.subs[0])
  //       break
  //     case Regexp.Op.CAPTURE:
  //       hashcode +=
  //         31 * this.cap +
  //         31 *
  //           (this.name != null
  //             ? /* hashCode */ ((o) => {
  //                 if (o.hashCode) {
  //                   return o.hashCode()
  //                 } else {
  //                   return o
  //                     .toString()
  //                     .split('')
  //                     .reduce(
  //                       (prevHash, currVal) =>
  //                         ((prevHash << 5) - prevHash + currVal.codePointAt(0)) | 0,
  //                       0
  //                     )
  //                 }
  //               })(this.name)
  //             : 0) +
  //         31 *
  //           /* hashCode */ ((o) => {
  //             if (o.hashCode) {
  //               return o.hashCode()
  //             } else {
  //               return o
  //                 .toString()
  //                 .split('')
  //                 .reduce(
  //                   (prevHash, currVal) =>
  //                     ((prevHash << 5) - prevHash + currVal.codePointAt(0)) | 0,
  //                   0
  //                 )
  //             }
  //           })(this.subs[0])
  //       break
  //   }
  //   return hashcode
  // }

  // equals() returns true if this and that have identical structure.
  equals(that) {
    if (!(that !== null && that instanceof Regexp)) {
      return false
    }
    if (this.op !== that.op) {
      return false
    }
    switch (this.op) {
      case Regexp.Op.END_TEXT: {
        if ((this.flags & RE2Flags.WAS_DOLLAR) !== (that.flags & RE2Flags.WAS_DOLLAR)) {
          return false
        }
        break
      }
      case Regexp.Op.LITERAL:
      case Regexp.Op.CHAR_CLASS: {
        if (this.runes === null && that.runes === null) {
          break
        }
        if (this.runes === null || that.runes === null) {
          return false
        }
        if (this.runes.length !== that.runes.length) {
          return false
        }
        for (let i = 0; i < this.runes.length; i++) {
          if (this.runes[i] !== that.runes[i]) {
            return false
          }
        }
        break
      }
      case Regexp.Op.ALTERNATE:
      case Regexp.Op.CONCAT: {
        if (this.subs.length !== that.subs.length) {
          return false
        }
        for (let i = 0; i < this.subs.length; ++i) {
          if (!this.subs[i].equals(that.subs[i])) {
            return false
          }
        }
        break
      }
      case Regexp.Op.STAR:
      case Regexp.Op.PLUS:
      case Regexp.Op.QUEST: {
        if (
          (this.flags & RE2Flags.NON_GREEDY) !== (that.flags & RE2Flags.NON_GREEDY) ||
          !this.subs[0].equals(that.subs[0])
        ) {
          return false
        }
        break
      }
      case Regexp.Op.REPEAT: {
        if (
          (this.flags & RE2Flags.NON_GREEDY) !== (that.flags & RE2Flags.NON_GREEDY) ||
          this.min !== that.min ||
          this.max !== that.max ||
          !this.subs[0].equals(that.subs[0])
        ) {
          return false
        }
        break
      }
      case Regexp.Op.CAPTURE: {
        if (
          this.cap !== that.cap ||
          (this.name === null ? that.name !== null : this.name !== that.name) ||
          !this.subs[0].equals(that.subs[0])
        ) {
          return false
        }
        break
      }
    }
    return true
  }
}
