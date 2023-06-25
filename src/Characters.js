class Characters {
  static toLowerCase(codePoint) {
    return String.fromCharCode(codePoint).toLowerCase().charCodeAt(0)
  }
  static toUpperCase(codePoint) {
    return String.fromCharCode(codePoint).toUpperCase().charCodeAt(0)
  }
}

export { Characters }
