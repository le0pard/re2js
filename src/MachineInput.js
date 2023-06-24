import { Utils } from './Utils'

class MachineInput {
  constructor() {
    this.EOF = (-1 << 3)
  }

  fromUTF8(b, start, end) {
    return new UTF8Input(b, start, end)
  }

  fromUTF16(s, start, end) {
    return new UTF16Input(s, start, end)
  }
}

class UTF8Input extends MachineInput {
  constructor(b, start, end) {
    super()
    if (end > b.length) {
      throw new RangeError('end is greater than length: ' + end + ' > ' + b.length)
    }
    this.b = b
    this.start = start || 0
    this.end = end || b.length
  }

  step(i) {
    i += this.start
    if (i >= this.end) {
      return this.EOF
    }

    let x = this.b[i++] & 0xff // zero extend
    if ((x & 0x80) === 0) {
      return x << 3 | 1
    } else if ((x & 0xE0) === 0xC0) { // 110xxxxx
      x = x & 0x1F
      if (i >= this.end) {
        return this.EOF
      }
      x = x << 6 | (this.b[i++] & 0x3F)
      return x << 3 | 2
    } else if ((x & 0xF0) === 0xE0) { // 1110xxxx
      x = x & 0x0F
      if (i + 1 >= this.end) {
        return this.EOF
      }
      x = x << 6 | (this.b[i++] & 0x3F)
      x = x << 6 | (this.b[i++] & 0x3F)
      return x << 3 | 3
    } else { // 11110xxx
      x = x & 0x07
      if (i + 2 >= this.end) {
        return this.EOF
      }
      x = x << 6 | (this.b[i++] & 0x3F)
      x = x << 6 | (this.b[i++] & 0x3F)
      x = x << 6 | (this.b[i++] & 0x3F)
      return x << 3 | 4
    }
  }

  canCheckPrefix() {
    return true
  }

  index(re2, pos) {
    pos += this.start
    let i = Utils.indexOf(this.b, re2.prefixUTF8, pos)
    return i < 0 ? i : i - pos
  }

  context(pos) {
    pos += this.start
    let r1 = -1
    if (pos > this.start && pos <= this.end) {
      let start = pos - 1
      r1 = this.b[start--]
      if (r1 >= 0x80) { // decode UTF-8
        // Find start, up to 4 bytes earlier.
        let lim = pos - 4
        if (lim < this.start) {
          lim = this.start
        }
        while (start >= lim && (this.b[start] & 0xC0) === 0x80) { // 10xxxxxx
          start--
        }
        if (start < this.start) {
          start = this.start
        }
        r1 = this.step(start) >> 3
      }
    }
    const r2 = pos < this.end ? (this.step(pos) >> 3) : -1
    return Utils.emptyOpContext(r1, r2)
  }

  endPos() {
    return this.end
  }
}

class UTF16Input extends MachineInput {
  constructor(str, start, end) {
    super()
    this.str = str
    this.start = start || 0
    this.end = end || str.length
  }

  step(pos) {
    pos += this.start
    if (pos < this.end) {
      let rune = this.str.codePointAt(pos)
      return rune << 3 | this.str.length
    } else {
      return this.EOF
    }
  }

  canCheckPrefix() {
    return true
  }

  index(re2, pos) {
    pos += this.start
    let i = this.indexOf(this.str, re2.prefix, pos)
    return i < 0 ? i : i - pos
  }

  context(pos) {
    pos += this.start
    const r1 = pos > 0 && pos <= this.str.length ? this.str.codePointAt(pos - 1) : -1
    const r2 = pos < this.str.length ? this.str.codePointAt(pos) : -1
    return Utils.emptyOpContext(r1, r2)
  }

  endPos() {
    return this.end
  }

  indexOf(hayStack, needle, pos) {
    if (typeof hayStack === 'string') {
      return hayStack.indexOf(needle, pos)
    }
    // In JavaScript, we typically don't have to handle different types of strings,
    // so we'll skip the StringBuilder case. If you have a similar use-case,
    // you can add the relevant code here.
    return this.indexOfFallback(hayStack, needle, pos)
  }

  indexOfFallback(hayStack, needle, fromIndex) {
    if (fromIndex >= hayStack.length) {
      return needle === '' ? 0 : -1
    }
    if (fromIndex < 0) {
      fromIndex = 0
    }
    if (needle === '') {
      return fromIndex
    }

    const first = needle.charAt(0)
    const max = hayStack.length - needle.length

    for (let i = fromIndex; i <= max; i++) {
      // Look for first character.
      if (hayStack.charAt(i) !== first) {
        while (++i <= max && hayStack.charAt(i) !== first);
      }

      // Found first character, now look at the rest of v2
      if (i <= max) {
        let j = i + 1
        const end = j + needle.length - 1
        let k = 1
        while (j < end && hayStack.charAt(j) === needle.charAt(k)) {
          j++
          k++
        }

        if (j === end) {
          // Found whole string.
          return i
        }
      }
    }
    return -1
  }
}

export { MachineInput, UTF8Input, UTF16Input }
