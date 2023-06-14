class Utils {
  static EMPTY_INTS = []

  static METACHARACTERS = '\\.+*?()|[]{}^$'

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

  static isalnum(c) {
    return (this.ZERO_CODEPOINT <= c && c <= this.NINE_CODEPOINT) || (this.A_UPPER_CODEPOINT <= c && c <= this.Z_UPPER_CODEPOINT) || (this.A_LOWER_CODEPOINT <= c && c <= this.Z_LOWER_CODEPOINT)
  }

  static unhex(c) {
    if (this.ZERO_CODEPOINT <= c && c <= this.NINE_CODEPOINT) {
      return c.charCodeAt(0) - this.ZERO_CODEPOINT
    }
    if (this.A_LOWER_CODEPOINT <= c && c <= this.F_LOWER_CODEPOINT) {
      return c.charCodeAt(0) - this.A_LOWER_CODEPOINT + 10
    }
    if (this.A_UPPER_CODEPOINT <= c && c <= this.F_UPPER_CODEPOINT) {
      return c.charCodeAt(0) - this.A_UPPER_CODEPOINT + 10
    }
    return -1
  }

  static escapeRune(rune) {
    let out = ''
    if (this.METACHARACTERS.indexOf(String.fromCharCode(rune)) >= 0) {
      out += '\\'
    }
    out += String.fromCodePoint(rune)
    return out
  }

  static stringToRunes(str) {
    let runes = []
    for (let i = 0; i < str.length; i++) {
      runes.push(str.codePointAt(i))
    }
    return runes
  }

  static runeToString(r) {
    return String.fromCodePoint(r)
  }

  static subarray(array, start, end) {
    return array.slice(start, end)
  }

  static indexOf(source, target, fromIndex) {
    return source.indexOf(target, fromIndex)
  }

  static isWordRune(r) {
    return ((this.A_UPPER_CODEPOINT <= r && r <= this.Z_UPPER_CODEPOINT) || (this.A_LOWER_CODEPOINT <= r && r <= this.Z_LOWER_CODEPOINT) || (this.ZERO_CODEPOINT <= r && r <= this.NINE_CODEPOINT) || r === '_')
  }

  static emptyOpContext(r1, r2) {
    let op = 0
    if (r1 < 0) {
      op |= this.EMPTY_BEGIN_TEXT | this.EMPTY_BEGIN_LINE
    }
    if (r1 === '\n') {
      op |= this.EMPTY_BEGIN_LINE
    }
    if (r2 < 0) {
      op |= this.EMPTY_END_TEXT | this.EMPTY_END_LINE
    }
    if (r2 === '\n') {
      op |= this.EMPTY_END_LINE
    }
    if (this.isWordRune(r1) !== this.isWordRune(r2)) {
      op |= this.EMPTY_WORD_BOUNDARY
    } else {
      op |= this.EMPTY_NO_WORD_BOUNDARY
    }
    return op
  }
}

export { Utils }
