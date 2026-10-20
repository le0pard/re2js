import { expect, describe, it, vi } from 'vitest'
import { DFA, hashState } from '../DFA.js'
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
  it('is built by RE2 on first use, as only yes/no questions need it', () => {
    const re = RE2.compile('(\\w+) (\\w+)')
    expect(re.lazyDFA).toBeNull()
    expect(re.findSubmatchIndex('ab cd')).toEqual([0, 5, 0, 2, 3, 5])
    expect(re.lazyDFA).toBeNull()
    expect(re.match('ab cd')).toBe(true)
    expect(re.lazyDFA).toBeInstanceOf(DFA)
    expect(re.dfa).toBe(re.lazyDFA)
  })

  it('keeps states whose hashes collide apart', () => {
    // Find two lists with the same 32-bit hash among seeded random pairs (birthday bound: about
    // 80,000 tries); they need not be real instructions, as getState only compares them.
    const seen = new Map()
    let pair = null
    let seed = 1
    const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) | 0)
    while (pair === null) {
      const pcs = [next(), next()]
      const hash = hashState(pcs, 0, [])
      if (seen.has(hash)) pair = [seen.get(hash), pcs]
      seen.set(hash, pcs)
    }
    const dfa = createDFA('a')
    const first = dfa.getState(pair[0], 0, [])
    const second = dfa.getState(pair[1], 0, [])
    expect(second).not.toBe(first)
    expect(dfa.getState(pair[0], 0, [])).toBe(first)
    expect(dfa.getState(pair[1], 0, [])).toBe(second)
    expect(dfa.stateCache.size).toBe(1)
    expect(Array.from(dfa.cachedStates())).toEqual([first, second])
    expect(dfa.stateCount).toBe(2)
  })

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
    expect(dfa.memBudget).toBe(before - DFA.stateCost(recreated.nfaStates, recreated.matchIDs))
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
    for (const state of plain.cachedStates()) {
      expect(state.flag & ~DFA.FLAG_MATCH).toBe(0)
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

describe('DFA agrees with the NFA under memory pressure', () => {
  // Seeded random patterns with assertions on hostile inputs (lone surrogates, invalid UTF-8,
  // Kelvin sign and long s, CR/LF), from every start position and anchoring, with budgets small
  // enough to force cache resets and give-ups mid-search. The DFA answers yes/no questions such
  // as validation with test(), so under any budget it must either agree with the NFA or decline
  // (null).
  const makeRandom = (seed) => {
    let state = seed
    const next = () => {
      state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff
      return state / 0x7fffffff
    }
    return { next, pick: (items) => items[Math.floor(next() * items.length)] }
  }
  const ATOMS = ['a', 'b', 'K', '(?i:k)', '(?i:s)', 'é', '😀', '\\n', '.', '(?s:.)', '[^a]', '\\w']
  ATOMS.push('\\W', '\\pL', '\\x{FFFD}', '^', '$', '\\A', '\\z', '\\b', '\\B', '(?m:^)', '(?m:$)')
  const PIECES = ['a', 'b', 'K', 'K', 's', 'ſ', 'é', '😀', '\n', '\r', ' ', '_']
  PIECES.push('\ud800', '\udc00', '�')
  const BYTES = [[0x61], [0x0a], [0x20], [0x5f], [0xff], [0xc3], [0xc3, 0xa9], [0xf0, 0x9f]]
  BYTES.push([0xed, 0xa0, 0x80], [0xf0, 0x9f, 0x98, 0x80], [0x80])
  const ANCHORS = [RE2Flags.UNANCHORED, RE2Flags.ANCHOR_START, RE2Flags.ANCHOR_BOTH]

  it.each([1, 2])('random patterns and inputs (seed %i)', (seed) => {
    const random = makeRandom(seed)
    const atom = (depth) =>
      random.next() < 0.7 || depth > 1 ? random.pick(ATOMS) : `(?:${sequence(depth + 1)})`
    const quantify = (s) => (random.next() < 0.5 ? s : s + random.pick(['*', '+', '?', '{2}']))
    const sequence = (depth) => {
      let s = ''
      for (let n = 1 + Math.floor(random.next() * 4); n > 0; n--) s += quantify(atom(depth))
      return random.next() < 0.3 ? `${s}|${quantify(atom(depth))}` : s
    }

    let answered = 0
    for (let i = 0; i < 120; i++) {
      const re = RE2.compile(random.pick(['', '(?i)', '(?m)', '(?s)']) + sequence(0))
      const dfas = [new DFA(re.prog), new DFA(re.prog, 4000), new DFA(re.prog, 1200)]
      let text = ''
      for (let n = Math.floor(random.next() * 12); n > 0; n--) text += random.pick(PIECES)
      const bytes = []
      for (let n = Math.floor(random.next() * 12); n > 0; n--) bytes.push(...random.pick(BYTES))
      const inputs = [
        [() => MachineInput.fromUTF16(text), text.length, JSON.stringify(text)],
        [() => MachineInput.fromUTF8(Uint8Array.from(bytes)), bytes.length, `[${bytes}]`]
      ]
      for (const [makeInput, length, shown] of inputs) {
        for (let pos = 0; pos <= length; pos++) {
          for (const anchor of ANCHORS) {
            const want = re.doExecuteNFA(makeInput(), pos, anchor, 0) !== null
            for (const dfa of dfas) {
              const have = dfa.match(makeInput(), pos, anchor)
              if (have === null) continue
              answered++
              const where = `/${re}/ on ${shown} pos=${pos} anchor=${anchor} maxMem=${dfa.maxMem}`
              expect(have, where).toBe(want)
            }
          }
        }
      }
    }
    expect(answered).toBeGreaterThan(1000)
  })
})
