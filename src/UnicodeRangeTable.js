class UnicodeRangeTable {
  constructor(data) {
    this.data = data
  }
  get(index) {
    const i = index * 3
    // Returns [lo, hi, stride]
    return [this.data[i], this.data[i + 1], this.data[i + 2]]
  }
  get length() {
    return this.data.length / 3
  }
}

export { UnicodeRangeTable }
