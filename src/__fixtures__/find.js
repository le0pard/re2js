import { Utils } from '../Utils'

class Test {
  constructor(pat, text, n, ...x) {
    this.pat = pat
    this.text = text
    this.textUTF8 = this.toUTF8(text)
    this.matches = []

    if (n > 0) {
      const runLength = Math.floor(x.length / n)
      for (let i = 0, j = 0; i < n; i++) {
        this.matches[i] = x.slice(j, j + runLength)
        j += runLength
        if (j > x.length) {
          throw new Error('invalid build entry')
        }
      }
    }
  }

  // Converts a string to a UTF8 byte array
  toUTF8(string) {
    // TODO(user): Use native implementations if/when available
    let out = [],
      p = 0
    for (let i = 0; i < string.length; i++) {
      let c = string.codePointAt(i)
      if (c < 128) {
        out[p++] = c
      } else if (c < 2048) {
        out[p++] = (c >> 6) | 192
        out[p++] = (c & 63) | 128
      } else if (
        (c & 0xfc00) == 0xd800 &&
        i + 1 < string.length &&
        (string.codePointAt(i + 1) & 0xfc00) == 0xdc00
      ) {
        // Surrogate Pair
        c = 0x10000 + ((c & 0x03ff) << 10) + (string.codePointAt(++i) & 0x03ff)
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

  // Converts a UTF8 byte array to a string
  fromUTF8(bytes) {
    let out = [],
      pos = 0,
      c = 0
    while (pos < bytes.length) {
      let c1 = bytes[pos++]
      if (c1 < 128) {
        out[c++] = String.fromCharCode(c1)
      } else if (c1 > 191 && c1 < 224) {
        var c2 = bytes[pos++]
        out[c++] = String.fromCharCode(((c1 & 31) << 6) | (c2 & 63))
      } else if (c1 > 239 && c1 < 365) {
        // Surrogate Pair
        var c2 = bytes[pos++]
        var c3 = bytes[pos++]
        let c4 = bytes[pos++]
        let u = (((c1 & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) - 0x10000
        out[c++] = String.fromCharCode(0xd800 + (u >> 10))
        out[c++] = String.fromCharCode(0xdc00 + (u & 1023))
      } else {
        var c2 = bytes[pos++]
        var c3 = bytes[pos++]
        out[c++] = String.fromCharCode(((c1 & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63))
      }
    }
    return out.join('')
  }

  submatchBytes(i, j) {
    return Utils.subarray(this.textUTF8, this.matches[i][2 * j], this.matches[i][2 * j + 1])
  }

  submatchString(i, j) {
    return this.fromUTF8(this.submatchBytes(i, j))
  }

  toString() {
    return `pat=${this.pat} text=${this.text} len=${this.matches.length} matches=${JSON.stringify(
      this.matches
    )}`
  }
}

export const FIND_TESTS = [
  new Test('', '', 1, 0, 0),
  new Test('^abcdefg', 'abcdefg', 1, 0, 7),
  new Test('a+', 'baaab', 1, 1, 4),
  new Test('abcd..', 'abcdef', 1, 0, 6),
  new Test('a', 'a', 1, 0, 1),
  new Test('x', 'y', 0),
  new Test('b', 'abc', 1, 1, 2),
  new Test('.', 'a', 1, 0, 1),
  new Test('.*', 'abcdef', 1, 0, 6),
  new Test('^', 'abcde', 1, 0, 0),
  new Test('$', 'abcde', 1, 5, 5),
  new Test('^abcd$', 'abcd', 1, 0, 4),
  new Test("^bcd'", 'abcdef', 0),
  new Test('^abcd$', 'abcde', 0),
  new Test('a+', 'baaab', 1, 1, 4),
  new Test('a*', 'baaab', 3, 0, 0, 1, 4, 5, 5),
  new Test('[a-z]+', 'abcd', 1, 0, 4),
  new Test('[^a-z]+', 'ab1234cd', 1, 2, 6),
  new Test('[a\\-\\]z]+', 'az]-bcz', 2, 0, 4, 6, 7),
  new Test('[^\\n]+', 'abcd\n', 1, 0, 4),
  new Test('[日本語]+', '日本語日本語', 1, 0, 18),
  new Test('日本語+', '日本語', 1, 0, 9),
  new Test('日本語+', '日本語語語語', 1, 0, 18),
  new Test('()', '', 1, 0, 0, 0, 0),
  new Test('(a)', 'a', 1, 0, 1, 0, 1),
  new Test('(.)(.)', '日a', 1, 0, 4, 0, 3, 3, 4),
  new Test('(.*)', '', 1, 0, 0, 0, 0),
  new Test('(.*)', 'abcd', 1, 0, 4, 0, 4),
  new Test('(..)(..)', 'abcd', 1, 0, 4, 0, 2, 2, 4),
  new Test('(([^xyz]*)(d))', 'abcd', 1, 0, 4, 0, 4, 0, 3, 3, 4),
  new Test('((a|b|c)*(d))', 'abcd', 1, 0, 4, 0, 4, 2, 3, 3, 4),
  new Test('(((a|b|c)*)(d))', 'abcd', 1, 0, 4, 0, 4, 0, 3, 2, 3, 3, 4),
  new Test('\\a\\f\\n\\r\\t\\v', '\x07\f\n\r\t\v', 1, 0, 6),
  new Test('[\\a\\f\\n\\r\\t\\v]+', '\x07\f\n\r\t\v', 1, 0, 6),
  new Test('a*(|(b))c*', 'aacc', 1, 0, 4, 2, 2, -1, -1),
  new Test('(.*).*', 'ab', 1, 0, 2, 0, 2),
  new Test('[.]', '.', 1, 0, 1),
  new Test('/$', '/abc/', 1, 4, 5),
  new Test('/$', '/abc', 0),

  // multiple matches
  new Test('.', 'abc', 3, 0, 1, 1, 2, 2, 3),
  new Test('(.)', 'abc', 3, 0, 1, 0, 1, 1, 2, 1, 2, 2, 3, 2, 3),
  new Test('.(.)', 'abcd', 2, 0, 2, 1, 2, 2, 4, 3, 4),
  new Test('ab*', 'abbaab', 3, 0, 3, 3, 4, 4, 6),
  new Test('a(b*)', 'abbaab', 3, 0, 3, 1, 3, 3, 4, 4, 4, 4, 6, 5, 6),

  // fixed bugs
  new Test('ab$', 'cab', 1, 1, 3),
  new Test('axxb$', 'axxcb', 0),
  new Test('data', 'daXY data', 1, 5, 9),
  new Test('da(.)a$', 'daXY data', 1, 5, 9, 7, 8),
  new Test('zx+', 'zzx', 1, 1, 3),
  new Test('ab$', 'abcab', 1, 3, 5),
  new Test('(aa)*$', 'a', 1, 1, 1, -1, -1),
  new Test('(?:.|(?:.a))', '', 0),
  new Test('(?:A(?:A|a))', 'Aa', 1, 0, 2),
  new Test('(?:A|(?:A|a))', 'a', 1, 0, 1),
  new Test('(a){0}', '', 1, 0, 0, -1, -1),
  new Test('(?-s)(?:(?:^).)', '\n', 0),
  new Test('(?s)(?:(?:^).)', '\n', 1, 0, 1),
  new Test('(?:(?:^).)', '\n', 0),
  new Test('\\b', 'x', 2, 0, 0, 1, 1),
  new Test('\\b', 'xx', 2, 0, 0, 2, 2),
  new Test('\\b', 'x y', 4, 0, 0, 1, 1, 2, 2, 3, 3),
  new Test('\\b', 'xx yy', 4, 0, 0, 2, 2, 3, 3, 5, 5),
  new Test('\\B', 'x', 0),
  new Test('\\B', 'xx', 1, 1, 1),
  new Test('\\B', 'x y', 0),
  new Test('\\B', 'xx yy', 2, 1, 1, 4, 4),

  // RE2 tests
  new Test('[^\\S\\s]', 'abcd', 0),
  new Test('[^\\S[:space:]]', 'abcd', 0),
  new Test('[^\\D\\d]', 'abcd', 0),
  new Test('[^\\D[:digit:]]', 'abcd', 0),
  new Test('(?i)\\W', 'x', 0),
  new Test('(?i)\\W', 'k', 0),
  new Test('(?i)\\W', 's', 0),

  // can backslash-escape any punctuation
  new Test(
    '\\!\\"\\#\\$\\%\\&\\\'\\(\\)\\*\\+\\,\\-\\.\\/\\:\\;\\<\\=\\>\\?\\@\\[\\\\\\]\\^\\_\\{\\|\\}\\~',
    '!"#$%&\'()*+,-./:;<=>?@[\\]^_{|}~',
    1,
    0,
    31
  ),
  new Test(
    '[\\!\\"\\#\\$\\%\\&\\\'\\(\\)\\*\\+\\,\\-\\.\\/\\:\\;\\<\\=\\>\\?\\@\\[\\\\\\]\\^\\_\\{\\|\\}\\~]+',
    '!"#$%&\'()*+,-./:;<=>?@[\\]^_{|}~',
    1,
    0,
    31
  ),
  new Test('\\`', '`', 1, 0, 1),
  new Test('[\\`]+', '`', 1, 0, 1),

  // long set of matches
  new Test(
    '.',
    'qwertyuiopasdfghjklzxcvbnm1234567890',
    36,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13,
    14,
    14,
    15,
    15,
    16,
    16,
    17,
    17,
    18,
    18,
    19,
    19,
    20,
    20,
    21,
    21,
    22,
    22,
    23,
    23,
    24,
    24,
    25,
    25,
    26,
    26,
    27,
    27,
    28,
    28,
    29,
    29,
    30,
    30,
    31,
    31,
    32,
    32,
    33,
    33,
    34,
    34,
    35,
    35,
    36
  ),
  new Test('(|a)*', 'aa', 3, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2)
]
