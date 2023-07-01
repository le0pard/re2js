import { expect, describe, test } from '@jest/globals'
import { RE2 } from '../RE2'

describe('.numberOfCapturingGroups', () => {
  const cases = [
    ['', 0],
    ['.*', 0],
    ['abba', 0],
    ['ab(b)a', 1],
    ['ab(.*)a', 1],
    ['(.*)ab(.*)a', 2],
    ['(.*)(ab)(.*)a', 3],
    ['(.*)((a)b)(.*)a', 4],
    ['(.*)(\\(ab)(.*)a', 3],
    ['(.*)(\\(a\\)b)(.*)a', 3],
    ['(?P<baz>f{0,10})(?P<bag>b{0,10})', 2]
  ]

  test.concurrent.each(cases)('input %p get result %p', (input, expected) => {
    expect(RE2.compile(input).numberOfCapturingGroups()).toEqual(expected)
  })
})
