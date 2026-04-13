import { RE2JS } from '../index'
import { expect, describe, test } from '@jest/globals'

// more info - https://systemf.epfl.ch/blog/re2-lookbehinds/
describe('Lookbehinds (Linear Time EPFL Algorithm)', () => {
  test('Positive Lookbehind', () => {
    const re = RE2JS.compile('(?<=foo)bar', RE2JS.LOOKBEHINDS)
    expect(re.test('foobar')).toBe(true)
    expect(re.test('bazbar')).toBe(false)

    const match = re.matcher('foobar')
    expect(match.find()).toBe(true)
    expect(match.group(0)).toBe('bar') // Group 0 correctly ignores the zero-width assertion
  })

  test('Negative Lookbehind', () => {
    const re = RE2JS.compile('(?<!foo)bar', RE2JS.LOOKBEHINDS)
    expect(re.test('bazbar')).toBe(true)
    expect(re.test('foobar')).toBe(false)
  })

  test('Multiple lookbehinds', () => {
    const re = RE2JS.compile('(?<=a)(?<!b)c', RE2JS.LOOKBEHINDS)
    expect(re.test('ac')).toBe(true)
    expect(re.test('bc')).toBe(false)
    expect(re.test('xc')).toBe(false)
  })

  test('Lookbehinds are strictly opt-in', () => {
    // Will throw a syntax exception if the flag isn't provided
    expect(() => RE2JS.compile('(?<=foo)bar')).toThrow()
  })

  test('Does not capture groups inside lookbehinds (captureless algorithm)', () => {
    const re = RE2JS.compile('(?<=(foo))bar', RE2JS.LOOKBEHINDS)
    const match = re.matcher('foobar')
    expect(match.find()).toBe(true)
    expect(match.group(1)).toBeNull() // Group 1 should be safely ignored
  })

  test('C++ Fork Ported Tests - Positive Lookbehinds', () => {
    // FullMatch translates to testExact
    expect(RE2JS.compile('.*there(?<=hello.*)', RE2JS.LOOKBEHINDS).testExact('hello there')).toBe(
      true
    )

    // PartialMatch translates to test
    expect(RE2JS.compile('(?<= )there', RE2JS.LOOKBEHINDS).test('hello there')).toBe(true)
    expect(RE2JS.compile('(?<=123)45', RE2JS.LOOKBEHINDS).test('12345')).toBe(true)
    expect(RE2JS.compile('(?<=abc)123', RE2JS.LOOKBEHINDS).test('abc123def')).toBe(true)
    expect(RE2JS.compile('(?<=123)def', RE2JS.LOOKBEHINDS).test('abc123def')).toBe(true)

    // Nested lookbehinds
    expect(RE2JS.compile('def(?<=def(?<!f))', RE2JS.LOOKBEHINDS).test('abc123def')).toBe(false)
    expect(RE2JS.compile('word2(?<=word1.*)', RE2JS.LOOKBEHINDS).test('word1 word2 word3')).toBe(
      true
    )
  })

  test('C++ Fork Ported Tests - Negative Lookbehinds', () => {
    expect(RE2JS.compile('(?<!def)123', RE2JS.LOOKBEHINDS).test('abc123def')).toBe(true)
    expect(RE2JS.compile('(?<!abc)123', RE2JS.LOOKBEHINDS).test('abc123def')).toBe(false)
    expect(RE2JS.compile('(?<!goodbye )there', RE2JS.LOOKBEHINDS).test('hello there')).toBe(true)

    // FullMatch translates to testExact
    expect(RE2JS.compile('good(?<!d)bye', RE2JS.LOOKBEHINDS).testExact('goodbye')).toBe(false)
  })
})
