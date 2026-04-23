import { Utils } from './Utils'
import { Unicode } from './Unicode'

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

  hasString() {
    return false
  }

  hasAnyString() {
    return false
  }

  // Helper for the exact-literal fast-path execution router
  prefixLength() {
    return 0
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

  hasString(prefilter, pos) {
    const target = prefilter.bytes
    if (target.length === 0) return true

    // Reuse the high-speed indexOf method already implemented below
    const idx = this.indexOf(this.bytes, target, this.start + pos)
    return idx !== -1 && idx <= this.end - target.length
  }

  // Executes a high-speed, single - pass search for multiple literal strings
  // simultaneously using an Aho-Corasick automaton.
  hasAnyString(prefilter, pos) {
    if (!prefilter.ac8) return false

    return prefilter.ac8.searchUTF8(this.bytes, this.start + pos, this.end)
  }

  // Returns the rune at the specified index; the units are
  // unspecified, but could be UTF-8 byte, UTF-16 char, or rune
  // indices.  Returns the width (in the same units) of the rune in
  // the lower 3 bits, and the rune (Unicode code point) in the high
  // bits.  Never negative, except for EOF which is represented as -1
  // << 3 | 0.
  step(pos) {
    pos += this.start
    if (pos >= this.end) {
      return MachineInputBase.EOF()
    }

    // Read UTF-8 bytes to extract the Rune and its width
    const c = this.bytes[pos] & 0xff
    if (c < 0x80) {
      return (c << 3) | 1
    } else if (c >= 0xc2 && c <= 0xdf && pos + 1 < this.end) {
      const c1 = this.bytes[pos + 1] & 0xff
      if ((c1 & 0xc0) !== 0x80) return (c << 3) | 1

      const rune = ((c & 0x1f) << 6) | (c1 & 0x3f)
      return (rune << 3) | 2
    } else if (c >= 0xe0 && c <= 0xef && pos + 2 < this.end) {
      const c1 = this.bytes[pos + 1] & 0xff
      if ((c1 & 0xc0) !== 0x80) return (c << 3) | 1

      const c2 = this.bytes[pos + 2] & 0xff
      if ((c2 & 0xc0) !== 0x80) return (c << 3) | 1

      const rune = ((c & 0x0f) << 12) | ((c1 & 0x3f) << 6) | (c2 & 0x3f)
      return (rune << 3) | 3
    } else if (c >= 0xf0 && c <= 0xf4 && pos + 3 < this.end) {
      const c1 = this.bytes[pos + 1] & 0xff
      if ((c1 & 0xc0) !== 0x80) return (c << 3) | 1

      const c2 = this.bytes[pos + 2] & 0xff
      if ((c2 & 0xc0) !== 0x80) return (c << 3) | 1

      const c3 = this.bytes[pos + 3] & 0xff
      if ((c3 & 0xc0) !== 0x80) return (c << 3) | 1

      const rune = ((c & 0x07) << 18) | ((c1 & 0x3f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f)
      return (rune << 3) | 4
    } else {
      // Invalid sequence fallback
      return (c << 3) | 1
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
      return fromIndex <= this.end ? fromIndex : -1
    }

    let limit = this.end - targetLength
    for (let i = fromIndex; i <= limit; i++) {
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

  prefixLength(re2) {
    return re2.prefixUTF8.length
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

  hasString(prefilter, pos) {
    const idx = this.charSequence.indexOf(prefilter.str, this.start + pos)
    return idx !== -1 && idx <= this.end - prefilter.str.length
  }

  // Executes a high-speed, single - pass search for multiple literal strings
  // simultaneously using an Aho-Corasick automaton.
  hasAnyString(prefilter, pos) {
    if (!prefilter.ac16) return false

    return prefilter.ac16.searchUTF16(this.charSequence, this.start + pos, this.end)
  }

  // Returns the rune at the specified index; the units are
  // unspecified, but could be UTF-8 byte, UTF-16 char, or rune
  // indices.  Returns the width (in the same units) of the rune in
  // the lower 3 bits, and the rune (Unicode code point) in the high
  // bits.  Never negative, except for EOF which is represented as -1
  // << 3 | 0.
  step(pos) {
    pos += this.start
    if (pos >= this.end) {
      return MachineInputBase.EOF()
    }

    const c1 = this.charSequence.charCodeAt(pos)

    // Fast path: standard BMP character (not a high surrogate)
    if (c1 < Unicode.MIN_HIGH_SURROGATE || c1 > Unicode.MAX_HIGH_SURROGATE || pos + 1 >= this.end) {
      return (c1 << 3) | 1
    }

    // Slow path: Calculate surrogate pair manually
    const c2 = this.charSequence.charCodeAt(pos + 1)
    if (c2 >= Unicode.MIN_LOW_SURROGATE && c2 <= Unicode.MAX_LOW_SURROGATE) {
      const rune =
        (c1 - Unicode.MIN_HIGH_SURROGATE) * 0x400 +
        (c2 - Unicode.MIN_LOW_SURROGATE) +
        Unicode.MIN_SUPPLEMENTARY_CODE_POINT
      return (rune << 3) | 2
    }

    // Invalid surrogate pair fallback
    return (c1 << 3) | 1
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

  prefixLength(re2) {
    return re2.prefix.length
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
