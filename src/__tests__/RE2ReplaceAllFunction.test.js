import { RE2 } from '../RE2'
import { expect, describe, test } from '@jest/globals'

describe('.replaceAllFunc', () => {
  const cases = [
    ['[a-c]', 'defabcdef', 'defxayxbyxcydef'],
    ['[a-c]+', 'defabcdef', 'defxabcydef'],
    ['[a-c]*', 'defabcdef', 'xydxyexyfxabcydxyexyfxy']
  ]

  test.concurrent.each(cases)(
    'pattern %p with input %p will return %p',
    (pattern, input, expected) => {
      const replaceFunc = (s) => `x${s}y`
      const re = RE2.compile(pattern)
      expect(re.replaceAllFunc(input, replaceFunc, input.length)).toEqual(expected)
    }
  )
})
