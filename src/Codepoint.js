/**
 * Various constants and helper for unicode codepoints.
 */
class Codepoint {
  // codePointAt(0)
  static CODES = new Map([
    ['\b', 8],
    ['\t', 9],
    ['\n', 10],
    ['\f', 12],
    ['\r', 13],
    ['"', 34],
    ['$', 36],
    ['-', 45],
    ['0', 48],
    ['9', 57],
    ['A', 65],
    ['F', 70],
    ['Z', 90],
    ['\\', 92],
    ['_', 95],
    ['a', 97],
    ['f', 102],
    ['z', 122]
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
