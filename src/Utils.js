import { Codepoint } from './Codepoint.js'
import { Unicode } from './Unicode.js'
/**
 * Size of the precomputed single-byte lookup table.
 * Covers standard ASCII and Latin-1 characters for fast-path execution.
 */
const FAST_PATH_TABLE_SIZE = 256
/**
 * Precomputed lookup table for Word Boundary (\b, \B) assertions.
 * * By precomputing the boolean results for standard ASCII word ranges
 * ('a'-'z', 'A'-'Z', '0'-'9', '_'), we completely eliminate 4 logical
 * branches from the NFA's hot execution loop. This prevents costly
 * CPU branch mispredictions when scanning large strings.
 */
const WORD_RUNE_TABLE = new Uint8Array(FAST_PATH_TABLE_SIZE)
for (let i = 0; i < FAST_PATH_TABLE_SIZE; i++) {
  WORD_RUNE_TABLE[i] =
    (97 <= i && i <= 122) || // 'a' - 'z'
    (65 <= i && i <= 90) || // 'A' - 'Z'
    (48 <= i && i <= 57) || // '0' - '9'
    i === 95 // '_'
      ? 1
      : 0
}

let cachedNativeEncoder = null
let cachedNativeDecoder = null
/**
 * Various constants and helper utilities.
 */
class Utils {
  static METACHARACTERS = '\\.+*?()|[]{}^$'

  //// EMPTY_* flags
  static EMPTY_BEGIN_LINE = 0x01
  static EMPTY_END_LINE = 0x02
  static EMPTY_BEGIN_TEXT = 0x04
  static EMPTY_END_TEXT = 0x08
  static EMPTY_WORD_BOUNDARY = 0x10
  static EMPTY_NO_WORD_BOUNDARY = 0x20
  static EMPTY_ALL = -1

  static emptyInts() {
    return []
  }

  static isByteArray(input) {
    return Array.isArray(input) || input instanceof Uint8Array
  }

  // Returns true iff |c| is an ASCII letter or decimal digit.
  static isalnum(c) {
    return (
      (Codepoint.CODES.get('0') <= c && c <= Codepoint.CODES.get('9')) ||
      (Codepoint.CODES.get('a') <= c && c <= Codepoint.CODES.get('z')) ||
      (Codepoint.CODES.get('A') <= c && c <= Codepoint.CODES.get('Z'))
    )
  }

  // If |c| is an ASCII hex digit, returns its value, otherwise -1.
  static unhex(c) {
    if (Codepoint.CODES.get('0') <= c && c <= Codepoint.CODES.get('9')) {
      return c - Codepoint.CODES.get('0')
    }
    if (Codepoint.CODES.get('a') <= c && c <= Codepoint.CODES.get('f')) {
      return c - Codepoint.CODES.get('a') + 10
    }
    if (Codepoint.CODES.get('A') <= c && c <= Codepoint.CODES.get('F')) {
      return c - Codepoint.CODES.get('A') + 10
    }
    return -1
  }

  // Appends a RE2 literal to |out| for rune |rune|,
  // with regexp metacharacters escaped.
  static escapeRune(rune) {
    let out = ''
    if (Unicode.isPrint(rune)) {
      if (Utils.METACHARACTERS.indexOf(String.fromCodePoint(rune)) >= 0) {
        out += '\\'
      }
      out += String.fromCodePoint(rune)
    } else {
      switch (rune) {
        case Codepoint.CODES.get('"'): // '"'
          out += '\\"'
          break
        case Codepoint.CODES.get('\\'): // '\\'
          out += '\\\\'
          break
        case Codepoint.CODES.get('\t'): // '\t'
          out += '\\t'
          break
        case Codepoint.CODES.get('\n'): // '\n'
          out += '\\n'
          break
        case Codepoint.CODES.get('\r'): // '\r'
          out += '\\r'
          break
        case Codepoint.CODES.get('\b'): // '\b'
          out += '\\b'
          break
        case Codepoint.CODES.get('\f'): // '\f'
          out += '\\f'
          break
        default: {
          let s = rune.toString(16)
          if (rune < 0x100) {
            out += '\\x'
            if (s.length === 1) {
              out += '0'
            }
            out += s
          } else {
            out += `\\x{${s}}`
          }
          break
        }
      }
    }
    return out
  }

  // Returns the array of runes in the specified JS UTF-16 string.
  static stringToRunes(str) {
    const string = String(str)
    const runes = []
    let i = 0

    while (i < string.length) {
      const cp = string.codePointAt(i)
      runes.push(cp)
      // Surrogate pairs (Emojis, etc.) are > 0xFFFF
      i += cp > Unicode.MAX_BMP ? 2 : 1
    }

    return runes
  }

  // Returns the JS UTF-16 string containing the single rune |r|.
  static runeToString(r) {
    return String.fromCodePoint(r)
  }

  // isWordRune reports whether r is consider a ``word character''
  // during the evaluation of the \b and \B zero-width assertions.
  // These assertions are ASCII-only: the word characters are [A-Za-z0-9_].
  static isWordRune(r) {
    return r < FAST_PATH_TABLE_SIZE ? WORD_RUNE_TABLE[r] === 1 : false
  }

  // emptyOpContext returns the zero-width assertions satisfied at the position
  // between the runes r1 and r2, a bitmask of EMPTY_* flags.
  // Passing r1 == -1 indicates that the position is at the beginning of the
  // text.
  // Passing r2 == -1 indicates that the position is at the end of the text.
  // eslint-disable-next-line no-warning-comments
  // TODO(adonovan): move to Machine.
  static emptyOpContext(r1, r2) {
    let op = 0

    if (r1 < 0) {
      op |= Utils.EMPTY_BEGIN_TEXT | Utils.EMPTY_BEGIN_LINE
    }
    // Hardcode 10 for '\n'
    if (r1 === 10) {
      op |= Utils.EMPTY_BEGIN_LINE
    }
    if (r2 < 0) {
      op |= Utils.EMPTY_END_TEXT | Utils.EMPTY_END_LINE
    }

    // Hardcode 10 for '\n'
    if (r2 === 10) {
      op |= Utils.EMPTY_END_LINE
    }
    if (Utils.isWordRune(r1) !== Utils.isWordRune(r2)) {
      op |= Utils.EMPTY_WORD_BOUNDARY
    } else {
      op |= Utils.EMPTY_NO_WORD_BOUNDARY
    }
    return op
  }

  /**
   * Returns a string that quotes all regular expression metacharacters inside the argument text;
   * the returned string is a regular expression matching the literal text. For example,
   * {@code quoteMeta("[foo]").equals("\\[foo\\]")}.
   * @param {string} str
   * @returns {string}
   */
  static quoteMeta(str) {
    return str
      .split('') // A char loop is correct because all metacharacters fit in one UTF-16 code.
      .map((s) => {
        if (Utils.METACHARACTERS.indexOf(s) >= 0) {
          return `\\${s}`
        }
        return s
      })
      .join('')
  }

  static charCount(codePoint) {
    return codePoint > Unicode.MAX_BMP ? 2 : 1
  }

  /**
   * High-speed conversion from TypedArrays to standard JS Arrays.
   * Bypasses the expensive Symbol.iterator overhead of Array.from()
   */
  static toArray(typedArray) {
    const len = typedArray.length
    const res = new Array(len)
    for (let i = 0; i < len; i++) {
      res[i] = typedArray[i]
    }
    return res
  }

  static stringToUtf8ByteArray(str) {
    if (globalThis.TextEncoder) {
      if (!cachedNativeEncoder) cachedNativeEncoder = new TextEncoder()

      return Utils.toArray(cachedNativeEncoder.encode(str))
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
          (c & 0xfc00) === Unicode.MIN_HIGH_SURROGATE &&
          i + 1 < str.length &&
          (str.charCodeAt(i + 1) & 0xfc00) === Unicode.MIN_LOW_SURROGATE
        ) {
          // Surrogate Pair
          c =
            Unicode.MIN_SUPPLEMENTARY_CODE_POINT +
            ((c & 0x03ff) << 10) +
            (str.charCodeAt(++i) & 0x03ff)
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
      if (!cachedNativeDecoder) cachedNativeDecoder = new TextDecoder('utf-8')

      const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      return cachedNativeDecoder.decode(view)
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
          let u =
            (((c1 & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) -
            Unicode.MIN_SUPPLEMENTARY_CODE_POINT
          out[c++] = String.fromCharCode(Unicode.MIN_HIGH_SURROGATE + (u >> 10))
          out[c++] = String.fromCharCode(Unicode.MIN_LOW_SURROGATE + (u & 1023))
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
