import { expect, describe, test } from '@jest/globals'
import { RE2 } from '../RE2'
import { FIND_TESTS } from '../__fixtures__/find'

describe('match', () => {
  test.concurrent.each(FIND_TESTS)('%s', (testPattern) => {
    const re = RE2.compile(testPattern.pat)
    expect(re.match(testPattern.text)).toEqual(testPattern.matches.length > 0)
    // expect(re.matchUTF8(testPattern.textUTF8)).toEqual(testPattern.matches.length > 0)
  })

  test.concurrent.each(FIND_TESTS)('%s', (testPattern) => {
    expect(RE2.match(testPattern.pat, testPattern.text)).toEqual(testPattern.matches.length > 0)
  })
})
