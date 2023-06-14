class Characters {
  static toLowerCase(codePoint) {
    return String.fromCodePoint(codePoint).toLowerCase().codePointAt(0)
  }

  static toUpperCase(codePoint) {
    return String.fromCodePoint(codePoint).toUpperCase().codePointAt(0)
  }
}

export { Characters }
