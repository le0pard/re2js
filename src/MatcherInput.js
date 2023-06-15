class MatcherInput {
  static ENCODING = Object.freeze({
    UTF_16: 'UTF-16',
    UTF_8: 'UTF-8'
  })

  constructor() {
    if (new.target === MatcherInput) {
      throw new TypeError('Abstract class "MatcherInput" cannot be instantiated directly.')
    }
  }

  static utf16(charSequence) {
    return new Utf16MatcherInput(charSequence)
  }

  static utf8(input) {
    if (input instanceof Uint8Array) {
      return new Utf8MatcherInput(input)
    } else {
      let encoder = new TextEncoder()
      return new Utf8MatcherInput(encoder.encode(input))
    }
  }

  getEncoding() {
    throw new TypeError('You must implement method "getEncoding"')
  }

  asCharSequence() {
    throw new TypeError('You must implement method "asCharSequence"')
  }

  asBytes() {
    throw new TypeError('You must implement method "asBytes"')
  }

  length() {
    throw new TypeError('You must implement method "length"')
  }
}

class Utf8MatcherInput extends MatcherInput {
  constructor(bytes) {
    super()
    this.bytes = bytes
  }

  getEncoding() {
    return MatcherInput.ENCODING.UTF_8
  }

  asCharSequence() {
    let decoder = new TextDecoder('utf-8')
    return decoder.decode(this.bytes)
  }

  asBytes() {
    return this.bytes
  }

  length() {
    return this.bytes.length
  }
}

class Utf16MatcherInput extends MatcherInput {
  constructor(charSequence) {
    super()
    this.charSequence = charSequence
  }

  getEncoding() {
    return MatcherInput.ENCODING.UTF_16
  }

  asCharSequence() {
    return this.charSequence
  }

  asBytes() {
    return this._stringToUtf16Bytes(this.charSequence)
  }

  length() {
    return this.charSequence.length
  }

  _stringToUtf16Bytes(str) {
    let arr = []
    for (let i = 0; i < str.length; i++) {
      let codePoint = str.codePointAt(i)

      if (codePoint > 0xFFFF) {
        arr.push(this.highSurrogate(codePoint))
        arr.push(this.lowSurrogate(codePoint))
        i++ // Surrogate pair, so skip one unit
      } else {
        arr.push(codePoint)
      }
    }

    let byteArray = new Uint8Array(arr.length * 2)
    for (let i = 0; i < arr.length; i++) {
      let charCode = arr[i]
      byteArray[i * 2] = charCode & 0xFF
      byteArray[i * 2 + 1] = charCode >> 8
    }
    return byteArray
  }

  highSurrogate(codePoint) {
    return Math.floor((codePoint - 0x10000) / 0x400) + 0xD800
  }

  lowSurrogate(codePoint) {
    return ((codePoint - 0x10000) % 0x400) + 0xDC00
  }
}

export {
  Utf8MatcherInput,
  Utf16MatcherInput
}
