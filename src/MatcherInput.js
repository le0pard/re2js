import { Utils } from './Utils'
import { createEnum } from './helpers'

/**
 * Abstract the representations of input text supplied to Matcher.
 */
class MatcherInputBase {
  static Encoding = createEnum(['UTF_16', 'UTF_8'])

  getEncoding() {
    throw Error('not implemented')
  }

  isUTF8Encoding() {
    return this.getEncoding() === MatcherInputBase.Encoding.UTF_8
  }

  isUTF16Encoding() {
    return this.getEncoding() === MatcherInputBase.Encoding.UTF_16
  }
}

class Utf8MatcherInput extends MatcherInputBase {
  constructor(bytes = null) {
    super()
    this.bytes = bytes
  }

  getEncoding() {
    return MatcherInputBase.Encoding.UTF_8
  }

  asCharSequence() {
    return Utils.utf8ByteArrayToString(this.bytes)
  }

  asBytes() {
    return this.bytes
  }

  length() {
    return this.bytes.length
  }
}

class Utf16MatcherInput extends MatcherInputBase {
  constructor(charSequence = null) {
    super()
    this.charSequence = charSequence
  }

  getEncoding() {
    return MatcherInputBase.Encoding.UTF_16
  }

  asCharSequence() {
    return this.charSequence
  }

  asBytes() {
    return this.charSequence
      .toString()
      .split('')
      .map((s) => s.codePointAt(0))
  }

  length() {
    return this.charSequence.length
  }
}

class MatcherInput {
  /**
   * Return the MatcherInput for UTF_16 encoding.
   */
  static utf16(charSequence) {
    return new Utf16MatcherInput(charSequence)
  }

  /**
   * Return the MatcherInput for UTF_8 encoding.
   */
  static utf8(input) {
    if (input instanceof Array) {
      return new Utf8MatcherInput(input)
    }

    return new Utf8MatcherInput(Utils.stringToUtf8ByteArray(input))
  }
}

export { MatcherInput, MatcherInputBase }
