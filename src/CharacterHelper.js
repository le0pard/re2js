class CharacterHelper {
  static codePointAt(str, index) {
    return str.charCodeAt(index)
  }

  static codePointBefore(str, index) {
    return str.codePointAt(index - 1)
  }

  static charCount(codePoint) {
    return codePoint > 0xFFFF ? 2 : 1
  }
}

export { CharacterHelper }
