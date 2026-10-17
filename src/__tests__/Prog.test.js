import { expect, describe, it } from 'vitest'
import { RE2Flags } from '../RE2Flags.js'
import { Parser } from '../Parser.js'
import { Compiler } from '../Compiler.js'
import { Simplify } from '../Simplify.js'
import { Inst } from '../Inst.js'
import { RE2JS } from '../index.js'

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

  it.each(cases)('input %p compileRegexp to %p', (input, expected) => {
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

describe('Prog - Lookbehind instruction marking', () => {
  const pcsWhere = (prog, pred) =>
    prog.inst.map((inst, pc) => (pred(inst) ? pc : -1)).filter((pc) => pc >= 0)
  const isRune = (ch) => (inst) =>
    Inst.isRuneOp(inst.op) && inst.runes.length === 1 && inst.runes[0] === ch.codePointAt(0)

  it('marks exactly the instructions of the lookbehind automata', () => {
    const re = Parser.parse('(?<=fo+)bar', RE2Flags.PERL | RE2Flags.LOOKBEHIND)
    const prog = Compiler.compileRegexp(re)

    expect(prog.lbInst).toBeInstanceOf(Uint8Array)
    expect(prog.lbInst.length).toBe(prog.numInst())

    // The automaton: its `.*?` prefix, the lookbehind body and the final LB_WRITE
    for (const pc of prog.lbStarts) {
      expect(prog.lbInst[pc]).toBe(1)
    }
    for (const pc of pcsWhere(prog, (inst) => inst.op === Inst.RUNE_ANY)) {
      expect(prog.lbInst[pc]).toBe(1)
    }
    for (const ch of ['f', 'o']) {
      for (const pc of pcsWhere(prog, isRune(ch))) {
        expect(prog.lbInst[pc]).toBe(1)
      }
    }
    for (const pc of pcsWhere(prog, (inst) => inst.op === Inst.LB_WRITE)) {
      expect(prog.lbInst[pc]).toBe(1)
    }

    // The main pattern: its start, the LB_CHECK, the literal and the MATCH
    expect(prog.lbInst[prog.start]).toBe(0)
    for (const pc of pcsWhere(prog, (inst) => inst.op === Inst.LB_CHECK)) {
      expect(prog.lbInst[pc]).toBe(0)
    }
    for (const ch of ['b', 'a', 'r']) {
      for (const pc of pcsWhere(prog, isRune(ch))) {
        expect(prog.lbInst[pc]).toBe(0)
      }
    }
    for (const pc of pcsWhere(prog, (inst) => inst.op === Inst.MATCH)) {
      expect(prog.lbInst[pc]).toBe(0)
    }
  })

  it('treats the check of a nested lookbehind as part of the enclosing automaton', () => {
    const re = Parser.parse('(?<=a(?<!x))b', RE2Flags.PERL | RE2Flags.LOOKBEHIND)
    const prog = Compiler.compileRegexp(re)

    const checks = pcsWhere(prog, (inst) => inst.op === Inst.LB_CHECK)
    expect(checks).toHaveLength(2)
    // The inner check (lookbehind 2, negative) sits inside the outer automaton,
    // the outer check (lookbehind 1) sits in the main pattern.
    const marks = checks.map((pc) => [prog.inst[pc].arg, prog.lbInst[pc]])
    expect(marks).toEqual(
      expect.arrayContaining([
        [-2, 1],
        [1, 0]
      ])
    )
  })

  it('marks nothing when the regexp has no lookbehinds', () => {
    const prog = Compiler.compileRegexp(Parser.parse('fo+bar', RE2Flags.PERL))
    expect(prog.lbInst.length).toBe(prog.numInst())
    expect(prog.lbInst.every((v) => v === 0)).toBe(true)

    const empty = Compiler.compileSet([])
    expect(empty.lbInst.length).toBe(empty.numInst())
  })

  it('marks lookbehind automata of compiled sets', () => {
    const prog = Compiler.compileSet([
      Parser.parse('(?<=a)b', RE2Flags.PERL | RE2Flags.LOOKBEHIND),
      Parser.parse('c', RE2Flags.PERL | RE2Flags.LOOKBEHIND)
    ])
    expect(prog.lbInst.length).toBe(prog.numInst())
    for (const pc of prog.lbStarts) {
      expect(prog.lbInst[pc]).toBe(1)
    }
    for (const pc of pcsWhere(prog, (inst) => inst.op === Inst.MATCH)) {
      expect(prog.lbInst[pc]).toBe(0)
    }
    expect(prog.lbInst[prog.start]).toBe(0)
  })
})

describe('Prog.prefix stops at U+FFFD', () => {
  // Invalid UTF-8 bytes decode to U+FFFD, but a byte search for its encoding (EF BF BD) could
  // never find them, so the literal prefix must end before it (Go: i.Rune[0] != utf8.RuneError).
  const prefixOf = (pattern) =>
    Compiler.compileRegexp(Parser.parse(pattern, RE2Flags.PERL)).prefix()

  it('excludes the error rune from the prefix', () => {
    expect(prefixOf('abc')).toEqual([true, 'abc'])
    expect(prefixOf('ab\\x{FFFD}c')).toEqual([false, 'ab'])
    expect(prefixOf('\\x{FFFD}abc')).toEqual([false, ''])
    expect(prefixOf('\\x{FFFD}')).toEqual([false, ''])
  })

  it('so a literal with U+FFFD still matches invalid bytes through every engine', () => {
    const re = RE2JS.compile('\\x{FFFD}abc')
    const input = new Uint8Array([0x61, 0xff, 0x61, 0x62, 0x63])
    expect(re.test(input)).toBe(true)
    const m = re.matcher(input)
    expect(m.find()).toBe(true)
    expect(m.start()).toBe(1)
    expect(RE2JS.compile('x\\x{FFFD}y|zzz').test(new Uint8Array([0x78, 0xc0, 0x79]))).toBe(true)
    expect(RE2JS.compile('x\\x{FFFD}y|zzz').test(new Uint8Array([0x78, 0x79]))).toBe(false)
  })
})

describe('Compiler shares the rune array of repeated literal runes', () => {
  it('uses one array per distinct rune', () => {
    const prog = Compiler.compileRegexp(
      Simplify.simplify(Parser.parse('(?:ab){500}', RE2Flags.PERL))
    )
    const runeArrays = new Set()
    let runeInsts = 0
    for (const inst of prog.inst) {
      if (inst.op === Inst.RUNE1) {
        runeInsts++
        runeArrays.add(inst.runes)
      }
    }
    expect(runeInsts).toBe(1000)
    expect(runeArrays.size).toBe(2)
  })
})
