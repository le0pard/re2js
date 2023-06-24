class Characters {
  static toLowerCase(codePoint) {
    return String.fromCharCode(codePoint).substring(0, 1).toLowerCase().charCodeAt(0)
  }
  static toUpperCase(codePoint) {
    return String.fromCharCode(codePoint).substring(0, 1).toUpperCase().charCodeAt(0)
  }
}

export { Characters }
