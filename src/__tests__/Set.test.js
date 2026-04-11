import { RE2Set } from '../Set'
import { RE2Flags } from '../RE2Flags'
import { expect, describe, test } from '@jest/globals'

describe('RE2Set Multi-Pattern Matching', () => {
  test('matches multiple literal patterns simultaneously (Unanchored)', () => {
    const set = new RE2Set(RE2Flags.UNANCHORED)
    set.add('foo') // index 0
    set.add('bar') // index 1
    set.add('baz') // index 2

    set.compile()

    expect(set.match('I love foobar')).toEqual([0, 1])
    expect(set.match('baz is here')).toEqual([2])
    expect(set.match('nothing matches')).toEqual([])
    expect(set.match('foobarbaz')).toEqual([0, 1, 2])
  })

  test('matches with boundaries fallback securely to NFA', () => {
    const set = new RE2Set(RE2Flags.UNANCHORED)
    set.add('\\bfoo\\b') // 0
    set.add('\\bbar\\b') // 1

    set.compile()

    // Bails out of DFA to NFA seamlessly
    expect(set.match('foo bar')).toEqual([0, 1])
    expect(set.match('foobar')).toEqual([]) // Boundary checks fail
  })

  test('respects anchoring', () => {
    const set = new RE2Set(RE2Flags.ANCHOR_BOTH)
    set.add('foo') // 0
    set.add('bar') // 1
    set.add('.*') // 2

    set.compile()

    expect(set.match('foo')).toEqual([0, 2])
    expect(set.match('bar')).toEqual([1, 2])
    expect(set.match('foobar')).toEqual([2]) // Only wildcard covers whole string
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
})
