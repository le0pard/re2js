import { expect, describe, test } from '@jest/globals'
import { Unicode } from '../Unicode'
import { codePoint } from '../__utils__/chars'

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
  test.concurrent.each(genEqualsIgnoreCases())('#equalsIgnoreCase(%i, %i) === %p', (r1, r2, expected) => {
    expect(Unicode.equalsIgnoreCase(r1, r2)).toEqual(expected)
  })
})
