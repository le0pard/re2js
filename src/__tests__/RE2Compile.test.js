import { RE2 } from '../RE2'
import { RE2Flags } from '../RE2Flags'
import { expect, describe, test } from '@jest/globals'

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
    ['abc)', 'unexpected ): `abc)`'],
    ['x[a-z', 'missing closing ]: `[a-z`'],
    ['[z-a]', 'invalid character class range: `z-a`'],
    ['abc\\', 'trailing backslash at end of expression'],
    ['a**', 'invalid nested repetition operator: `**`'],
    ['a*+', 'invalid nested repetition operator: `*+`'],
    ['\\x', 'invalid escape sequence: `\\x`'],
    ['\\p', 'invalid character class range: `\\p`'],
    ['\\p{', 'invalid character class range: `\\p{`'],
    ['((g{2,32}|q){1,32})', 'invalid repeat count: `{1,32}`'],
    ['((g{2,20}|q){1,20}){0,40}', 'invalid repeat count: `{0,40}`'],
    [`${[...new Array(1000)].map(() => '(xx?){1000}').join('')}`, 'expression too large'],
    ['(?<=a)b', 'invalid named capture: `(?<=a)b`'],
    ['(?<!a)b', 'invalid named capture: `(?<!a)b`']
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

describe('.compile (Linear-Time Lookbehinds Enabled)', () => {
  const cases = [
    // Valid lookbehinds
    ['(?<=a)b', null],
    ['(?<!a)b', null],
    ['(?<=a)(?<!b)c', null],
    ['(?<=)a', null], // Empty lookbehind
    ['(?<=(?<=a)b)c', null], // Nested lookbehinds
    ['(?<=a+)', null], // Quantifiers inside lookbehinds

    // Malformed lookbehinds
    ['(?<=a', 'missing closing ): `(?<=a`'],
    ['(?<!a', 'missing closing ): `(?<!a`'],
    ['a(?<=b', 'missing closing ): `a(?<=b`'],

    // Attempting to quantify a lookbehind directly is actually valid in RE2.
    // It safely treats it like a zero-width assertion (e.g. ^+) and prevents
    // infinite loops by dropping redundant execution threads at the same string index!
    ['(?<=a)+', null],
    ['(?<!a)*', null]
  ]

  test.concurrent.each(cases)('input %p compile raise error %p', (input, expected) => {
    const compile = () => {
      try {
        // Compile directly using internal flags to force lookbehinds ON
        RE2.compileImpl(input, RE2Flags.PERL | RE2Flags.LOOKBEHIND, false)
        expect(null).toEqual(expected)
      } catch (e) {
        expect(e.message).toEqual(`error parsing regexp: ${expected}`)
      }
    }

    compile()
  })
})
