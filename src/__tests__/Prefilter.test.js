import { expect, describe, it } from 'vitest'
import { Parser } from '../Parser.js'
import { Simplify } from '../Simplify.js'
import { PrefilterTree, Prefilter, AhoCorasick } from '../Prefilter.js'
import { RE2Flags } from '../RE2Flags.js'
import { RE2JS } from '../index.js'
import { MachineInput } from '../MachineInput.js'
import { Utils } from '../Utils.js'

// Helper to stringify the Prefilter tree for easy snapshot testing
const dumpPrefilter = (pf) => {
  if (!pf) return 'null'
  switch (pf.type) {
    case Prefilter.Type.NONE:
      return 'NONE'
    case Prefilter.Type.EXACT:
      return `EXACT("${pf.str}")`
    case Prefilter.Type.AND:
      return `AND(${pf.subs.map(dumpPrefilter).join(', ')})`
    case Prefilter.Type.OR:
      return `OR(${pf.subs.map(dumpPrefilter).join(', ')})`
    default:
      return 'UNKNOWN'
  }
}

const getPrefilterDump = (pattern, flags = RE2Flags.PERL) => {
  let re = Parser.parse(pattern, flags)
  re = Simplify.simplify(re)
  const pf = PrefilterTree.build(re)
  return dumpPrefilter(pf)
}

describe('PrefilterTree.build AST Extraction', () => {
  const cases = [
    // Basic Exact matches
    ['foo', 'EXACT("foo")'],
    ['^foo$', 'EXACT("foo")'],

    // Concatenations (AND)
    ['foo.*bar', 'AND(EXACT("foo"), EXACT("bar"))'],
    ['a.*b.*c', 'AND(EXACT("a"), EXACT("b"), EXACT("c"))'],

    // Alternations (OR)
    ['foo|bar', 'OR(EXACT("foo"), EXACT("bar"))'],
    ['apple|banana|cherry', 'OR(EXACT("apple"), EXACT("banana"), EXACT("cherry"))'],

    // Nested AND / OR
    ['(foo|bar)baz', 'AND(OR(EXACT("foo"), EXACT("bar")), EXACT("baz"))'],
    // "ba" is factored out by Simplify as a common prefix!
    ['foo(bar|baz)qux', 'AND(EXACT("foo"), EXACT("ba"), EXACT("qux"))'],

    // Repetitions
    ['a+b', 'AND(EXACT("a"), EXACT("b"))'],
    // a{2,5} flattens to -> a a a? a? a?, and the repeated requirement is kept once
    ['a{2,5}b', 'AND(EXACT("a"), EXACT("b"))'],
    ['a?b', 'EXACT("b")'],
    ['a*b', 'EXACT("b")'],

    // Simplification & Deduplication
    ['foo|foo', 'EXACT("foo")'],
    ['(a|a)b', 'AND(EXACT("a"), EXACT("b"))'],
    ['a?b?c?', 'NONE'],

    // Unsupported features downgrade to NONE safely
    ['(?i)foo', 'NONE'],
    ['\\d+foo', 'EXACT("foo")'],
    ['[a-z]+|foo', 'NONE'],
    // a|b|c dynamically shrinks into the CharClass [a-c] which yields no exact literal!
    ['a|b|c', 'NONE']
  ]

  it.each(cases)('pattern %p builds prefilter %p', (pattern, expected) => {
    expect(getPrefilterDump(pattern)).toEqual(expected)
  })
})

describe('Prefilter Evaluation (UTF-16 & UTF-8)', () => {
  it('correctly evaluates EXACT filters', () => {
    const pf = PrefilterTree.build(Simplify.simplify(Parser.parse('foo', RE2Flags.PERL)))

    // UTF-16
    expect(pf.eval(MachineInput.fromUTF16('bar foo baz'), 0)).toBe(true)
    expect(pf.eval(MachineInput.fromUTF16('bar fox baz'), 0)).toBe(false)

    // UTF-8
    expect(pf.eval(MachineInput.fromUTF8(Utils.stringToUtf8ByteArray('bar foo baz')), 0)).toBe(true)
    expect(pf.eval(MachineInput.fromUTF8(Utils.stringToUtf8ByteArray('bar fox baz')), 0)).toBe(
      false
    )
  })

  it('correctly evaluates AND filters', () => {
    const pf = PrefilterTree.build(Simplify.simplify(Parser.parse('foo.*bar', RE2Flags.PERL)))

    const input1 = MachineInput.fromUTF16('foo and then bar')
    expect(pf.eval(input1, 0)).toBe(true)

    const input2 = MachineInput.fromUTF16('foo and then baz')
    expect(pf.eval(input2, 0)).toBe(false) // Missing 'bar'
  })

  it('correctly evaluates OR filters', () => {
    const pf = PrefilterTree.build(Simplify.simplify(Parser.parse('foo|bar', RE2Flags.PERL)))

    const input1 = MachineInput.fromUTF16('I have a bar')
    expect(pf.eval(input1, 0)).toBe(true)

    const input2 = MachineInput.fromUTF16('I have a baz')
    expect(pf.eval(input2, 0)).toBe(false)
  })
})

describe('Engine Integration', () => {
  it('securely bails out early during unanchored tests', () => {
    const re = RE2JS.compile('error.*critical')

    // Both words exist -> Prefilter allows it -> Engine evaluates full regex
    expect(re.test('There was an error that was critical')).toBe(true)

    // Missing 'critical' -> Prefilter instantly bails out, returning false without running DFA/NFA
    expect(re.test('There was an error that was minor')).toBe(false)
  })

  it('does not interfere with anchored execution', () => {
    const re = RE2JS.compile('^foo.*bar$')

    // The prefilter skips evaluating for ANCHORED matches, routing to engine naturally
    expect(re.testExact('foo and bar')).toBe(true)
    expect(re.testExact('foo and baz')).toBe(false)
  })
})

describe('Advanced Prefilter Evaluation', () => {
  it('handles complex AND/OR logic branches correctly', () => {
    // Expected AST: AND(OR("foo", "bar"), "baz")
    const pf = PrefilterTree.build(Simplify.simplify(Parser.parse('(foo|bar)baz', RE2Flags.PERL)))

    expect(pf.eval(MachineInput.fromUTF16('foobaz'), 0)).toBe(true)
    expect(pf.eval(MachineInput.fromUTF16('barbaz'), 0)).toBe(true)
    expect(pf.eval(MachineInput.fromUTF16('foo'), 0)).toBe(false) // missing baz
    expect(pf.eval(MachineInput.fromUTF16('baz'), 0)).toBe(false) // missing foo or bar
    expect(pf.eval(MachineInput.fromUTF16('quxbaz'), 0)).toBe(false) // missing foo or bar
  })

  it('evaluates emojis and multi-byte unicode safely', () => {
    const pf = PrefilterTree.build(Simplify.simplify(Parser.parse('🚀.*🌕', RE2Flags.PERL)))

    // UTF-16
    expect(pf.eval(MachineInput.fromUTF16('To the 🚀 and then 🌕!'), 0)).toBe(true)
    expect(pf.eval(MachineInput.fromUTF16('To the 🚀 and then back!'), 0)).toBe(false)

    // UTF-8
    expect(
      pf.eval(MachineInput.fromUTF8(Utils.stringToUtf8ByteArray('To the 🚀 and then 🌕!')), 0)
    ).toBe(true)
    expect(
      pf.eval(MachineInput.fromUTF8(Utils.stringToUtf8ByteArray('To the 🚀 and then back!')), 0)
    ).toBe(false)
  })

  it('respects end boundaries on bounded input buffers', () => {
    const pf = PrefilterTree.build(Simplify.simplify(Parser.parse('hidden', RE2Flags.PERL)))
    const text = 'visible hidden'

    // Create an input bounded to only the first 7 characters ("visible")
    // The prefilter MUST NOT find "hidden" because it sits outside the boundary
    const utf16Input = MachineInput.fromUTF16(text, 0, 7)
    expect(pf.eval(utf16Input, 0)).toBe(false)

    const utf8Input = MachineInput.fromUTF8(Utils.stringToUtf8ByteArray(text), 0, 7)
    expect(pf.eval(utf8Input, 0)).toBe(false)
  })
})

describe('Prefilter Aho-Corasick Automaton', () => {
  it('safely handles Object.prototype pollution', () => {
    // Maliciously pollute the global Object prototype
    Object.prototype.pollutedProperty = 'hacked' // oxlint-disable-line no-extend-native

    // Build an OR prefilter that triggers AhoCorasick generation.
    // If the for...in loops are unguarded, this will crash the Trie builder.
    const re = Simplify.simplify(Parser.parse('apple|banana|cherry', RE2Flags.PERL))
    let pf

    expect(() => {
      pf = PrefilterTree.build(re)
    }).not.toThrow()

    expect(pf.allExact).toBe(true)
    expect(pf.eval(MachineInput.fromUTF16('a banana'), 0)).toBe(true)
    expect(pf.eval(MachineInput.fromUTF16('a pollutedProperty'), 0)).toBe(false)

    // Clean up global pollution
    delete Object.prototype.pollutedProperty
  })

  it('searches UTF-8 and UTF-16 simultaneously via AhoCorasick', () => {
    const re = Simplify.simplify(Parser.parse('foo|bar|baz', RE2Flags.PERL))
    const pf = PrefilterTree.build(re)

    // Ensure the AST simplified into the AhoCorasick optimization; automata are built on
    // first use, one per encoding
    expect(pf.allExact).toBe(true)
    expect(pf.ac16).toBeNull()
    expect(pf.ac8).toBeNull()

    const utf16InputMatch = MachineInput.fromUTF16('I have a baz in here')
    const utf16InputFail = MachineInput.fromUTF16('I have a qux in here')

    // Test UTF-16 evaluation
    expect(pf.eval(utf16InputMatch, 0)).toBe(true)
    expect(pf.eval(utf16InputFail, 0)).toBe(false)

    // Test UTF-8 evaluation
    const utf8InputMatch = MachineInput.fromUTF8(
      Utils.stringToUtf8ByteArray('I have a baz in here')
    )
    const utf8InputFail = MachineInput.fromUTF8(Utils.stringToUtf8ByteArray('I have a qux in here'))

    expect(pf.eval(utf8InputMatch, 0)).toBe(true)
    expect(pf.eval(utf8InputFail, 0)).toBe(false)
    expect(pf.ac16).not.toBeNull()
    expect(pf.ac8).not.toBeNull()
  })

  it('agrees with a naive substring search', () => {
    let seed = 3
    const rnd = (n) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed % n
    }
    const alphabet = ['a', 'b', 'c', 'é', '😀']
    const word = (max) => {
      let w = ''
      const n = 1 + rnd(max)
      for (let i = 0; i < n; i++) w += alphabet[rnd(alphabet.length)]
      return w
    }
    for (let round = 0; round < 200; round++) {
      const words = Array.from({ length: 1 + rnd(12) }, () => word(4))
      const unique = [...new Set(words)]
      const ac16 = new AhoCorasick(
        unique.map((w) => Array.from({ length: w.length }, (_, i) => w.charCodeAt(i))),
        0x10000
      )
      const ac8 = new AhoCorasick(
        unique.map((w) => Utils.stringToUtf8ByteArray(w)),
        0x100
      )
      for (let k = 0; k < 10; k++) {
        const text = word(12)
        const expected = unique.some((w) => text.includes(w))
        expect(ac16.searchUTF16(text, 0, text.length)).toBe(expected)
        const bytes = Utils.stringToUtf8ByteArray(text)
        expect(ac8.searchUTF8(bytes, 0, bytes.length)).toBe(expected)
      }
    }
  })
})

describe('Prefilter size and cost bounds', () => {
  const build = (pattern) =>
    PrefilterTree.build(Simplify.simplify(Parser.parse(pattern, RE2Flags.PERL)))

  it('keeps the first requirements of a long concatenation, up to the scan budget', () => {
    const literals = Array.from({ length: 100 }, (_, i) => `w${i}x`)
    const pf = build(literals.join('\\d'))
    expect(pf.type).toBe(Prefilter.Type.AND)
    expect(pf.subs).toHaveLength(Prefilter.MAX_SCANS)
    expect(pf.subs[0].str).toBe('w0x')
    expect(pf.cost).toBe(Prefilter.MAX_SCANS)
  })

  it('requires nothing from an alternation that would need too many scans', () => {
    // Each alternative is an AND of two literals, so the OR cannot use one automaton; distinct
    // leading runes keep the parser from factoring out a common prefix
    const alternative = (i) => `${String.fromCodePoint(0x4e00 + i)}\\db${i}`
    const many = Array.from({ length: 40 }, (_, i) => alternative(i))
    expect(build(many.join('|')).type).toBe(Prefilter.Type.NONE)
    const few = Array.from({ length: 10 }, (_, i) => alternative(i))
    const pf = build(few.join('|'))
    expect(pf.type).toBe(Prefilter.Type.OR)
    expect(pf.cost).toBe(20)
  })

  it('stores each repeated literal requirement once', () => {
    const pf = build('x{1000}')
    expect(dumpPrefilter(pf)).toBe('EXACT("x")')
  })

  it('bounds the size of literal alternations', () => {
    const big = Array.from({ length: 30000 }, (_, i) => `z${String.fromCodePoint(0x4e00 + i)}${i}`)
    // ~ 30000 words x ~10 bytes is above the automaton budget: no prefilter, correct matching
    const re = RE2JS.compile(big.join('|'))
    expect(re.test(`--${big[29999]}--`)).toBe(true)
    expect(re.test('-- z --')).toBe(false)
  })

  it('keeps the compiled prefilter small for large literal alternations', () => {
    const words = Array.from({ length: 20000 }, (_, i) => `w${i}x`)
    const re = RE2JS.compile(words.join('|'))
    const count = (pf) => (pf.subs.length === 0 ? 1 : 1 + pf.subs.reduce((n, s) => n + count(s), 0))
    expect(count(re.re2().prefilter ?? new Prefilter(Prefilter.Type.NONE))).toBeLessThan(200)
    expect(re.test('zz w19999x')).toBe(true)
    expect(re.test('zz w5 w5 w5')).toBe(false)
  })
})
