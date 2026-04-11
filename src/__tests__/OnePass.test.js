import { RE2 } from '../RE2'
import { Utils } from '../Utils'
import { expect, describe, test } from '@jest/globals'

describe('OnePass Compiler', () => {
  test('rejects unanchored patterns', () => {
    // OnePass requires strictly anchored patterns to avoid powerset explosion
    const re = RE2.compile('abc')
    expect(re.onepass).toBeNull()
  })

  test('accepts simple anchored patterns', () => {
    const re = RE2.compile('^abc$')
    expect(re.onepass).not.toBeNull()
  })

  test('accepts valid 1-unambiguous patterns with captures', () => {
    const re = RE2.compile('^a(b|c)d$')
    expect(re.onepass).not.toBeNull()
  })

  test('rejects ambiguous patterns (e.g. overlapping alternations)', () => {
    // (b|.*) makes it mathematically ambiguous which branch to take when encountering 'b'
    // because both branches are valid paths.
    const re = RE2.compile('^a(b|.*)c$')
    expect(re.onepass).toBeNull()
  })

  test('rejects patterns with unanchored ends if alternations exist', () => {
    // (foo|bar) creates a true Inst.ALT. If the pattern isn't strictly anchored at the end,
    // the DFA cannot confidently resolve the state tree, so it must fall back to NFA.
    const re = RE2.compile('^a(foo|bar)')
    expect(re.onepass).toBeNull()
  })
})

describe('OnePass Execution', () => {
  test('correctly matches and captures groups (flattened alt)', () => {
    const re = RE2.compile('^a(b|c)d$')
    // Verify it successfully compiled into the OnePass DFA
    expect(re.onepass).not.toBeNull()

    // Test matching branch 1
    const match1 = re.findSubmatch('abd')
    expect(match1).not.toBeNull()
    expect(match1[0]).toBe('abd')
    expect(match1[1]).toBe('b')

    // Test matching branch 2
    const match2 = re.findSubmatch('acd')
    expect(match2).not.toBeNull()
    expect(match2[0]).toBe('acd')
    expect(match2[1]).toBe('c')

    // Test failure
    const match3 = re.findSubmatch('add')
    expect(match3).toBeNull()
  })

  test('executes true Inst.ALT branches correctly', () => {
    // Because 'foo' and 'bar' are multi-char strings, the parser cannot flatten them.
    // This forces the OnePass engine to properly navigate an Inst.ALT table.
    const re = RE2.compile('^(?:foo|bar)$')
    expect(re.onepass).not.toBeNull()

    const match1 = re.findSubmatch('foo')
    expect(match1).not.toBeNull()
    expect(match1[0]).toBe('foo')

    const match2 = re.findSubmatch('bar')
    expect(match2).not.toBeNull()
    expect(match2[0]).toBe('bar')
  })

  test('executes safely with UTF-8 byte inputs', () => {
    const re = RE2.compile('^a(b|c)d$')
    expect(re.onepass).not.toBeNull()

    const utf8Input = Utils.stringToUtf8ByteArray('abd')
    const match = re.findUTF8Submatch(utf8Input)

    expect(match).not.toBeNull()
    expect(Utils.utf8ByteArrayToString(match[0])).toBe('abd')
    expect(Utils.utf8ByteArrayToString(match[1])).toBe('b')
  })

  test('handles character classes correctly', () => {
    const re = RE2.compile('^a[x-z]+d$')
    expect(re.onepass).not.toBeNull()

    const match = re.findSubmatch('axyzd')
    expect(match).not.toBeNull()
    expect(match[0]).toBe('axyzd')
  })
})
