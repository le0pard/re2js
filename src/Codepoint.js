class Codepoint {
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
