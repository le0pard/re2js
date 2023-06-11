class CodepointRange {
  constructor() {
    this.builder = []
    this.setStart = -1
    this.setStride = -1
    this.lastInSet = -1
  }

  add(codepoint) {
    if (this.setStart == -1) {
      this.setStart = codepoint
    } else if (this.setStride == -1) {
      this.setStride = codepoint - this.lastInSet
    } else if (codepoint - this.lastInSet !== this.setStride) {
      // gotta start a new set
      this.builder.push([this.setStart, this.lastInSet, this.setStride])
      this.setStart = codepoint
      this.setStride = -1
    }
    this.lastInSet = codepoint
  }

  addAll(codepoints) {
    for (const i of codepoints) {
      this.add(i)
    }
  }

  finish() {
    if (this.setStart != -1) {
      this.builder.push([this.setStart, this.lastInSet, this.setStride == -1 ? 1 : this.setStride])
    }
    return this.builder
  }

}

export { CodepointRange }
