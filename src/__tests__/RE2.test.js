import { MatcherInput } from '../MatcherInput'
import { RE2Flags } from '../RE2Flags'
import { RE2 } from '../RE2'
import { expect, describe, test } from '@jest/globals'

describe('RE2', () => {
  test('full match', () => {
    expect(RE2.initTest('ab+c').matchWithGroup('abbbbbc', 0, 7, RE2Flags.ANCHOR_BOTH, 0)).toEqual([
      true,
      []
    ])
    expect(RE2.initTest('ab+c').matchWithGroup('xabbbbbc', 0, 8, RE2Flags.ANCHOR_BOTH, 0)).toEqual([
      false,
      null
    ])
    expect(
      RE2.initTest('ab+c').matchWithGroup(
        MatcherInput.utf8('abbbbbc'),
        0,
        7,
        RE2Flags.ANCHOR_BOTH,
        0
      )
    ).toEqual([true, []])
    expect(
      RE2.initTest('ab+c').matchWithGroup(
        MatcherInput.utf8('xabbbbbc'),
        0,
        8,
        RE2Flags.ANCHOR_BOTH,
        0
      )
    ).toEqual([false, null])
  })

  const findEndCases = () => {
    const s = 'yyyabcxxxdefzzz'
    return [MatcherInput.utf8(s), MatcherInput.utf16(s)]
  }

  test.concurrent.each(findEndCases())('find end for %p', (input) => {
    const r = RE2.initTest('abc.*def')

    expect(r.matchWithGroup(input, 0, 15, RE2Flags.UNANCHORED, 0)).toEqual([true, []])
    expect(r.matchWithGroup(input, 0, 12, RE2Flags.UNANCHORED, 0)).toEqual([true, []])
    expect(r.matchWithGroup(input, 3, 15, RE2Flags.UNANCHORED, 0)).toEqual([true, []])
    expect(r.matchWithGroup(input, 3, 12, RE2Flags.UNANCHORED, 0)).toEqual([true, []])
    expect(r.matchWithGroup(input, 4, 12, RE2Flags.UNANCHORED, 0)).toEqual([false, null])
    expect(r.matchWithGroup(input, 3, 11, RE2Flags.UNANCHORED, 0)).toEqual([false, null])
  })

  const findGroupCases = () => {
    const s = 'yyyabcxxxdefzzz'
    return [MatcherInput.utf8(s), MatcherInput.utf16(s)]
  }

  test.concurrent.each(findGroupCases())('find group for %p', (input) => {
    const r = RE2.initTest('(?P<test>abc).*def')

    expect(r.matchWithGroup(input, 0, 15, RE2Flags.UNANCHORED, 1)).toEqual([true, [3, 12]])
    expect(r.matchWithGroup(input, 0, 12, RE2Flags.UNANCHORED, 1)).toEqual([true, [3, 12]])
    expect(r.matchWithGroup(input, 3, 15, RE2Flags.UNANCHORED, 1)).toEqual([true, [3, 12]])
    expect(r.matchWithGroup(input, 3, 12, RE2Flags.UNANCHORED, 1)).toEqual([true, [3, 12]])
    expect(r.matchWithGroup(input, 4, 12, RE2Flags.UNANCHORED, 1)).toEqual([false, null])
    expect(r.matchWithGroup(input, 3, 11, RE2Flags.UNANCHORED, 1)).toEqual([false, null])
  })
})
