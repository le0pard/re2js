import { RE2JS, RE2Set } from '../index'
import { expect, describe, test } from '@jest/globals'

describe('RE2Set Multi-Pattern Matching', () => {
  test('matches multiple literal patterns simultaneously (Unanchored)', () => {
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

  test('returns matched indices in sorted order regardless of string position', () => {
    const set = new RE2Set(RE2Set.UNANCHORED)
    set.add('baz') // 0
    set.add('bar') // 1
    set.add('foo') // 2

    set.compile()

    // The string has the matches in the order: foo, bar, baz
    // But the set should always return the sorted indices: [0, 1, 2]
    expect(set.match('foobarbaz')).toEqual([0, 1, 2])
  })

  test('matches with boundaries fallback securely to NFA', () => {
    const set = new RE2Set(RE2Set.UNANCHORED)
    set.add('\\bfoo\\b') // 0
    set.add('\\bbar\\b') // 1

    set.compile()

    // Bails out of DFA to NFA seamlessly
    expect(set.match('foo bar')).toEqual([0, 1])
    expect(set.match('foobar')).toEqual([]) // Boundary checks fail
  })

  test('respects ANCHOR_BOTH', () => {
    const set = new RE2Set(RE2Set.ANCHOR_BOTH)
    set.add('foo') // 0
    set.add('bar') // 1
    set.add('.*') // 2

    set.compile()

    expect(set.match('foo')).toEqual([0, 2])
    expect(set.match('bar')).toEqual([1, 2])
    expect(set.match('foobar')).toEqual([2]) // Only wildcard covers whole string
  })

  test('respects ANCHOR_START', () => {
    const set = new RE2Set(RE2Set.ANCHOR_START)
    set.add('foo') // 0
    set.add('bar') // 1

    set.compile()

    expect(set.match('foo is first')).toEqual([0])
    expect(set.match('bar is first')).toEqual([1])
    expect(set.match('a foo is not first')).toEqual([])
  })

  test('handles public flags: CASE_INSENSITIVE', () => {
    const set = new RE2Set(RE2Set.UNANCHORED, RE2JS.CASE_INSENSITIVE)
    set.add('foo') // 0
    set.add('BAR') // 1

    set.compile()

    expect(set.match('FOO')).toEqual([0])
    expect(set.match('fOo')).toEqual([0])
    expect(set.match('bar')).toEqual([1])
  })

  test('handles public flags: LOOKBEHINDS natively inside sets', () => {
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

  test('handles empty set gracefully', () => {
    const set = new RE2Set()
    set.compile()
    expect(set.match('foo')).toEqual([])
  })

  test('prevents adding after compile', () => {
    const set = new RE2Set()
    set.compile()
    expect(() => set.add('foo')).toThrow('Cannot add patterns after compile')
  })

  test('throws on invalid regex syntax during add', () => {
    const set = new RE2Set()
    expect(() => set.add('*invalid')).toThrow()
    // Throw because LOOKBEHINDS flag isn't set!
    expect(() => set.add('(?<=foo)bar')).toThrow()
  })

  test('accepts UTF-8 byte array inputs', () => {
    const set = new RE2Set()
    set.add('foo') // 0
    set.compile()

    const utf8Input = Array.from(Buffer.from('hello foo world'))
    expect(set.match(utf8Input)).toEqual([0])
  })
})
