import { expect, describe, it, vi } from 'vitest'
import { Unicode } from '../Unicode.js'
import { UnicodeTables } from '../UnicodeTables.js'
import { codePoint } from '../__utils__/chars.js'

describe('#isUpper', () => {
  it.each([
    [115, false], // 's'
    [83, true], // 'S'
    [503, true], // 'Ƿ'
    [469, true], // 'Ǖ'
    [474, false], // 'ǚ'
    [940, false] // 'ά'
  ])('#isUpper(%p) === %p', (input, expected) => {
    expect(Unicode.isUpper(input)).toEqual(expected)
  })
})

describe('#isPrint', () => {
  it.each([
    [32, true], // ' '
    [115, true], // 's'
    [83, true], // 'S'
    [503, true], // 'Ƿ'
    [469, true], // 'Ǖ'
    [474, true], // 'ǚ'
    [940, true], // 'ά'
    [940, true], // 'ά'
    [8, false], // '\b'
    [9, false], // '\t'
    [11, false], // '\r'
    [12, false], // '\f'
    [160, false],
    [8203, false]
  ])('#isPrint(%p) === %p', (input, expected) => {
    expect(Unicode.isPrint(input)).toEqual(expected)
  })
})

describe('#simpleFold', () => {
  it.each([
    // 'A' <-> 'a'
    [65, 97],
    [97, 65],
    // 's' <-> 'ſ' <-> 'S'
    [83, 115],
    [115, 383],
    [383, 83],
    // 'K' <-> '\u212A' (Kelvin symbol, K) <-> 'k'
    [75, 107],
    [107, 8490],
    [8490, 75],
    // '1'
    [49, 49],
    // '9'
    [57, 57]
  ])('#simpleFold(%p) === %p', (input, expected) => {
    expect(Unicode.simpleFold(input)).toEqual(expected)
  })

  // Go's simpleFoldTests (unicode/letter_test.go): each fold cycle, in SimpleFold order
  it.each([
    [[0x41, 0x61]], // Aa
    [[0x3b4, 0x394]], // δΔ
    [[0x4b, 0x6b, 0x212a]], // KkK (Kelvin sign)
    [[0x53, 0x73, 0x17f]], // Ssſ
    [[0x3c1, 0x3f1, 0x3a1]], // ρϱΡ
    [[0x345, 0x399, 0x3b9, 0x1fbe]], // ͅΙιι
    [[0x130]], // İ has lower and upper case mappings but no case fold
    [[0x131]], // ı likewise
    [[0x13b0, 0xab80]] // Cherokee: upper case comes before lower case
  ])('follows the fold cycle %j', (cycle) => {
    let r = cycle[cycle.length - 1]
    for (const out of cycle) {
      expect(Unicode.simpleFold(r)).toBe(out)
      r = out
    }
  })

  it('folds by its own tables only, never the JS runtime case mapping', () => {
    // The generated tables hold every case-folding pair, so results cannot depend on the
    // Unicode version of the runtime (Node, Bun, browsers), as Go uses only its own tables.
    const lower = vi.spyOn(String.prototype, 'toLowerCase')
    const upper = vi.spyOn(String.prototype, 'toUpperCase')
    let folding = 0
    try {
      for (let r = 0; r <= Unicode.MAX_RUNE; r++) {
        const f = Unicode.simpleFold(r)
        if (f === r) continue
        folding++
        // every rune is on a cycle: folding repeatedly comes back to it
        let next = f
        for (let steps = 0; next !== r && steps < 4; steps++) next = Unicode.simpleFold(next)
        expect(next).toBe(r)
      }
      expect(lower).not.toHaveBeenCalled()
      expect(upper).not.toHaveBeenCalled()
    } finally {
      lower.mockRestore()
      upper.mockRestore()
    }
    // the number of runes with a simple case fold in Unicode 17 (Go 1.27 unicode.SimpleFold)
    expect(folding).toBe(2994)
  })
})

const genEqualsIgnoreCases = () => {
  let testCases = [
    [codePoint('{'), codePoint('{'), true],
    [codePoint('é'), codePoint('É'), true],
    [codePoint('Ú'), codePoint('ú'), true],
    [codePoint('\u212A'), codePoint('K'), true],
    [codePoint('\u212A'), codePoint('k'), true],
    [codePoint('\u212A'), codePoint('a'), false],
    [codePoint('ü'), codePoint('ű'), false],
    [codePoint('b'), codePoint('k'), false],
    [codePoint('C'), codePoint('x'), false],
    [codePoint('/'), codePoint('_'), false],
    [codePoint('d'), codePoint(')'), false],
    [codePoint('@'), codePoint('`'), false]
  ]

  for (let r = codePoint('a'); r <= codePoint('z'); r++) {
    const u = r - (codePoint('a') - codePoint('A'))
    testCases = [...testCases, [r, r, true], [u, u, true], [r, u, true], [u, r, true]]
  }

  return testCases
}

describe('#equalsIgnoreCase', () => {
  it.each(genEqualsIgnoreCases())('#equalsIgnoreCase(%i, %i) === %p', (r1, r2, expected) => {
    expect(Unicode.equalsIgnoreCase(r1, r2)).toEqual(expected)
  })
})

describe('Unicode equalsIgnoreCase EOF', () => {
  it('should safely reject EOF markers on case-insensitive assertions', () => {
    expect(Unicode.equalsIgnoreCase(-1, 97)).toBe(false)
  })
})

describe('UnicodeTables VLQ Decompression', () => {
  it('should decompress the Zl (Line Separator) table correctly', () => {
    const zlTable = UnicodeTables.CATEGORIES.get('Zl')

    // Zl only contains exactly one character: U+2028 (Line Separator)
    expect(zlTable.length).toBe(1)
    expect(zlTable.getLo(0)).toBe(0x2028)
    expect(zlTable.getHi(0)).toBe(0x2028)
    expect(zlTable.getStride(0)).toBe(1)
  })

  it('should decompress the Zp (Paragraph Separator) table correctly', () => {
    const zpTable = UnicodeTables.CATEGORIES.get('Zp')

    // Zp only contains exactly one character: U+2029 (Paragraph Separator)
    expect(zpTable.length).toBe(1)
    expect(zpTable.getLo(0)).toBe(0x2029)
    expect(zpTable.getHi(0)).toBe(0x2029)
    expect(zpTable.getStride(0)).toBe(1)
  })

  it('should decompress the CASE_ORBIT map correctly (ZigZag Decoding)', () => {
    const orbit = UnicodeTables.CASE_ORBIT

    // Standard ASCII letters are NOT in the table (they fallback to JS toLowerCase)
    expect(orbit.has(65)).toBe(false)

    // 'K' (75) -> 'k' (107)
    expect(orbit.has(75)).toBe(true)
    expect(orbit.get(75)).toBe(107)

    // 'S' (83) -> 's' (115)
    expect(orbit.has(83)).toBe(true)
    expect(orbit.get(83)).toBe(115)

    // 'k' (107) -> 'K' (8490) (Kelvin symbol)
    expect(orbit.has(107)).toBe(true)
    expect(orbit.get(107)).toBe(8490)

    // Test a supplementary/exotic character jump (if your ICU tests support it)
    // For example, Deseret Capital Letter Long I (U+10400) -> Small (U+10428)
    if (orbit.has(0x10400)) {
      expect(orbit.get(0x10400)).toBe(0x10428)
      expect(orbit.get(0x10428)).toBe(0x10400)
    }
  })

  it('should decompress the Nd (Decimal Digits) table correctly with strides', () => {
    const ndTable = UnicodeTables.CATEGORIES.get('Nd')

    // The table should have decompressed successfully into an array of ranges
    expect(ndTable.length).toBeGreaterThan(0)

    // Find the range for standard ASCII digits '0' (48) to '9' (57)
    let foundAsciiDigits = false
    for (let i = 0; i < ndTable.length; i++) {
      if (ndTable.getLo(i) === 48 && ndTable.getHi(i) === 57) {
        foundAsciiDigits = true
        // In the Nd table, '0'-'9' are consecutive, so the stride should be 1
        expect(ndTable.getStride(i)).toBe(1)
        break
      }
    }

    expect(foundAsciiDigits).toBe(true)
  })
})
