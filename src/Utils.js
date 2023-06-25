import { Unicode } from './Unicode'

class Utils {
  static EMPTY_INTS = []

  static METACHARACTERS = '\\.+*?()|[]{}^$'

  //// EMPTY_* flags
  static EMPTY_BEGIN_LINE = 0x01
  static EMPTY_END_LINE = 0x02
  static EMPTY_BEGIN_TEXT = 0x04
  static EMPTY_END_TEXT = 0x08
  static EMPTY_WORD_BOUNDARY = 0x10
  static EMPTY_NO_WORD_BOUNDARY = 0x20
  static EMPTY_ALL = -1

  static ZERO_CODEPOINT = '0'.codePointAt(0)
  static NINE_CODEPOINT = '9'.codePointAt(0)
  static A_UPPER_CODEPOINT = 'A'.codePointAt(0)
  static Z_UPPER_CODEPOINT = 'Z'.codePointAt(0)
  static A_LOWER_CODEPOINT = 'a'.codePointAt(0)
  static Z_LOWER_CODEPOINT = 'z'.codePointAt(0)
  static F_UPPER_CODEPOINT = 'F'.codePointAt(0)
  static F_LOWER_CODEPOINT = 'f'.codePointAt(0)
  static UNDERSCORE_CODEPOINT = '_'.codePointAt(0)
  static NEW_LINE_CODEPOINT = '\n'.codePointAt(0)

  // Returns true iff |c| is an ASCII letter or decimal digit.
  static isalnum(c) {
    return (
      (this.ZERO_CODEPOINT <= c && c <= this.NINE_CODEPOINT) ||
      (this.A_LOWER_CODEPOINT <= c && c <= this.Z_LOWER_CODEPOINT) ||
      (this.A_UPPER_CODEPOINT <= c && c <= this.Z_UPPER_CODEPOINT)
    )
  }

  // If |c| is an ASCII hex digit, returns its value, otherwise -1.
  static unhex(c) {
    if (this.ZERO_CODEPOINT <= c && c <= this.NINE_CODEPOINT) {
      return c - this.ZERO_CODEPOINT
    }
    if (this.A_LOWER_CODEPOINT <= c && c <= this.F_LOWER_CODEPOINT) {
      return c - this.A_LOWER_CODEPOINT + 10
    }
    if (this.A_UPPER_CODEPOINT <= c && c <= this.F_UPPER_CODEPOINT) {
      return c - this.A_UPPER_CODEPOINT + 10
    }
    return -1
  }

  // Appends a RE2 literal to |out| for rune |rune|,
  // with regexp metacharacters escaped.
  static escapeRune(out, rune) {
    if (Unicode.isPrint(rune)) {
      if (this.METACHARACTERS.indexOf(String.fromCodePoint(rune)) >= 0) {
        out.str += '\\'
      }
      out.str += String.fromCodePoint(rune)
    } else {
      switch (rune) {
        case 34: // '"'
          out.str += '\\"'
          break
        case 92: // '\\'
          out.str += '\\\\'
          break
        case 9: // '\t'
          out.str += '\\t'
          break
        case 10: // '\n'
          out.str += '\\n'
          break
        case 13: // '\r'
          out.str += '\\r'
          break
        case 8: // '\b'
          out.str += '\\b'
          break
        case 12: // '\f'
          out.str += '\\f'
          break
        default: {
          let s = rune.toString(16)
          if (rune < 0x100) {
            out.str += '\\x'
            if (s.length === 1) {
              out.str += '0'
            }
            out.str += s
          } else {
            out.str += '\\x{' + s + '}'
          }
          break
        }
      }
    }
  }

  // Returns the array of runes in the specified Java UTF-16 string.
  static stringToRunes(str) {
    let runes = []
    for (let i = 0; i < str.length; i++) {
      runes.push(str.codePointAt(i))
    }
    return runes
  }

  // Returns the Java UTF-16 string containing the single rune |r|.
  static runeToString(r) {
    return String.fromCodePoint(r)
  }

  // Returns a new copy of the specified subarray.
  static subarray(array, start, end) {
    return array.slice(start, end)
  }

  // Returns the index of the first occurrence of array |target| within
  // array |source| after |fromIndex|, or -1 if not found.
  static indexOf(source, target, fromIndex) {
    return source.indexOf(target, fromIndex)
  }

  // isWordRune reports whether r is consider a ``word character''
  // during the evaluation of the \b and \B zero-width assertions.
  // These assertions are ASCII-only: the word characters are [A-Za-z0-9_].
  static isWordRune(r) {
    return (
      (this.A_LOWER_CODEPOINT <= r && r <= this.Z_LOWER_CODEPOINT) ||
      (this.A_UPPER_CODEPOINT <= r && r <= this.Z_UPPER_CODEPOINT) ||
      (this.ZERO_CODEPOINT <= r && r <= this.NINE_CODEPOINT) ||
      r === this.UNDERSCORE_CODEPOINT
    )
  }

  // emptyOpContext returns the zero-width assertions satisfied at the position
  // between the runes r1 and r2, a bitmask of EMPTY_* flags.
  // Passing r1 == -1 indicates that the position is at the beginning of the
  // text.
  // Passing r2 == -1 indicates that the position is at the end of the text.
  // TODO(adonovan): move to Machine.
  static emptyOpContext(r1, r2) {
    let op = 0
    if (r1 < 0) {
      op |= this.EMPTY_BEGIN_TEXT | this.EMPTY_BEGIN_LINE
    }
    if (r1 === this.NEW_LINE_CODEPOINT) {
      op |= this.EMPTY_BEGIN_LINE
    }
    if (r2 < 0) {
      op |= this.EMPTY_END_TEXT | this.EMPTY_END_LINE
    }
    if (r2 === this.NEW_LINE_CODEPOINT) {
      op |= this.EMPTY_END_LINE
    }
    if (this.isWordRune(r1) !== this.isWordRune(r2)) {
      op |= this.EMPTY_WORD_BOUNDARY
    } else {
      op |= this.EMPTY_NO_WORD_BOUNDARY
    }
    return op
  }

  /**
   * Returns a string that quotes all regular expression metacharacters inside the argument text;
   * the returned string is a regular expression matching the literal text. For example,
   * {@code quoteMeta("[foo]").equals("\\[foo\\]")}.
   */
  static quoteMeta(s) {
    let b = ''
    for (let i = 0, len = s.length; i < len; i++) {
      let c = s.charAt(i)
      if (this.METACHARACTERS.indexOf(c) >= 0) {
        b += '\\'
      }
      b += c
    }
    return b
  }

  static charCount(codePoint) {
    return codePoint > 0xffff ? 2 : 1
  }
}

export { Utils }
