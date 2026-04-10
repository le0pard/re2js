import { Unicode } from '../Unicode'
import { UnicodeTables } from '../UnicodeTables'
import { codePoint } from '../__utils__/chars'
import { expect, describe, test } from '@jest/globals'

describe('#isUpper', () => {
  test.concurrent.each([
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
  test.concurrent.each([
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
  test.concurrent.each([
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
  test.concurrent.each(genEqualsIgnoreCases())(
    '#equalsIgnoreCase(%i, %i) === %p',
    (r1, r2, expected) => {
      expect(Unicode.equalsIgnoreCase(r1, r2)).toEqual(expected)
    }
  )
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

  it('should decompress the CASE_ORBIT map correctly', () => {
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
