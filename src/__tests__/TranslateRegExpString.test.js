import { TranslateRegExpString } from '../TranslateRegExpString'
import { expect, describe, test } from '@jest/globals'

describe('.translate', () => {
  test.concurrent.each([
    [null, null],
    [83, 83],
    [true, true],
    ['[a-z]+', '[a-z]+'],
    ['^[a-c]*', '^[a-c]*'],
    ['abc', 'abc'],
    ['a\\cM\\u34\\u1234\\u10abcdz', 'a\\x0D\\x{34}\\x{1234}\\x{10ab}cdz'],
    ['a\\cM\\u34\\u1234\\u{10abcd}z', 'a\\x0D\\x{34}\\x{1234}\\x{10abcd}z'],
    ['', '(?:)'],
    ['foo/bar', 'foo\\/bar'],
    ['foo\\/bar', 'foo\\/bar'],
    ['(?<foo>bar)', '(?P<foo>bar)']
  ])('#translate(%p) === %p', (input, expected) => {
    expect(TranslateRegExpString.translate(input)).toEqual(expected)
  })
})

describe('edge cases', () => {
  test('gracefully handles incomplete or invalid \\c escapes', () => {
    // Missing character after \c
    expect(TranslateRegExpString.translate('\\c')).toBe('\\c')
    // Lowercase alpha after \c (must be uppercase)
    expect(TranslateRegExpString.translate('\\ca')).toBe('\\ca')
  })

  test('gracefully handles incomplete or invalid \\u escapes', () => {
    // Missing hex sequence
    expect(TranslateRegExpString.translate('\\u')).toBe('\\u')
    // Invalid hex characters
    expect(TranslateRegExpString.translate('\\uXYZ')).toBe('\\uXYZ')
    // Empty braces
    expect(TranslateRegExpString.translate('\\u{}')).toBe('\\x{}')
  })

  test('safely bypasses lookaround assertions without treating them as named captures', () => {
    // Should NOT be translated to (?P< if there's no valid group name
    expect(TranslateRegExpString.translate('(?<)')).toBe('(?<)')
    expect(TranslateRegExpString.translate('(?<=a)b')).toBe('(?<=a)b') // Positive lookbehind
    expect(TranslateRegExpString.translate('(?<!a)b')).toBe('(?<!a)b') // Negative lookbehind
  })
})
