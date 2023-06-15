import { expect, describe } from '@jest/globals'
import { Unicode } from '../Unicode'

const genEqualsIgnoreCases = () => {
  let testCases = [
    ['{'.codePointAt(0), '{'.codePointAt(0), true],
    ['é'.codePointAt(0), 'É'.codePointAt(0), true],
    ['Ú'.codePointAt(0), 'ú'.codePointAt(0), true],
    ['\u212A'.codePointAt(0), 'K'.codePointAt(0), true],
    ['\u212A'.codePointAt(0), 'k'.codePointAt(0), true],
    ['\u212A'.codePointAt(0), 'a'.codePointAt(0), false],
    ['ü'.codePointAt(0), 'ű'.codePointAt(0), false],
    ['b'.codePointAt(0), 'k'.codePointAt(0), false],
    ['C'.codePointAt(0), 'x'.codePointAt(0), false],
    ['/'.codePointAt(0), '_'.codePointAt(0), false],
    ['d'.codePointAt(0), ')'.codePointAt(0), false],
    ['@'.codePointAt(0), '`'.codePointAt(0), false]
  ]

  for (let r = 'a'.codePointAt(0); r <= 'z'.codePointAt(0); r++) {
    const u = r - ('a'.codePointAt(0) - 'A'.codePointAt(0))
    testCases = [
      ...testCases,
      [r, r, true],
      [u, u, true],
      [r, u, true],
      [u, r, true]
    ]
  }

  return testCases
}

describe('Unicode', () => {
  describe('#equalsIgnoreCase', () => {
    test.each(genEqualsIgnoreCases())(
      '#equalsIgnoreCase(%i, %i) === %p',
      (r1, r2, expected) => {
        expect(Unicode.equalsIgnoreCase(r1, r2)).toEqual(expected)
      }
    )
  })
})
