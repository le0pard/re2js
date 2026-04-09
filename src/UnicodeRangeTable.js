class UnicodeRangeTable {
  constructor(data, isStride1 = false) {
    this.data = data // A Uint32Array
    this.isStride1 = isStride1
    this.SIZE = isStride1 ? 2 : 3
  }

  // High-performance getters that do NOT allocate memory
  getLo(index) {
    return this.data[index * this.SIZE]
  }
  getHi(index) {
    return this.data[index * this.SIZE + 1]
  }
  getStride(index) {
    return this.isStride1 ? 1 : this.data[index * this.SIZE + 2]
  }

  get(index) {
    const i = index * this.SIZE
    return [this.data[i], this.data[i + 1], this.getStride(index)]
  }

  get length() {
    return this.data.length / this.SIZE
  }
}

export { UnicodeRangeTable }
