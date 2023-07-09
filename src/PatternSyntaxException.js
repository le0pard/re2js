/**
 * An exception thrown by the parser if the pattern was invalid.
 */
class PatternSyntaxException extends Error {
  constructor(error, input = null) {
    let message = `error parsing regexp: ${error}`
    if (input) {
      message += `: \`${input}\``
    }

    super(message)
    this.message = message
    this.error = error
    this.input = input
  }

  /**
   * Retrieves the description of the error.
   */
  getDescription() {
    return this.error
  }

  /**
   * Retrieves the erroneous regular-expression pattern.
   */
  getPattern() {
    return this.input
  }
}

export { PatternSyntaxException }
