import { expect, describe, it } from 'vitest'
import { Parser } from '../Parser.js'
import { RE2JS, RE2Set } from '../index.js'
import { Utils } from '../Utils.js'

describe('RE2Set Multi-Pattern Matching', () => {
  it('matches multiple literal patterns simultaneously (Unanchored)', () => {
    const set = new RE2Set(RE2Set.UNANCHORED)
    set.add('foo') // index 0
    set.add('bar') // index 1
    set.add('baz') // index 2

    set.compile()

    expect(set.match('I love foobar')).toEqual([0, 1])
    expect(set.match('baz is here')).toEqual([2])
    expect(set.match('nothing matches')).toEqual([])
    expect(set.match('foobarbaz')).toEqual([0, 1, 2])
  })

  it('returns matched indices in sorted order regardless of string position', () => {
    const set = new RE2Set(RE2Set.UNANCHORED)
    set.add('baz') // 0
    set.add('bar') // 1
    set.add('foo') // 2

    set.compile()

    // The string has the matches in the order: foo, bar, baz
    // But the set should always return the sorted indices: [0, 1, 2]
    expect(set.match('foobarbaz')).toEqual([0, 1, 2])
  })

  it('matches with boundaries fallback securely to NFA', () => {
    const set = new RE2Set(RE2Set.UNANCHORED)
    set.add('\\bfoo\\b') // 0
    set.add('\\bbar\\b') // 1

    set.compile()

    // Bails out of DFA to NFA seamlessly
    expect(set.match('foo bar')).toEqual([0, 1])
    expect(set.match('foobar')).toEqual([]) // Boundary checks fail
  })

  it('respects ANCHOR_BOTH', () => {
    const set = new RE2Set(RE2Set.ANCHOR_BOTH)
    set.add('foo') // 0
    set.add('bar') // 1
    set.add('.*') // 2

    set.compile()

    expect(set.match('foo')).toEqual([0, 2])
    expect(set.match('bar')).toEqual([1, 2])
    expect(set.match('foobar')).toEqual([2]) // Only wildcard covers whole string
  })

  it('respects ANCHOR_START', () => {
    const set = new RE2Set(RE2Set.ANCHOR_START)
    set.add('foo') // 0
    set.add('bar') // 1

    set.compile()

    expect(set.match('foo is first')).toEqual([0])
    expect(set.match('bar is first')).toEqual([1])
    expect(set.match('a foo is not first')).toEqual([])
  })

  it('handles public flags: CASE_INSENSITIVE', () => {
    const set = new RE2Set(RE2Set.UNANCHORED, RE2JS.CASE_INSENSITIVE)
    set.add('foo') // 0
    set.add('BAR') // 1

    set.compile()

    expect(set.match('FOO')).toEqual([0])
    expect(set.match('fOo')).toEqual([0])
    expect(set.match('bar')).toEqual([1])
  })

  it('handles public flags: LOOKBEHINDS natively inside sets', () => {
    const set = new RE2Set(RE2Set.UNANCHORED, RE2JS.LOOKBEHINDS)
    set.add('(?<=a)b') // 0
    set.add('(?<!a)b') // 1
    set.add('(?<=x)y') // 2

    set.compile()

    expect(set.match('ab')).toEqual([0])
    expect(set.match('cb')).toEqual([1])
    expect(set.match('xy')).toEqual([2])
    expect(set.match('b')).toEqual([1])
  })

  it('handles empty set gracefully', () => {
    const set = new RE2Set()
    set.compile()
    expect(set.match('foo')).toEqual([])
  })

  it('prevents adding after compile', () => {
    const set = new RE2Set()
    set.compile()
    expect(() => set.add('foo')).toThrow('Cannot add patterns after compile')
  })

  it('throws on invalid regex syntax during add', () => {
    const set = new RE2Set()
    expect(() => set.add('*invalid')).toThrow()
    // Throw because LOOKBEHINDS flag isn't set!
    expect(() => set.add('(?<=foo)bar')).toThrow()
  })

  it('accepts UTF-8 byte array inputs', () => {
    const set = new RE2Set()
    set.add('foo') // 0
    set.compile()

    const utf8Input = Array.from(Utils.stringToUtf8ByteArray('hello foo world'))
    expect(set.match(utf8Input)).toEqual([0])
  })
})

it('RE2Set correctly evaluates Uint8Array inputs', () => {
  const set = new RE2Set()
  set.add('foo')
  set.compile()

  // Uint8Array representing the UTF-8 bytes for "hello foo"
  const utf8Input = new Uint8Array([104, 101, 108, 108, 111, 32, 102, 111, 111])
  expect(set.match(utf8Input)).toEqual([0])
})

describe('RE2Set Memory Limits', () => {
  it('uses default maxMem of 8MB when not specified', () => {
    const set = new RE2Set()
    set.add('foo')
    set.compile()
    expect(set.dfa.maxMem).toBe(8388608)
  })

  it('passes a custom maxMem to the DFA budget', () => {
    const set = new RE2Set(RE2Set.UNANCHORED, 0, 4096)
    set.add('foo')
    set.compile()
    expect(set.dfa.maxMem).toBe(4096)
    expect(set.dfa.memBudget).toBe(4096)
  })

  it('still matches through the NFA when the budget cannot hold the DFA', () => {
    const set = new RE2Set(RE2Set.UNANCHORED, 0, 100)
    set.add('foo')
    set.add('bar')
    set.compile()
    expect(set.match('xx bar')).toEqual([1])
    expect(set.dfa.failed).toBe(false)
  })
})

describe('RE2Set program size budget', () => {
  it('rejects a set whose combined program exceeds the single-regexp budget', () => {
    const saved = Parser.MAX_SIZE
    Parser.MAX_SIZE = 5000 // keep the test fast: each pattern below is within it, the sum is not
    try {
      const set = new RE2Set()
      for (let i = 0; i < 6; i++) {
        set.add('x{1000}')
      }
      expect(() => set.compile()).toThrow('expression too large')
      const ok = new RE2Set()
      for (let i = 0; i < 4; i++) {
        ok.add('x{1000}')
      }
      ok.compile()
      expect(ok.match('x'.repeat(1000))).toEqual([0, 1, 2, 3])
    } finally {
      Parser.MAX_SIZE = saved
    }
  })
})

describe('RE2Set flags', () => {
  it('applies CASE_INSENSITIVE, DOTALL and MULTILINE to every pattern', () => {
    const folded = new RE2Set(RE2Set.UNANCHORED, RE2JS.CASE_INSENSITIVE)
    folded.add('abc')
    folded.add('XYZ')
    expect(folded.match('xyz ABC')).toEqual([0, 1])

    const dotall = new RE2Set(RE2Set.UNANCHORED, RE2JS.DOTALL)
    dotall.add('a.b')
    expect(dotall.match('a\nb')).toEqual([0])
    const plain = new RE2Set()
    plain.add('a.b')
    expect(plain.match('a\nb')).toEqual([])

    const multiline = new RE2Set(RE2Set.UNANCHORED, RE2JS.MULTILINE)
    multiline.add('^b')
    expect(multiline.match('a\nb')).toEqual([0])
  })

  it('rejects Unicode classes with DISABLE_UNICODE_GROUPS', () => {
    const set = new RE2Set(RE2Set.UNANCHORED, RE2JS.DISABLE_UNICODE_GROUPS)
    expect(() => set.add('\\pL')).toThrow('invalid escape sequence')
    set.add('\\d')
    expect(set.match('5')).toEqual([0])
  })
})

describe('RE2Set anchored matching', () => {
  // The same expectations through the DFA (word boundaries are DFA-capable) and through
  // Machine.matchSet, the NFA fallback, which a lookbehind in the set forces.
  const viaEngine = (anchor, patterns, nfa) => {
    const set = new RE2Set(anchor, nfa ? RE2JS.LOOKBEHINDS : 0)
    for (const p of patterns) set.add(p)
    if (nfa) set.add('(?<=never)never')
    set.compile()
    expect(set.dfa.failed).toBe(nfa)
    return set
  }

  it.each([false, true])('ANCHOR_START (nfa: %s)', (nfa) => {
    const set = viaEngine(RE2Set.ANCHOR_START, ['\\bfoo', '\\bbar', 'o\\b'], nfa)
    expect(set.match('foo bar')).toEqual([0])
    expect(set.match('bar foo')).toEqual([1])
    expect(set.match(' foo')).toEqual([])
  })

  it.each([false, true])('ANCHOR_BOTH, on strings and bytes (nfa: %s)', (nfa) => {
    const set = viaEngine(RE2Set.ANCHOR_BOTH, ['\\bfoo\\b', 'foo.*', '.'], nfa)
    expect(set.match('foo')).toEqual([0, 1])
    expect(set.match('foo bar')).toEqual([1])
    expect(set.match('x')).toEqual([2])
    expect(set.match('')).toEqual([])

    // RE2's \\b is ASCII-only: no boundary next to é
    const bytes = viaEngine(RE2Set.ANCHOR_BOTH, ['\\bé\\B', 'é+'], nfa)
    expect(bytes.match(new TextEncoder().encode('éé'))).toEqual([1])
  })

  it.each([false, true])('UNANCHORED with line and text anchors (nfa: %s)', (nfa) => {
    const set = viaEngine(RE2Set.UNANCHORED, ['(?m)^b', 'a$', '\\Ax', 'y\\z', '\\Bo'], nfa)
    expect(set.match('a\nb')).toEqual([0])
    expect(set.match('xa')).toEqual([1, 2])
    expect(set.match('zzy')).toEqual([3])
    expect(set.match('foo')).toEqual([4])
    expect(set.match('o')).toEqual([])
  })
})
