import { Parser } from '../Parser'
import { Simplify } from '../Simplify'
import { PrefilterTree, Prefilter } from '../Prefilter'
import { RE2Flags } from '../RE2Flags'
import { RE2JS } from '../index'
import { MachineInput } from '../MachineInput'
import { expect, describe, test, it } from '@jest/globals'

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
    // a{2,5} flattens to -> a a a? a? a?
    ['a{2,5}b', 'AND(EXACT("a"), EXACT("a"), EXACT("b"))'],
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

  test.concurrent.each(cases)('pattern %p builds prefilter %p', (pattern, expected) => {
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
    expect(pf.eval(MachineInput.fromUTF8(Buffer.from('bar foo baz')), 0)).toBe(true)
    expect(pf.eval(MachineInput.fromUTF8(Buffer.from('bar fox baz')), 0)).toBe(false)
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
    expect(pf.eval(MachineInput.fromUTF8(Buffer.from('To the 🚀 and then 🌕!')), 0)).toBe(true)
    expect(pf.eval(MachineInput.fromUTF8(Buffer.from('To the 🚀 and then back!')), 0)).toBe(false)
  })

  it('respects end boundaries on bounded input buffers', () => {
    const pf = PrefilterTree.build(Simplify.simplify(Parser.parse('hidden', RE2Flags.PERL)))
    const text = 'visible hidden'

    // Create an input bounded to only the first 7 characters ("visible")
    // The prefilter MUST NOT find "hidden" because it sits outside the boundary
    const utf16Input = MachineInput.fromUTF16(text, 0, 7)
    expect(pf.eval(utf16Input, 0)).toBe(false)

    const utf8Input = MachineInput.fromUTF8(Buffer.from(text), 0, 7)
    expect(pf.eval(utf8Input, 0)).toBe(false)
  })
})

describe('Prefilter Aho-Corasick Automaton', () => {
  test('safely handles Object.prototype pollution', () => {
    // Maliciously pollute the global Object prototype
    Object.prototype.pollutedProperty = 'hacked' // eslint-disable-line no-extend-native

    // Build an OR prefilter that triggers AhoCorasick generation.
    // If the for...in loops are unguarded, this will crash the Trie builder.
    const re = Simplify.simplify(Parser.parse('apple|banana|cherry', RE2Flags.PERL))
    let pf

    expect(() => {
      pf = PrefilterTree.build(re)
    }).not.toThrow()

    expect(pf.ac16).toBeDefined()
    expect(pf.ac8).toBeDefined()

    // Clean up global pollution
    delete Object.prototype.pollutedProperty
  })

  test('searches UTF-8 and UTF-16 simultaneously via AhoCorasick', () => {
    const re = Simplify.simplify(Parser.parse('foo|bar|baz', RE2Flags.PERL))
    const pf = PrefilterTree.build(re)

    // Ensure the AST simplified into the AhoCorasick optimization
    expect(pf.ac16).toBeDefined()
    expect(pf.ac8).toBeDefined()

    const utf16InputMatch = MachineInput.fromUTF16('I have a baz in here')
    const utf16InputFail = MachineInput.fromUTF16('I have a qux in here')

    // Test UTF-16 evaluation
    expect(pf.eval(utf16InputMatch, 0)).toBe(true)
    expect(pf.eval(utf16InputFail, 0)).toBe(false)

    // Test UTF-8 evaluation
    const utf8InputMatch = MachineInput.fromUTF8(Buffer.from('I have a baz in here'))
    const utf8InputFail = MachineInput.fromUTF8(Buffer.from('I have a qux in here'))

    expect(pf.eval(utf8InputMatch, 0)).toBe(true)
    expect(pf.eval(utf8InputFail, 0)).toBe(false)
  })
})
