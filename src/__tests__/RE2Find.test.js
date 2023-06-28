import { expect, describe, test } from '@jest/globals'
import { FIND_TESTS } from '../__fixtures__/find'
import { RE2 } from '../RE2'

describe('find', () => {
  test.concurrent.each(FIND_TESTS)('%s', (testPattern) => {
    const re = RE2.compile(testPattern.pat)
    const result = re.find(testPattern.text)

    if (testPattern.matches.length === 0 && result.length === 0) {
      // ok
    } else {
      expect(result).toEqual(testPattern.submatchString(0, 0))
    }
    // expect(re.matchUTF8(testPattern.textUTF8)).toEqual(testPattern.matches.length > 0)
  })

  // test.concurrent.each(FIND_TESTS)('%s', (testPattern) => {
  //   expect(RE2.match(testPattern.pat, testPattern.text)).toEqual(testPattern.matches.length > 0)
  // })
})
