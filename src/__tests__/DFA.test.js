import { expect, describe, it, vi } from 'vitest'
import { DFA } from '../DFA.js'
import { RE2 } from '../RE2.js'
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
  it('declines lookbehinds, which run as separate automata in the NFA', () => {
    const dfa = createDFA('(?<=a)b', RE2Flags.PERL | RE2Flags.LOOKBEHIND)
    expect(dfa.failed).toBe(true)
    expect(runDFA(dfa, 'ab')).toBeNull()
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
    const current = dfa.start(MachineInput.fromUTF16('aaab'), 0)
    const recreated = dfa.resetCache(current)
    expect(dfa.stateCount).toBe(1)
    expect(recreated.nfaStates).toEqual(current.nfaStates)
    expect(dfa.memBudget).toBe(before - DFA.STATE_OVERHEAD - 4 * recreated.nfaStates.length)
  })

  it('accepts programs with empty-width assertions', () => {
    const dfa = createDFA('\\bword\\b')
    expect(dfa.failed).toBe(false)
    expect(runDFA(dfa, 'a word here')).toBe(true)
    expect(runDFA(dfa, 'swordfish')).toBe(false)
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
    const startState = dfa.start(MachineInput.fromUTF16('€€€x'), 0)
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
    const startState = dfa.start(MachineInput.fromUTF16('a'), 0)
    expect(startState.nextAnchored).not.toBeNull()
    expect(startState.next).toBeNull()
    runDFA(dfa, 'xa')
    expect(startState.next).not.toBeNull()
  })

  it('stays linear in the number of distinct non-Latin-1 runes', () => {
    // Every rune outside the program's classes shares one transition entry, so 40,000
    // distinct runes cost a handful of transition computations. Per-rune transitions (the
    // old scheme, scanned linearly) cost one computation per distinct rune: quadratic time.
    const dfa = createDFA('.c')
    let s = ''
    for (let i = 0; i < 40000; i++) s += String.fromCodePoint(0x100 + i)
    const step = vi.spyOn(dfa, 'step')
    expect(runDFA(dfa, `${s}c`)).toBe(true)
    expect(step.mock.calls.length).toBeLessThan(10)
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
    const ids = dfa.matchSet(MachineInput.fromUTF16('xxxxx'), 0, RE2Flags.UNANCHORED)
    expect(ids).toHaveLength(2000)
    expect(new Set(ids).size).toBe(2000)
  })
})

describe('Empty-width assertions (port of RE2 dfa.cc flag handling)', () => {
  // Expected results come from the Pike VM, which evaluates assertions directly.
  const nfa = (pattern, text, anchor = RE2Flags.UNANCHORED, pos = 0) => {
    const re = RE2.compile(pattern)
    return re.doExecuteNFA(MachineInput.fromUTF16(text), pos, anchor, 0) !== null
  }
  const dfa = (pattern, text, anchor = RE2Flags.UNANCHORED, pos = 0) => {
    const re = RE2.compile(pattern)
    return re.dfa.match(MachineInput.fromUTF16(text), pos, anchor)
  }

  const cases = [
    // word boundaries, including at the start and end of the text
    ['\\bfoo\\b', ['foo', 'a foo b', 'foobar', 'barfoo', 'foo_', '_foo', '', 'fo o']],
    ['\\Boo\\B', ['foo', 'fooo', 'oo', ' oo ', 'xoox']],
    ['\\b', ['', ' ', 'a', ' a ', '!!']],
    ['\\B', ['', ' ', 'a', 'ab', 'a b']],
    ['^\\b$', ['', 'a']],
    ['a\\b|b\\B', ['a', 'ab', 'ba', 'bb', 'a b']],
    // RE2's \\b is ASCII-only
    ['\\bé', ['é', 'aé', ' é']],
    // line and text anchors
    ['^abc$', ['abc', 'xabc', 'abcx', 'ab\nabc', 'abc\n']],
    ['(?m)^abc$', ['abc', 'x\nabc\ny', 'xabc', 'abc\n', '\nabc']],
    ['(?m)^$', ['', '\n', 'a\n', 'a\nb', '\n\n']],
    ['\\Aa', ['a', 'ba', '\na']],
    ['a\\z', ['a', 'ab', 'a\n']],
    ['a$', ['a', 'a\n', 'ab']],
    ['(?m)a$', ['a', 'a\n', 'ab', 'a\nb']],
    ['^$', ['', 'a', '\n']],
    // repeated and alternated assertions (the case that makes RE2 keep kInstAlt in states)
    ['(^|a)+', ['a', 'b', 'aa', '']],
    ['(?:\\b|x)+y', ['y', 'xy', ' y', 'xxy', 'axy']],
    ['(?m)(?:^|,)x', ['x', 'a,x', 'a\nx', 'ax']]
  ]

  it.each(cases)('%p agrees with the NFA on all anchors', (pattern, texts) => {
    for (const text of texts) {
      for (const anchor of [RE2Flags.UNANCHORED, RE2Flags.ANCHOR_START, RE2Flags.ANCHOR_BOTH]) {
        const message = `/${pattern}/ on ${JSON.stringify(text)} anchor=${anchor}`
        expect(dfa(pattern, text, anchor), message).toBe(nfa(pattern, text, anchor))
      }
    }
  })

  it('uses the context before the start position (begin line, after a word character)', () => {
    // After a word character, \\b at the start position is not a boundary; after a space it is
    expect(dfa('\\bb', 'ab', RE2Flags.UNANCHORED, 1)).toBe(false)
    expect(dfa('\\bb', ' b', RE2Flags.UNANCHORED, 1)).toBe(true)
    expect(dfa('\\Bb', 'ab', RE2Flags.UNANCHORED, 1)).toBe(true)
    // After a newline, (?m)^ holds but \\A does not
    expect(dfa('(?m)^b', 'a\nb', RE2Flags.UNANCHORED, 2)).toBe(true)
    expect(dfa('\\Ab', 'a\nb', RE2Flags.UNANCHORED, 2)).toBe(false)
    expect(dfa('(?m)^b', 'ab', RE2Flags.UNANCHORED, 1)).toBe(false)
    // Same answers as the NFA for every start position
    const text = 'ab cd\nef_g 12'
    for (const pattern of ['\\b\\w', '\\B\\w', '(?m)^\\w', '\\w$', '(?m)\\w$', '\\A.', '\\b']) {
      for (let pos = 0; pos <= text.length; pos++) {
        expect(dfa(pattern, text, RE2Flags.UNANCHORED, pos), `/${pattern}/ at ${pos}`).toBe(
          nfa(pattern, text, RE2Flags.UNANCHORED, pos)
        )
      }
    }
  })

  it('reports a match one character late and at the end through END_TEXT', () => {
    const d = createDFA('a')
    const start = d.start(MachineInput.fromUTF16('a'), 0)
    expect(start.isMatch).toBe(false)
    const afterA = d.step(start, d.runeClass(97), 97, RE2Flags.UNANCHORED)
    // the MATCH instruction is reached after 'a', but only reported on the next transition
    expect(afterA.isMatch).toBe(false)
    const atEnd = d.step(afterA, d.numClasses, -1, RE2Flags.UNANCHORED)
    expect(atEnd.isMatch).toBe(true)
  })

  it('keeps states without pending assertions free of flag bits', () => {
    // Same number of states with and without word characters in the input: no LAST_WORD
    // variants are created when no EMPTY_WIDTH instruction is pending
    const plain = createDFA('x+y')
    runDFA(plain, 'abcabc')
    const states = plain.stateCount
    runDFA(plain, '  !!  ')
    expect(plain.stateCount).toBe(states)
    for (const bucket of plain.stateCache.values()) {
      for (const state of bucket) {
        expect(state.flag & ~DFA.FLAG_MATCH).toBe(0)
      }
    }
  })

  it('gives newline and word characters their own classes only when assertions need them', () => {
    expect(Array.from(createDFA('x').classBounds)).toEqual([120, 121])
    expect(Array.from(createDFA('(?m)^x').classBounds)).toEqual([10, 11, 120, 121])
    // word characters [0-9], [A-Z], _, [a-z], plus x itself
    expect(Array.from(createDFA('\\bx').classBounds)).toEqual([
      48, 58, 65, 91, 95, 96, 97, 120, 121, 123
    ])
  })

  it('stays correct when a tiny budget forces cache resets mid-search', () => {
    const text = 'foo bar_baz qux\nfoo\n'.repeat(50)
    for (const pattern of ['\\bba\\w+\\b', '(?m)^foo$', '\\Bz', 'qux$']) {
      const re = RE2.compile(pattern)
      const tiny = new DFA(re.prog, 2500)
      const result = tiny.match(MachineInput.fromUTF16(text), 0, RE2Flags.UNANCHORED)
      if (result !== null) {
        expect(result, pattern).toBe(nfa(pattern, text))
      }
    }
  })
})
