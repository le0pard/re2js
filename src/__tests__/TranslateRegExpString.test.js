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
    ['a\\cM\\u34\\u1234\\u10abcdz', 'a\\x0Du34\\x{1234}\\x{10ab}cdz'],
    ['a\\cM\\u34\\u1234\\u{10abcd}z', 'a\\x0Du34\\x{1234}\\x{10abcd}z'],
    ['', '(?:)'],
    ['foo/bar', 'foo\\/bar'],
    ['foo\\/bar', 'foo\\/bar'],
    ['(?<foo>bar)', '(?P<foo>bar)']
  ])('#translate(%p) === %p', (input, expected) => {
    expect(TranslateRegExpString.translate(input)).toEqual(expected)
  })
})

describe('edge cases', () => {
  test('strictly supports both uppercase and lowercase \\c control escapes', () => {
    // Both \ca and \cA should evaluate to \x01 (Start of Heading)
    expect(TranslateRegExpString.translate('\\ca')).toBe('\\x01')
    expect(TranslateRegExpString.translate('\\cA')).toBe('\\x01')

    // \cz and \cZ should evaluate to \x1A (Substitute)
    expect(TranslateRegExpString.translate('\\cz')).toBe('\\x1A')
    expect(TranslateRegExpString.translate('\\cZ')).toBe('\\x1A')
  })

  test('gracefully degrades incomplete or invalid \\c escapes', () => {
    // Native JS evaluates invalid \c escapes as the literal character 'c'.
    expect(TranslateRegExpString.translate('\\c')).toBe('c')
    expect(TranslateRegExpString.translate('\\c1')).toBe('c1')
  })

  test('gracefully handles incomplete or invalid \\u escapes', () => {
    // Missing hex sequence (JS parses as literal 'u')
    expect(TranslateRegExpString.translate('\\u')).toBe('u')
    // Invalid hex characters (JS parses as literal 'u' followed by 'XYZ')
    expect(TranslateRegExpString.translate('\\uXYZ')).toBe('uXYZ')
    // Empty braces
    expect(TranslateRegExpString.translate('\\u{}')).toBe('\\x{}')
  })

  test('safely bypasses lookaround assertions without treating them as named captures', () => {
    // Should NOT be translated to (?P< if there's no valid group name
    expect(TranslateRegExpString.translate('(?<)')).toBe('(?<)')
    expect(TranslateRegExpString.translate('(?<=a)b')).toBe('(?<=a)b') // Positive lookbehind
    expect(TranslateRegExpString.translate('(?<!a)b')).toBe('(?<!a)b') // Negative lookbehind
  })

  test('strictly requires 4 hex digits for non-bracketed \\u escapes', () => {
    // Standard JS evaluates invalid \u escapes as the literal character 'u'
    expect(TranslateRegExpString.translate('\\u1')).toBe('u1')
    expect(TranslateRegExpString.translate('\\u12')).toBe('u12')
    expect(TranslateRegExpString.translate('\\u123')).toBe('u123')

    // Should NOT be translated because it contains an invalid hex character
    expect(TranslateRegExpString.translate('\\u123Z')).toBe('u123Z')

    // EXACTLY 4 digits SHOULD be translated safely into RE2 \x{...} format
    expect(TranslateRegExpString.translate('\\u1234')).toBe('\\x{1234}')

    // 4 digits followed by more chars SHOULD translate the first 4
    expect(TranslateRegExpString.translate('\\u12345')).toBe('\\x{1234}5')
    expect(TranslateRegExpString.translate('\\u1234Z')).toBe('\\x{1234}Z')
  })
})
