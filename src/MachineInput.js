import { Utils } from './Utils'
/**
 * MachineInput abstracts different representations of the input text supplied to the Machine. It
 * provides one-character lookahead.
 */
class MachineInputBase {
  static EOF() {
    return -1 << 3
  }

  // can we look ahead without losing info?
  canCheckPrefix() {
    return true
  }

  // Returns the end position in the same units as step().
  endPos() {
    return this.end
  }
}

// An implementation of MachineInput for UTF-8 byte arrays.
// |pos| and |width| are byte indices.
class MachineUTF8Input extends MachineInputBase {
  constructor(bytes, start = 0, end = bytes.length) {
    super()
    this.bytes = bytes
    this.start = start
    this.end = end
  }

  // Returns the rune at the specified index; the units are
  // unspecified, but could be UTF-8 byte, UTF-16 char, or rune
  // indices.  Returns the width (in the same units) of the rune in
  // the lower 3 bits, and the rune (Unicode code point) in the high
  // bits.  Never negative, except for EOF which is represented as -1
  // << 3 | 0.
  step(i) {
    i += this.start
    if (i >= this.end) {
      return MachineInputBase.EOF()
    }
    let x = this.bytes[i++] & 255
    if ((x & 128) === 0) {
      return (x << 3) | 1
    } else if ((x & 224) === 192) {
      x = x & 31
      if (i >= this.end) {
        return MachineInputBase.EOF()
      }
      x = (x << 6) | (this.bytes[i++] & 63)
      return (x << 3) | 2
    } else if ((x & 240) === 224) {
      x = x & 15
      if (i + 1 >= this.end) {
        return MachineInputBase.EOF()
      }
      x = (x << 6) | (this.bytes[i++] & 63)
      x = (x << 6) | (this.bytes[i++] & 63)
      return (x << 3) | 3
    } else {
      x = x & 7
      if (i + 2 >= this.end) {
        return MachineInputBase.EOF()
      }
      x = (x << 6) | (this.bytes[i++] & 63)
      x = (x << 6) | (this.bytes[i++] & 63)
      x = (x << 6) | (this.bytes[i++] & 63)
      return (x << 3) | 4
    }
  }

  // Returns the index relative to |pos| at which |re2.prefix| is found
  // in this input stream, or a negative value if not found.
  index(re2, pos) {
    pos += this.start
    const i = this.indexOf(this.bytes, re2.prefixUTF8, pos)
    return i < 0 ? i : i - pos
  }

  // Returns a bitmask of EMPTY_* flags.
  context(pos) {
    pos += this.start
    let r1 = -1
    if (pos > this.start && pos <= this.end) {
      let start = pos - 1
      r1 = this.bytes[start--]
      if (r1 >= 128) {
        let lim = pos - 4
        if (lim < this.start) {
          lim = this.start
        }
        while (start >= lim && (this.bytes[start] & 192) === 128) {
          start--
        }

        if (start < this.start) {
          start = this.start
        }
        r1 = this.step(start) >> 3
      }
    }
    const r2 = pos < this.end ? this.step(pos) >> 3 : -1
    return Utils.emptyOpContext(r1, r2)
  }

  // Returns the index of the first occurrence of array |target| within
  // array |source| after |fromIndex|, or -1 if not found.
  indexOf(source, target, fromIndex = 0) {
    let targetLength = target.length
    if (targetLength === 0) {
      return -1
    }

    let sourceLength = source.length
    for (let i = fromIndex; i <= sourceLength - targetLength; i++) {
      for (let j = 0; j < targetLength; j++) {
        if (source[i + j] !== target[j]) {
          break
        } else if (j === targetLength - 1) {
          return i
        }
      }
    }

    return -1
  }
}

// |pos| and |width| are in JS "char" units.
class MachineUTF16Input extends MachineInputBase {
  constructor(charSequence, start = 0, end = charSequence.length) {
    super()
    this.charSequence = charSequence
    this.start = start
    this.end = end
  }

  // Returns the rune at the specified index; the units are
  // unspecified, but could be UTF-8 byte, UTF-16 char, or rune
  // indices.  Returns the width (in the same units) of the rune in
  // the lower 3 bits, and the rune (Unicode code point) in the high
  // bits.  Never negative, except for EOF which is represented as -1
  // << 3 | 0.
  step(pos) {
    pos += this.start
    if (pos < this.end) {
      const rune = this.charSequence.codePointAt(pos)
      return (rune << 3) | Utils.charCount(rune)
    } else {
      return MachineInputBase.EOF()
    }
  }

  // Returns the index relative to |pos| at which |re2.prefix| is found
  // in this input stream, or a negative value if not found.
  index(re2, pos) {
    pos += this.start
    const i = this.charSequence.indexOf(re2.prefix, pos)
    return i < 0 ? i : i - pos
  }

  // Returns a bitmask of EMPTY_* flags.
  context(pos) {
    pos += this.start
    const r1 =
      pos > 0 && pos <= this.charSequence.length ? this.charSequence.codePointAt(pos - 1) : -1
    const r2 = pos < this.charSequence.length ? this.charSequence.codePointAt(pos) : -1
    return Utils.emptyOpContext(r1, r2)
  }
}

class MachineInput {
  static fromUTF8(bytes, start = 0, end = bytes.length) {
    return new MachineUTF8Input(bytes, start, end)
  }

  static fromUTF16(charSequence, start = 0, end = charSequence.length) {
    return new MachineUTF16Input(charSequence, start, end)
  }
}

export { MachineInputBase, MachineInput }
