class CodepointRange {
  constructor() {
    this.builder = []
    this.setStart = null
    this.setStride = null
    this.lastInSet = null
  }

  add(codepoint) {
    if (this.setStart === null) {
      this.setStart = codepoint
    } else if (this.setStride === null) {
      this.setStride = codepoint - this.lastInSet
    } else if (codepoint - this.lastInSet !== this.setStride) {
      // gotta start a new set
      this.builder.push([this.setStart, this.lastInSet, this.setStride])
      this.setStart = codepoint
      this.setStride = null
    }
    this.lastInSet = codepoint
  }

  addAll(codepoints) {
    const sortedCodepoints = Array.from(codepoints).sort((a, b) => a - b)
    for (const i of sortedCodepoints) {
      this.add(i)
    }
  }

  finish() {
    if (this.setStart !== null) {
      this.builder.push([
        this.setStart,
        this.lastInSet,
        this.setStride === null ? 1 : this.setStride
      ])
    }
    return this.builder
  }
}

export { CodepointRange }
