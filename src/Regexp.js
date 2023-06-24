import { RE2Flags } from './RE2Flags'
import { Unicode } from './Unicode'
import { Utils } from './Utils'

class Regexp {

  static Op = {
    NO_MATCH: 'NO_MATCH', // Matches no strings.
    EMPTY_MATCH: 'EMPTY_MATCH', // Matches empty string.
    LITERAL: 'LITERAL', // Matches runes[] sequence
    CHAR_CLASS: 'CHAR_CLASS', // Matches Runes interpreted as range pair list
    ANY_CHAR_NOT_NL: 'ANY_CHAR_NOT_NL', // Matches any character except '\n'
    ANY_CHAR: 'ANY_CHAR', // Matches any character
    BEGIN_LINE: 'BEGIN_LINE', // Matches empty string at end of line
    END_LINE: 'END_LINE', // Matches empty string at end of line
    BEGIN_TEXT: 'BEGIN_TEXT', // Matches empty string at beginning of text
    END_TEXT: 'END_TEXT', // Matches empty string at end of text
    WORD_BOUNDARY: 'WORD_BOUNDARY', // Matches word boundary `\b`
    NO_WORD_BOUNDARY: 'NO_WORD_BOUNDARY', // Matches word non-boundary `\B`
    CAPTURE: 'CAPTURE', // Capturing subexpr with index cap, optional name name
    STAR: 'STAR', // Matches subs[0] zero or more times.
    PLUS: 'PLUS', // Matches subs[0] one or more times.
    QUEST: 'QUEST', // Matches subs[0] zero or one times.
    REPEAT: 'REPEAT', // Matches subs[0] [min, max] times; max=-1 => no limit.
    CONCAT: 'CONCAT', // Matches concatenation of subs[]
    ALTERNATE: 'ALTERNATE', // Matches union of subs[]

    // Pseudo ops, used internally by Parser for parsing stack:
    LEFT_PAREN: 'LEFT_PAREN',
    VERTICAL_BAR: 'VERTICAL_BAR'
  }

  static isPseudo(op) {
    const pseudoOps = Object.values(this.Op).slice(Object.values(this.Op).indexOf('LEFT_PAREN'))
    return pseudoOps.includes(op)
  }

  static EMPTY_SUBS = []

  constructor(op) {
    this.op = op
    this.flags = 0
    this.subs = Regexp.EMPTY_SUBS
    this.runes = null
    this.min = this.max = this.cap = 0
    this.name = null
    this.namedGroups = {}
  }

  // Shallow copy constructor.
  copy(that) {
    this.op = that.op
    this.flags = that.flags
    this.subs = that.subs
    this.runes = that.runes
    this.min = that.min
    this.max = that.max
    this.cap = that.cap
    this.name = that.name
    this.namedGroups = that.namedGroups
  }

  reinit() {
    this.flags = 0
    this.subs = Regexp.EMPTY_SUBS
    this.runes = null
    this.cap = this.min = this.max = 0
    this.name = null
    this.namedGroups = {}
  }

  toString() {
    let out = ''
    this.appendTo(out)
    return out
  }

  static quoteIfHyphen(out, rune) {
    if (rune === '-') {
      out += '\\'
    }
  }

  appendTo(out) {
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
      case Regexp.Op.REPEAT:
        {
          let sub = this.subs[0]
          if (sub.op > Regexp.Op.CAPTURE || (sub.op === Regexp.Op.LITERAL && sub.runes.length > 1)) {
            out += '(?:'
            sub.appendTo(out)
            out += ')'
          } else {
            sub.appendTo(out)
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
          if (this.flags & RE2Flags.NON_GREEDY) {
            out += '?'
          }
          break
        }
      case Regexp.Op.CONCAT:
        this.subs.forEach(sub => {
          if (sub.op === Regexp.Op.ALTERNATE) {
            out += '(?:'
            sub.appendTo(out)
            out += ')'
          } else {
            sub.appendTo(out)
          }
        })
        break
      case Regexp.Op.ALTERNATE:
        {
          let sep = ''
          this.subs.forEach(sub => {
            out += sep
            sep = '|'
            sub.appendTo(out)
          })
          break
        }
      case Regexp.Op.LITERAL:
        if (this.flags & RE2Flags.FOLD_CASE) {
          out += '(?i:'
        }
        this.runes.forEach(rune => {
          out += Utils.escapeRune(rune)
        })
        if (this.flags & RE2Flags.FOLD_CASE) {
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
        if (!this.name || this.name === '') {
          out += '('
        } else {
          out += '(?P<' + this.name + '>'
        }
        if (this.subs[0].op !== Regexp.Op.EMPTY_MATCH) {
          this.subs[0].appendTo(out)
        }
        out += ')'
        break
      case Regexp.Op.BEGIN_TEXT:
        out += '\\A'
        break
      case Regexp.Op.END_TEXT:
        if (this.flags & RE2Flags.WAS_DOLLAR) {
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
            let lo = this.runes[i] + 1
            let hi = this.runes[i + 1] - 1
            out += Regexp.quoteIfHyphen(lo)
            out += Utils.escapeRune(lo)
            if (lo !== hi) {
              out += '-'
              out += Regexp.quoteIfHyphen(hi)
              out += Utils.escapeRune(hi)
            }
          }
        } else {
          for (let i = 0; i < this.runes.length; i += 2) {
            let lo = this.runes[i]
            let hi = this.runes[i + 1]
            out += Regexp.quoteIfHyphen(lo)
            out += Utils.escapeRune(lo)
            if (lo !== hi) {
              out += '-'
              out += Regexp.quoteIfHyphen(hi)
              out += Utils.escapeRune(hi)
            }
          }
        }
        out += ']'
        break
      default: // incl. pseudos
        out += this.op
        break
    }
    return out
  }

  maxCap() {
    let m = 0
    if (this.op === Regexp.Op.CAPTURE) {
      m = this.cap
    }
    if (this.subs !== null) {
      for (let sub of this.subs) {
        let n = sub.maxCap()
        if (m < n) {
          m = n
        }
      }
    }
    return m
  }

  hashCode() {
    let hashcode = this.getHashCode(this.op)
    switch (this.op) {
      case Regexp.Op.END_TEXT:
        hashcode += 31 * (this.flags & RE2Flags.WAS_DOLLAR)
        break
      case Regexp.Op.LITERAL:
      case Regexp.Op.CHAR_CLASS:
        hashcode += 31 * this.getArrayHashCode(this.runes)
        break
      case Regexp.Op.ALTERNATE:
      case Regexp.Op.CONCAT:
        hashcode += 31 * this.getDeepArrayHashCode(this.subs)
        break
      case Regexp.Op.STAR:
      case Regexp.Op.PLUS:
      case Regexp.Op.QUEST:
        hashcode += 31 * (this.flags & RE2Flags.NON_GREEDY) + 31 * this.subs[0].hashCode()
        break
      case Regexp.Op.REPEAT:
        hashcode += 31 * this.min + 31 * this.max + 31 * this.subs[0].hashCode()
        break
      case Regexp.Op.CAPTURE:
        hashcode += 31 * this.cap + 31 * (this.name !== null ? this.getHashCode(this.name) : 0) + 31 * this.subs[0].hashCode()
        break
    }
    return hashcode
  }

  // Helper function to get hash code for a string
  getHashCode(s) {
    let hash = 0
    if (s.length === 0) return hash
    for (let i = 0; i < s.length; i++) {
      let char = s.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return hash
  }

  // Helper function to get hash code for an array
  getArrayHashCode(a) {
    let hash = 0
    for (let i = 0; i < a.length; i++) {
      hash = hash * 31 + this.getHashCode(a[i])
      hash = hash & hash // Convert to 32bit integer
    }
    return hash
  }

  // Helper function to get hash code for a deep array
  getDeepArrayHashCode(a) {
    let hash = 0
    for (let i = 0; i < a.length; i++) {
      hash = hash * 31 + a[i].hashCode()
      hash = hash & hash // Convert to 32bit integer
    }
    return hash
  }

  equals(that) {
    let x = this
    let y = that
    if (x.op !== y.op) {
      return false
    }
    switch (x.op) {
      case Regexp.Op.END_TEXT:
        // The parse flags remember whether this is \z or \Z.
        if ((x.flags & RE2Flags.WAS_DOLLAR) !== (y.flags & RE2Flags.WAS_DOLLAR)) {
          return false
        }
        break
      case Regexp.Op.LITERAL:
      case Regexp.Op.CHAR_CLASS:
        if (!this.arrayEquals(x.runes, y.runes)) {
          return false
        }
        break
      case Regexp.Op.ALTERNATE:
      case Regexp.Op.CONCAT:
        if (x.subs.length !== y.subs.length) {
          return false
        }
        for (let i = 0; i < x.subs.length; ++i) {
          if (!x.subs[i].equals(y.subs[i])) {
            return false
          }
        }
        break
      case Regexp.Op.STAR:
      case Regexp.Op.PLUS:
      case Regexp.Op.QUEST:
        if ((x.flags & RE2Flags.NON_GREEDY) !== (y.flags & RE2Flags.NON_GREEDY)
          || !x.subs[0].equals(y.subs[0])) {
          return false
        }
        break
      case Regexp.Op.REPEAT:
        if ((x.flags & RE2Flags.NON_GREEDY) !== (y.flags & RE2Flags.NON_GREEDY)
          || x.min !== y.min
          || x.max !== y.max
          || !x.subs[0].equals(y.subs[0])) {
          return false
        }
        break
      case Regexp.Op.CAPTURE:
        if (x.cap !== y.cap
          || (x.name === null ? y.name !== null : x.name !== y.name)
          || !x.subs[0].equals(y.subs[0])) {
          return false
        }
        break
    }
    return true
  }

  // Helper function to check array equality
  arrayEquals(a, b) {
    return Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((val, index) => val === b[index])
  }
}

export { Regexp }
