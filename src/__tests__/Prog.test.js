import { RE2Flags } from '../RE2Flags'
import { Parser } from '../Parser'
import { Compiler } from '../Compiler'
import { expect, describe, test } from '@jest/globals'

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
1*      rune "AM" -> 2
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

describe('Prog - Lookbehinds Compilation', () => {
  it('compiles lookbehinds and tracks numLb and lbStarts correctly', () => {
    const re = Parser.parse('(?<=foo)(?<!bar)baz', RE2Flags.LOOKBEHIND)
    const prog = Compiler.compileRegexp(re)

    // The regex has 2 lookbehinds, so numLb must be exactly 2
    expect(prog.numLb).toBe(2)

    // It must have registered 2 starting PCs for the parallel automata
    expect(prog.lbStarts.length).toBe(2)

    // Verify that the lbStarts points to valid instructions
    expect(prog.inst[prog.lbStarts[0]]).toBeDefined()
    expect(prog.inst[prog.lbStarts[1]]).toBeDefined()

    // One of the instructions in the automata should be LB_WRITE
    const hasLbWrite = prog.inst.some((i) => i.op === 12) // Inst.LB_WRITE = 12
    expect(hasLbWrite).toBe(true)

    // One of the instructions in the main thread should be LB_CHECK
    const hasLbCheck = prog.inst.some((i) => i.op === 13) // Inst.LB_CHECK = 13
    expect(hasLbCheck).toBe(true)
  })
})
