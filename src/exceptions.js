class RE2JSException extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'RE2JSException'
  }
}

/**
 * An exception thrown by the parser if the pattern was invalid.
 */
class RE2JSSyntaxException extends RE2JSException {
  /**
   * @param {string} error
   * @param {string|null} [input=null]
   */
  constructor(error, input = null) {
    let message = `error parsing regexp: ${error}`
    if (input) {
      message += `: \`${input}\``
    }

    super(message)
    this.name = 'RE2JSSyntaxException'
    this.message = message
    /** @type {string} */
    this.error = error
    /** @type {string|null} */
    this.input = input
  }

  /**
   * Retrieves the description of the error.
   * @returns {string}
   */
  getDescription() {
    return this.error
  }

  /**
   * Retrieves the erroneous regular-expression pattern.
   * @returns {string|null}
   */
  getPattern() {
    return this.input
  }
}

/**
 * An exception thrown by the compiler
 */
class RE2JSCompileException extends RE2JSException {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'RE2JSCompileException'
  }
}

/**
 * An exception thrown by using groups
 */
class RE2JSGroupException extends RE2JSException {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'RE2JSGroupException'
  }
}

/**
 * An exception thrown by flags
 */
class RE2JSFlagsException extends RE2JSException {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'RE2JSFlagsException'
  }
}

export {
  RE2JSException,
  RE2JSSyntaxException,
  RE2JSCompileException,
  RE2JSGroupException,
  RE2JSFlagsException
}
