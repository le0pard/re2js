// Packs code points into [lo, hi, stride] ranges, the layout of Go's unicode.RangeTable: each
// range is a run with a constant stride, taken greedily from the lowest remaining code point.
// The input may be in any order and contain duplicates.
const toRanges = (codepoints) => {
  const sorted = Array.from(new Set(codepoints)).sort((a, b) => a - b)
  const ranges = []
  let i = 0
  while (i < sorted.length) {
    const lo = sorted[i]
    if (i + 1 === sorted.length) {
      ranges.push([lo, lo, 1])
      break
    }
    const stride = sorted[i + 1] - lo
    let j = i + 1
    while (j + 1 < sorted.length && sorted[j + 1] - sorted[j] === stride) {
      j++
    }
    ranges.push([lo, sorted[j], stride])
    i = j + 1
  }
  return ranges
}

export { toRanges }
