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

    let x = bytes[i++] & 0xff;  // zero extend
    if ((x & 0x80) === 0) {
      return x << 3 | 1;
    } else if ((x & 0xE0) === 0xC0) { // 110xxxxx
      x = x & 0x1F;
      if (i >= this.end) {
        return this.EOF;
      }
      x = x << 6 | (bytes[i++] & 0x3F);
      return x << 3 | 2;
    } else if ((x & 0xF0) === 0xE0) { // 1110xxxx
      x = x & 0x0F;
      if (i + 1 >= this.end) {
        return this.EOF;
      }
      x = x << 6 | (bytes[i++] & 0x3F);
      x = x << 6 | (bytes[i++] & 0x3F);
      return x << 3 | 3;
    } else { // 11110xxx
      x = x & 0x07;
      if (i + 2 >= this.end) {
        return this.EOF;
      }
      x = x << 6 | (bytes[i++] & 0x3F);
      x = x << 6 | (bytes[i++] & 0x3F);
      x = x << 6 | (bytes[i++] & 0x3F);
      return x << 3 | 4;
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
    // Context determination logic omitted for brevity
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
    // Context determination logic omitted for brevity
  }

  endPos() {
    return this.end
  }

  indexOf(hayStack, needle, fromIndex) {
    // String searching logic omitted for brevity
  }
}

export { UTF8Input, UTF16Input }
