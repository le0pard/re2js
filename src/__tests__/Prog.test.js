import { expect, describe, test } from '@jest/globals'
import { RE2Flags } from '../RE2Flags'
import { Parser } from '../Parser'
import { Compiler } from '../Compiler'

describe('.compileRegexp', () => {
  const cases = [
    [
      'a',
      `0       fail
1*      rune1 "a" -> 2
2       match
`
    ],
    [
      '[A-M][n-z]',
      `0       fail
1*      rune "nz" -> 2
2       rune "nz" -> 3
3       match
`
    ],
    [
      '',
      `0       fail
1*      nop -> 2
2       match
`
    ],
    [
      'a?',
      `0       fail
1       rune1 "a" -> 3
2*      alt -> 1, 3
3       match
`
    ],
    [
      'a??',
      `0       fail
1       rune1 "a" -> 3
2*      alt -> 3, 1
3       match
`
    ],
    [
      'a+',
      `0       fail
1*      rune1 "a" -> 2
2       alt -> 1, 3
3       match
`
    ],
    [
      'a+?',
      `0       fail
1*      rune1 "a" -> 2
2       alt -> 3, 1
3       match
`
    ],
    [
      'a*',
      `0       fail
1       rune1 "a" -> 2
2*      alt -> 1, 3
3       match
`
    ],
    [
      'a*?',
      `0       fail
1       rune1 "a" -> 2
2*      alt -> 3, 1
3       match
`
    ],
    [
      'a+b+',
      `0       fail
1*      rune1 "a" -> 2
2       alt -> 1, 3
3       rune1 "b" -> 4
4       alt -> 3, 5
5       match
`
    ],
    [
      '(a+)(b+)',
      `0       fail
1*      cap 2 -> 2
2       rune1 "a" -> 3
3       alt -> 2, 4
4       cap 3 -> 5
5       cap 4 -> 6
6       rune1 "b" -> 7
7       alt -> 6, 8
8       cap 5 -> 9
9       match
`
    ],
    [
      'a+|b+',
      `0       fail
1       rune1 "a" -> 2
2       alt -> 1, 6
3       rune1 "b" -> 4
4       alt -> 3, 6
5*      alt -> 1, 3
6       match
`
    ],
    [
      'A[Aa]',
      `0       fail
1*      rune1 "A" -> 2
2       rune "A"/i -> 3
3       match
`
    ],
    [
      '(?:(?:^).)',
      `0       fail
1*      empty 4 -> 2
2       anynotnl -> 3
3       match
`
    ],
    [
      '(?:|a)+',
      `0       fail
1       nop -> 4
2       rune1 "a" -> 4
3*      alt -> 1, 2
4       alt -> 3, 5
5       match
`
    ],
    [
      '(?:|a)*',
      `0       fail
1       nop -> 4
2       rune1 "a" -> 4
3       alt -> 1, 2
4       alt -> 3, 6
5*      alt -> 3, 6
6       match
`
    ],
    [
      '[A-Za-z0-9]+',
      `0       fail
1*      rune "09AZaz" -> 2
2       alt -> 1, 3
3       match
`
    ]
  ]

  test.concurrent.each(cases)('input %p compileRegexp to %p', (input, expected) => {
    const re = Parser.parse(input, RE2Flags.PERL)
    const p = Compiler.compileRegexp(re)
    expect(p.toString()).toEqual(expected)
  })
})
