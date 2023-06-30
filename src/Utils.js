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
    return String(str)
      .split('')
      .map((s) => s.codePointAt(0))
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
  static indexOf(source, target, fromIndex = 0) {
    let targetLength = target.length
    if (targetLength === 0) {
      return -1
    }

    let sourceLength = source.length
    for (let i = fromIndex; i <= sourceLength - targetLength; i++) {
      for (let j = 0; j < targetLength; j++) {
        if (source[i + j] !== target[j]) {
          break
        } else if (j === targetLength - 1) {
          return i
        }
      }
    }

    return -1
  }

  // isWordRune reports whether r is consider a ``word character''
  // during the evaluation of the \b and \B zero-width assertions.
  // These assertions are ASCII-only: the word characters are [A-Za-z0-9_].
  static isWordRune(r) {
    return (
      //Unicode.isLetter(r) ||
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
    return codePoint > Unicode.MAX_BMP ? 2 : 1
  }

  static stringToUtf8ByteArray(str) {
    if (globalThis.TextEncoder) {
      return Array.from(new TextEncoder().encode(str))
    } else {
      // fallback, if no TextEncoder
      let out = [],
        p = 0
      for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i)
        if (c < 128) {
          out[p++] = c
        } else if (c < 2048) {
          out[p++] = (c >> 6) | 192
          out[p++] = (c & 63) | 128
        } else if (
          (c & 0xfc00) === 0xd800 &&
          i + 1 < str.length &&
          (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00
        ) {
          // Surrogate Pair
          c = 0x10000 + ((c & 0x03ff) << 10) + (str.charCodeAt(++i) & 0x03ff)
          out[p++] = (c >> 18) | 240
          out[p++] = ((c >> 12) & 63) | 128
          out[p++] = ((c >> 6) & 63) | 128
          out[p++] = (c & 63) | 128
        } else {
          out[p++] = (c >> 12) | 224
          out[p++] = ((c >> 6) & 63) | 128
          out[p++] = (c & 63) | 128
        }
      }
      return out
    }
  }

  static utf8ByteArrayToString(bytes) {
    if (globalThis.TextDecoder) {
      return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
    } else {
      // fallback, if no TextDecoder
      let out = [],
        pos = 0,
        c = 0
      while (pos < bytes.length) {
        let c1 = bytes[pos++]
        if (c1 < 128) {
          out[c++] = String.fromCharCode(c1)
        } else if (c1 > 191 && c1 < 224) {
          let c2 = bytes[pos++]
          out[c++] = String.fromCharCode(((c1 & 31) << 6) | (c2 & 63))
        } else if (c1 > 239 && c1 < 365) {
          // Surrogate Pair
          let c2 = bytes[pos++]
          let c3 = bytes[pos++]
          let c4 = bytes[pos++]
          let u = (((c1 & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) - 0x10000
          out[c++] = String.fromCharCode(0xd800 + (u >> 10))
          out[c++] = String.fromCharCode(0xdc00 + (u & 1023))
        } else {
          let c2 = bytes[pos++]
          let c3 = bytes[pos++]
          out[c++] = String.fromCharCode(((c1 & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63))
        }
      }
      return out.join('')
    }
  }
}

export { Utils }
