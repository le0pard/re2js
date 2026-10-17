import { expect, describe, it } from 'vitest'
import { DFA } from '../DFA.js'
import { Compiler } from '../Compiler.js'
import { Simplify } from '../Simplify.js'
import { Parser } from '../Parser.js'
import { RE2Flags } from '../RE2Flags.js'
import { MachineInput } from '../MachineInput.js'

const createDFA = (pattern, flags = RE2Flags.PERL, maxMem = void 0) => {
  const re = Simplify.simplify(Parser.parse(pattern, flags))
  const prog = Compiler.compileRegexp(re)
  return new DFA(prog, maxMem)
}

const runDFA = (dfa, text, anchor = RE2Flags.UNANCHORED) => {
  const input = MachineInput.fromUTF16(text)
  return dfa.match(input, 0, anchor)
}

describe('DFA', () => {
  describe('Basic Matching', () => {
    const cases = [
      ['a', 'a', true],
      ['a', 'b', false],
      ['abc', 'abc', true],
      ['abc', 'xabcy', true],
      ['a+b+', 'aaabbb', true],
      ['a+b+', 'ab', true],
      ['a+b+', 'bbaa', false],
      ['[0-9]+', 'abc123def', true],
      ['[0-9]+', 'abcdef', false],
      ['a.*b', 'axyzb', true]
    ]

    it.each(cases)('pattern %p with input %p returns %p', (pattern, text, expected) => {
      const dfa = createDFA(pattern)
      expect(runDFA(dfa, text)).toEqual(expected)
    })
  })

  describe('Anchored Matching', () => {
    const cases = [
      ['abc', 'abc', RE2Flags.ANCHOR_BOTH, true],
      ['abc', 'xabcy', RE2Flags.ANCHOR_BOTH, false],
      ['abc', 'abcxyz', RE2Flags.ANCHOR_START, true],
      ['abc', 'xyzabc', RE2Flags.ANCHOR_START, false],
      ['abc', 'xyzabc', RE2Flags.UNANCHORED, true]
    ]

    it.each(cases)(
      'pattern %p with input %p (anchor %p) returns %p',
      (pattern, text, anchor, expected) => {
        const dfa = createDFA(pattern)
        expect(runDFA(dfa, text, anchor)).toEqual(expected)
      }
    )
  })

  describe('Case Insensitivity', () => {
    const cases = [
      ['abc', 'ABC', true],
      ['[a-z]+', 'HELLO', true],
      ['a+', 'AaA', true]
    ]

    it.each(cases)('pattern %p with input %p returns %p', (pattern, text, expected) => {
      const dfa = createDFA(pattern, RE2Flags.PERL | RE2Flags.FOLD_CASE)
      expect(runDFA(dfa, text)).toEqual(expected)
    })
  })
})

describe('Bailout / Unsupported Features', () => {
  it('Bails out on lookaround or complex empty width assertions', () => {
    const dfa = createDFA('\\bword\\b')
    expect(runDFA(dfa, 'word')).toBeNull()
  })
})

describe('Memory budget (ReDoS Protection)', () => {
  it('completes a search within a tiny budget by resetting the cache while making progress', () => {
    // Enough for a handful of states: the cache is reset as needed and the search goes on.
    const dfa = createDFA('(a+)+b', RE2Flags.PERL, 2000)
    expect(runDFA(dfa, 'aaaaaab')).toBe(true)
    expect(dfa.failed).toBe(false)
  })

  it('gives up on a search that keeps exhausting the cache, for that search only', () => {
    // [ab]*a[ab]{12}c needs a distinct state for (almost) every recent 13-character window,
    // so random a/b input keeps creating states and never matches.
    let seed = 1
    let text = ''
    for (let i = 0; i < 20000; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      text += seed & 0x10000 ? 'a' : 'b'
    }
    const dfa = createDFA('[ab]*a[ab]{12}c', RE2Flags.PERL, 4000)
    expect(runDFA(dfa, text)).toBeNull()
    // Not a permanent failure: an input that fits the budget still runs on the DFA
    expect(dfa.failed).toBe(false)
    expect(runDFA(dfa, 'xyz')).toBe(false)
    expect(runDFA(dfa, `a${'b'.repeat(12)}c`)).toBe(true)
  })

  it('returns null when the budget cannot hold even the start state', () => {
    const dfa = createDFA('a', RE2Flags.PERL, 10)
    expect(runDFA(dfa, 'a')).toBeNull()
    expect(dfa.failed).toBe(false)
  })

  it('charges states and transition tables against the budget and restores it on reset', () => {
    const dfa = createDFA('a+b')
    const before = dfa.memBudget
    runDFA(dfa, 'aaab')
    expect(dfa.memBudget).toBeLessThan(before)
    expect(dfa.stateCount).toBeGreaterThan(0)
    const current = dfa.startState
    const recreated = dfa.resetCache(current)
    expect(dfa.stateCount).toBe(1)
    expect(recreated.nfaStates).toEqual(current.nfaStates)
    expect(dfa.memBudget).toBe(before - DFA.STATE_OVERHEAD - 4 * recreated.nfaStates.length)
  })

  it('declines programs with empty-width assertions or lookbehinds up front', () => {
    const dfa = createDFA('\\bword\\b')
    expect(dfa.failed).toBe(true)
    expect(runDFA(dfa, 'word')).toBeNull()
    const lb = createDFA('(?<=a)b', RE2Flags.PERL | RE2Flags.LOOKBEHIND)
    expect(lb.failed).toBe(true)
  })
})

describe('Rune classes', () => {
  it('splits the code point space at the boundaries of the program runes', () => {
    const dfa = createDFA('a[c-e]')
    // classes: [0,97) a=97 [98,99) [99,102) [102,...)
    expect(Array.from(dfa.classBounds)).toEqual([97, 98, 99, 102])
    expect(dfa.numClasses).toBe(5)
    expect(dfa.runeClass(0)).toBe(0)
    expect(dfa.runeClass(97)).toBe(1)
    expect(dfa.runeClass(98)).toBe(2)
    expect(dfa.runeClass(99)).toBe(3)
    expect(dfa.runeClass(101)).toBe(3)
    expect(dfa.runeClass(102)).toBe(4)
    expect(dfa.runeClass(0x10ffff)).toBe(4)
  })

  it('includes the fold orbit of case-insensitive literals', () => {
    const dfa = createDFA('k', RE2Flags.PERL | RE2Flags.FOLD_CASE)
    // k, K and the Kelvin sign U+212A
    expect(Array.from(dfa.classBounds)).toEqual([75, 76, 107, 108, 0x212a, 0x212b])
    expect(runDFA(dfa, '\u212a')).toBe(true)
  })

  it('treats the newline specially only for "." patterns', () => {
    expect(Array.from(createDFA('.').classBounds)).toEqual([10, 11])
    expect(Array.from(createDFA('(?s).').classBounds)).toEqual([])
    expect(createDFA('(?s).').numClasses).toBe(1)
  })

  it('shares one transition per class, for Latin-1 and higher runes alike', () => {
    const dfa = createDFA('€+x')
    runDFA(dfa, '€€€x')
    const startState = dfa.startState
    expect(startState).not.toBeNull()
    const euro = dfa.runeClass(8364)
    const afterEuro = startState.next[euro]
    expect(afterEuro).not.toBeNull()
    // the loop on '€' maps back to the same state
    expect(afterEuro.next[euro]).toBe(afterEuro)
    // runes of the same class share the entry: 'a' and 'b' are both "anything else" here
    expect(dfa.runeClass(97)).toBe(dfa.runeClass(98))
    expect(dfa.stateCount).toBeLessThanOrEqual(4)
  })

  it('keeps separate tables for anchored and unanchored searches', () => {
    const dfa = createDFA('a')
    runDFA(dfa, 'a', RE2Flags.ANCHOR_START)
    const startState = dfa.startState
    expect(startState.nextAnchored).not.toBeNull()
    expect(startState.next).toBeNull()
    runDFA(dfa, 'xa')
    expect(startState.next).not.toBeNull()
  })

  it('stays linear in the number of distinct non-Latin-1 runes', () => {
    // Every rune outside the program's classes shares one transition entry
    const dfa = createDFA('.c')
    let s = ''
    for (let i = 0; i < 40000; i++) s += String.fromCodePoint(0x100 + i)
    const t0 = Date.now()
    expect(runDFA(dfa, `${s}c`)).toBe(true)
    expect(Date.now() - t0).toBeLessThan(500) // was quadratic: ~280 ms here, ~1 s for 80,000
    expect(dfa.stateCount).toBeLessThanOrEqual(4)
  })
})

describe('Sets with many patterns', () => {
  it('collects match ids without quadratic work per state', () => {
    const regexps = []
    for (let i = 0; i < 2000; i++) {
      regexps.push(Simplify.simplify(Parser.parse(`x{${(i % 5) + 1}}`, RE2Flags.PERL)))
    }
    const dfa = new DFA(Compiler.compileSet(regexps))
    const t0 = Date.now()
    const ids = dfa.matchSet(MachineInput.fromUTF16('xxxxx'), 0, RE2Flags.UNANCHORED)
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(ids).toHaveLength(2000)
  })
})
