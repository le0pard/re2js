import { expect, describe, test } from '@jest/globals'
import { MatcherInput } from '../MatcherInput'
import { RE2Flags } from '../RE2Flags'
import { RE2 } from '../RE2'

describe('RE2', () => {
  test('full match', () => {
    expect(new RE2('ab+c').match('abbbbbc', 0, 7, RE2Flags.ANCHOR_BOTH, null, 0)).toBe(true)
    expect(new RE2('ab+c').match('xabbbbbc', 0, 8, RE2Flags.ANCHOR_BOTH, null, 0)).toBe(false)
    expect(
      new RE2('ab+c').match(MatcherInput.utf8('abbbbbc'), 0, 7, RE2Flags.ANCHOR_BOTH, null, 0)
    ).toBe(true)
    expect(
      new RE2('ab+c').match(MatcherInput.utf8('xabbbbbc'), 0, 8, RE2Flags.ANCHOR_BOTH, null, 0)
    ).toBe(false)
  })

  const findEndCases = () => {
    const s = 'yyyabcxxxdefzzz'
    return [MatcherInput.utf8(s), MatcherInput.utf16(s)]
  }

  test.each(findEndCases())('find end for %p', (input) => {
    const r = new RE2('abc.*def')

    expect(r.match(input, 0, 15, RE2Flags.UNANCHORED, null, 0)).toBe(true)
    expect(r.match(input, 0, 12, RE2Flags.UNANCHORED, null, 0)).toBe(true)
    expect(r.match(input, 3, 15, RE2Flags.UNANCHORED, null, 0)).toBe(true)
    expect(r.match(input, 3, 12, RE2Flags.UNANCHORED, null, 0)).toBe(true)
    expect(r.match(input, 4, 12, RE2Flags.UNANCHORED, null, 0)).toBe(false)
    expect(r.match(input, 3, 11, RE2Flags.UNANCHORED, null, 0)).toBe(false)
  })
})
