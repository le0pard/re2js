/**
 * Various constants and helper for unicode codepoints.
 */
class Codepoint {
  // codePointAt(0)
  static CODES = new Map([
    ['\x07', 7],
    ['\b', 8],
    ['\t', 9],
    ['\n', 10],
    ['\v', 11],
    ['\f', 12],
    ['\r', 13],
    [' ', 32],
    ['"', 34],
    ['$', 36],
    ['(', 40],
    [')', 41],
    ['*', 42],
    ['+', 43],
    ['-', 45],
    ['.', 46],
    ['0', 48],
    ['1', 49],
    ['2', 50],
    ['3', 51],
    ['4', 52],
    ['5', 53],
    ['6', 54],
    ['7', 55],
    ['8', 56],
    ['9', 57],
    [':', 58],
    ['?', 63],
    ['A', 65],
    ['B', 66],
    ['C', 67],
    ['F', 70],
    ['P', 80],
    ['Q', 81],
    ['U', 85],
    ['Z', 90],
    ['[', 91],
    ['\\', 92],
    [']', 93],
    ['^', 94],
    ['_', 95],
    ['a', 97],
    ['b', 98],
    ['f', 102],
    ['i', 105],
    ['m', 109],
    ['n', 110],
    ['r', 114],
    ['s', 115],
    ['t', 116],
    ['v', 118],
    ['x', 120],
    ['z', 122],
    ['{', 123],
    ['|', 124],
    ['}', 125]
  ])

  // convert unicode codepoint to upper case codepoint
  // return same codepoint, if cannot do it (or codepoint not have upper variation)
  static toUpperCase(codepoint) {
    const s = String.fromCodePoint(codepoint).toUpperCase()
    if (s.length > 1) {
      return codepoint
    }
    const sOrigin = String.fromCodePoint(s.codePointAt(0)).toLowerCase()
    if (sOrigin.length > 1 || sOrigin.codePointAt(0) !== codepoint) {
      return codepoint
    }
    return s.codePointAt(0)
  }

  // convert unicode codepoint to lower case codepoint
  // return same codepoint, if cannot do it (or codepoint not have lower variation)
  static toLowerCase(codepoint) {
    const s = String.fromCodePoint(codepoint).toLowerCase()
    if (s.length > 1) {
      return codepoint
    }
    const sOrigin = String.fromCodePoint(s.codePointAt(0)).toUpperCase()
    if (sOrigin.length > 1 || sOrigin.codePointAt(0) !== codepoint) {
      return codepoint
    }
    return s.codePointAt(0)
  }
}

export { Codepoint }
