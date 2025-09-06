class UnicodeRangeTable {
  SIZE = 3

  constructor(data) {
    this.data = data // A Uint32Array
  }

  // High-performance getters that do NOT allocate memory
  getLo(index) {
    return this.data[index * this.SIZE]
  }
  getHi(index) {
    return this.data[index * this.SIZE + 1]
  }
  getStride(index) {
    return this.data[index * this.SIZE + 2]
  }

  // Convenience getter (slower, for debugging or non-critical paths)
  get(index) {
    const i = index * this.SIZE
    // Returns [lo, hi, stride]
    return [this.data[i], this.data[i + 1], this.data[i + 2]]
  }

  get length() {
    return this.data.length / this.SIZE
  }
}

export { UnicodeRangeTable }
