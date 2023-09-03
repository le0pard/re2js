import { Unicode } from '../Unicode'
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
  ])(
    '#isUpper(%p) === %p',
    (input, expected) => {
      expect(Unicode.isUpper(input)).toEqual(expected)
    }
  )
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
  ])(
    '#simpleFold(%p) === %p',
    (input, expected) => {
      expect(Unicode.simpleFold(input)).toEqual(expected)
    }
  )
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
