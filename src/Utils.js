let Utils = {
  EMPTY_INTS: [],

  isalnum: function(c) {
    return ('0' <= c && c <= '9') || ('A' <= c && c <= 'Z') || ('a' <= c && c <= 'z');
  },

  unhex: function(c) {
    if ('0' <= c && c <= '9') {
      return c.charCodeAt(0) - '0'.charCodeAt(0);
    }
    if ('a' <= c && c <= 'f') {
      return c.charCodeAt(0) - 'a'.charCodeAt(0) + 10;
    }
    if ('A' <= c && c <= 'F') {
      return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
    }
    return -1;
  },

  METACHARACTERS: "\\.+*?()|[]{}^$",

  escapeRune: function(out, rune) {
    if (this.isalnum(rune)) {
      if (this.METACHARACTERS.includes(rune)) {
        out += '\\';
      }
      out += rune;
    } else {
      switch (rune) {
        case '\"':
          out += "\\\"";
          break;
        case '\\':
          out += "\\\\";
          break;
        case '\t':
          out += "\\t";
          break;
        case '\n':
          out += "\\n";
          break;
        case '\r':
          out += "\\r";
          break;
        case '\b':
          out += "\\b";
          break;
        case '\f':
          out += "\\f";
          break;
        default:
          let s = rune.toString(16);
          if (rune < 0x100) {
            out += "\\x";
            if (s.length == 1) {
              out += '0';
            }
            out += s;
          } else {
            out += "\\x{" + s + "}";
          }
      }
    }
    return out;
  },

  stringToRunes: function(str) {
    return Array.from(str).map(c => c.charCodeAt(0));
  },

  runeToString: function(r) {
    return String.fromCharCode(r);
  },

  subarray: function(array, start, end) {
    return array.slice(start, end);
  },

  indexOf: function(source, target, fromIndex) {
    if (fromIndex < 0) {
      fromIndex = 0;
    }
    if (target.length === 0) {
      return fromIndex;
    }

    const sourceStr = String.fromCharCode(...source);
    const targetStr = String.fromCharCode(...target);

    return sourceStr.indexOf(targetStr, fromIndex);
  },

  isWordRune: function(r) {
    return ('A' <= r && r <= 'Z') || ('a' <= r && r <= 'z') || ('0' <= r && r <= '9') || r == '_';
  },

  EMPTY_BEGIN_LINE: 0x01,
  EMPTY_END_LINE: 0x02,
  EMPTY_BEGIN_TEXT: 0x04,
  EMPTY_END_TEXT: 0x08,
  EMPTY_WORD_BOUNDARY: 0x10,
  EMPTY_NO_WORD_BOUNDARY: 0x20,
  EMPTY_ALL: -1,

  emptyOpContext: function(r1, r2) {
    let op = 0;
    if (r1 < 0) {
      op |= this.EMPTY_BEGIN_TEXT | this.EMPTY_BEGIN_LINE;
    }
    if (r1 == '\n') {
      op |= this.EMPTY_BEGIN_LINE;
    }
    if (r2 < 0) {
      op |= this.EMPTY_END_TEXT | this.EMPTY_END_LINE;
    }
    if (r2 == '\n') {
      op |= this.EMPTY_END_LINE;
    }
    if (this.isWordRune(r1) != this.isWordRune(r2)) {
      op |= this.EMPTY_WORD_BOUNDARY;
    } else {
      op |= this.EMPTY_NO_WORD_BOUNDARY;
    }
    return op;
  }
}
