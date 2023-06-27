import { expect, describe, test } from '@jest/globals'
import { RE2 } from '../RE2'

describe('.compile', () => {
  const cases = [
    ['', null],
    ['.', null],
    ['^.$', null],
    ['a', null],
    ['a*', null],
    ['a+', null],
    ['a?', null],
    ['a|b', null],
    ['a*|b*', null],
    ['(a*|b)(c*|d)', null],
    ['[a-z]', null],
    ['[a-abc-c\\-\\]\\[]', null],
    ['[a-z]+', null],
    ['[abc]', null],
    ['[^1234]', null],
    ['[^\n]', null],
    ['..|.#|..', null],
    ['\\!\\\\', null],
    ['abc]', null], // Matches the closing bracket literall].
    ['a??', null],
    ['*', 'missing argument to repetition operator: `*`'],
    ['+', 'missing argument to repetition operator: `+`'],
    ['?', 'missing argument to repetition operator: `?`'],
    ['(abc', 'missing closing ): `(abc`'],
    ['abc)', 'regexp/syntax: internal error: `stack underflow`'],
    ['x[a-z', 'missing closing ]: `[a-z`'],
    ['[z-a]', 'invalid character class range: `z-a`'],
    ['abc\\', 'trailing backslash at end of expression'],
    ['a**', 'invalid nested repetition operator: `**`'],
    ['a*+', 'invalid nested repetition operator: `*+`'],
    ['\\x', 'invalid escape sequence: `\\x`'],
    ['\\p', 'invalid character class range: `\\p`'],
    ['\\p{', 'invalid character class range: `\\p{`']
  ]

  test.concurrent.each(cases)('input %p compile raise error %p', (input, expected) => {
    const compile = () => {
      try {
        RE2.compile(input)
        expect(null).toEqual(expected)
      } catch (e) {
        expect(e.message).toEqual(`error parsing regexp: ${expected}`)
      }
    }

    compile()
  })
})
