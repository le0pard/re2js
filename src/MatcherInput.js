/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
/**
 * Abstract the representations of input text supplied to Matcher.
 * @class
 */
import { Utils } from './Utils'
import { createEnum } from './helpers'

export class MatcherInput {
  static Encoding = createEnum([
    'UTF_16',
    'UTF_8'
  ])

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
    return new MatcherInput.Utf8MatcherInput(/* getBytes */ Utils.stringToUtf8ByteArray(input))
  }
}
MatcherInput['__class'] = 'quickstart.MatcherInput'
;(function(MatcherInput) {
  class Utf8MatcherInput extends MatcherInput {
    constructor(bytes = null) {
      super()
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
      return Utils.utf8ByteArrayToString(this.bytes)
      // return this.bytes.map(v => String.fromCodePoint(v)).join('')
      // return String.fromCharCode.apply(null, this.bytes)
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
    constructor(charSequence = null) {
      super()
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
      return this.charSequence
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
