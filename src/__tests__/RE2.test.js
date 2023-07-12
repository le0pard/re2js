import { MatcherInput } from '../MatcherInput'
import { RE2Flags } from '../RE2Flags'
import { RE2 } from '../RE2'
import { expect, describe, test } from '@jest/globals'

describe('RE2', () => {
  test('full match', () => {
    expect(RE2.initTest('ab+c').match('abbbbbc', 0, 7, RE2Flags.ANCHOR_BOTH, null, 0)).toBe(true)
    expect(RE2.initTest('ab+c').match('xabbbbbc', 0, 8, RE2Flags.ANCHOR_BOTH, null, 0)).toBe(false)
    expect(
      RE2.initTest('ab+c').match(MatcherInput.utf8('abbbbbc'), 0, 7, RE2Flags.ANCHOR_BOTH, null, 0)
    ).toBe(true)
    expect(
      RE2.initTest('ab+c').match(MatcherInput.utf8('xabbbbbc'), 0, 8, RE2Flags.ANCHOR_BOTH, null, 0)
    ).toBe(false)
  })

  const findEndCases = () => {
    const s = 'yyyabcxxxdefzzz'
    return [MatcherInput.utf8(s), MatcherInput.utf16(s)]
  }

  test.concurrent.each(findEndCases())('find end for %p', (input) => {
    const r = RE2.initTest('abc.*def')

    expect(r.match(input, 0, 15, RE2Flags.UNANCHORED, null, 0)).toBe(true)
    expect(r.match(input, 0, 12, RE2Flags.UNANCHORED, null, 0)).toBe(true)
    expect(r.match(input, 3, 15, RE2Flags.UNANCHORED, null, 0)).toBe(true)
    expect(r.match(input, 3, 12, RE2Flags.UNANCHORED, null, 0)).toBe(true)
    expect(r.match(input, 4, 12, RE2Flags.UNANCHORED, null, 0)).toBe(false)
    expect(r.match(input, 3, 11, RE2Flags.UNANCHORED, null, 0)).toBe(false)
  })
})
