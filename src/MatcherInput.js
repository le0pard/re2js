/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
/**
 * Abstract the representations of input text supplied to Matcher.
 * @class
 */
export class MatcherInput {
  /**
   * Return the MatcherInput for UTF_16 encoding.
   * @param {*} charSequence
   * @return {MatcherInput}
   */
  static utf16(charSequence) {
    return new MatcherInput.Utf16MatcherInput(charSequence)
  }
  static utf8$byte_A(bytes) {
    return new MatcherInput.Utf8MatcherInput(bytes)
  }
  /**
   * Return the MatcherInput for UTF_8 encoding.
   * @param {byte[]} bytes
   * @return {MatcherInput}
   */
  static utf8(bytes) {
    if (
      (bytes != null &&
        bytes instanceof Array &&
        (bytes.length == 0 || bytes[0] == null || typeof bytes[0] === 'number')) ||
      bytes === null
    ) {
      return MatcherInput.utf8$byte_A(bytes)
    } else if (typeof bytes === 'string' || bytes === null) {
      return MatcherInput.utf8$java_lang_String(bytes)
    } else {
      throw new Error('invalid overload')
    }
  }
  static utf8$java_lang_String(input) {
    return new MatcherInput.Utf8MatcherInput(
      /* getBytes */ input.split('').map((s) => s.codePointAt(0))
    )
  }
}
MatcherInput['__class'] = 'quickstart.MatcherInput'
;(function (MatcherInput) {
  let Encoding
  ;(function (Encoding) {
    Encoding[(Encoding['UTF_16'] = 0)] = 'UTF_16'
    Encoding[(Encoding['UTF_8'] = 1)] = 'UTF_8'
  })((Encoding = MatcherInput.Encoding || (MatcherInput.Encoding = {})))
  class Utf8MatcherInput extends MatcherInput {
    constructor(bytes) {
      super()
      if (this.bytes === undefined) {
        this.bytes = null
      }
      this.bytes = bytes
    }
    /**
     *
     * @return {MatcherInput.Encoding}
     */
    getEncoding() {
      return MatcherInput.Encoding.UTF_8
    }
    /**
     *
     * @return {*}
     */
    asCharSequence() {
      return String.fromCharCode.apply(null, this.bytes)
    }
    /**
     *
     * @return {byte[]}
     */
    asBytes() {
      return this.bytes
    }
    /**
     *
     * @return {number}
     */
    length() {
      return this.bytes.length
    }
  }
  MatcherInput.Utf8MatcherInput = Utf8MatcherInput
  Utf8MatcherInput['__class'] = 'quickstart.MatcherInput.Utf8MatcherInput'
  class Utf16MatcherInput extends MatcherInput {
    constructor(charSequence) {
      super()
      if (this.charSequence === undefined) {
        this.charSequence = null
      }
      this.charSequence = charSequence
    }
    /**
     *
     * @return {MatcherInput.Encoding}
     */
    getEncoding() {
      return MatcherInput.Encoding.UTF_16
    }
    /**
     *
     * @return {*}
     */
    asCharSequence() {
      return this.charSequence
    }
    /**
     *
     * @return {byte[]}
     */
    asBytes() {
      return /* getBytes */ this.charSequence
        .toString()
        .split('')
        .map((s) => s.codePointAt(0))
    }
    /**
     *
     * @return {number}
     */
    length() {
      return this.charSequence.length
    }
  }
  MatcherInput.Utf16MatcherInput = Utf16MatcherInput
  Utf16MatcherInput['__class'] = 'quickstart.MatcherInput.Utf16MatcherInput'
})(MatcherInput || (MatcherInput = {}))
