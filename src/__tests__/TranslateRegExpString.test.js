import { TranslateRegExpString } from '../TranslateRegExpString'
import { expect, describe, test } from '@jest/globals'

describe('.translate', () => {
  test.concurrent.each([
    // Original Cases
    [null, null],
    [83, 83],
    [true, true],
    ['[a-z]+', '[a-z]+'],
    ['^[a-c]*', '^[a-c]*'],
    ['abc', 'abc'],
    ['', '(?:)'],
    ['foo/bar', 'foo\\/bar'],
    ['foo\\/bar', 'foo\\/bar'],
    ['(?<foo>bar)', '(?P<foo>bar)'],
    ['é\\b', 'é\\b'],
    ['😊.*', '😊.*'],
    ['[α-ε]?', '[α-ε]?'],

    // Complex combination (Checks \cM, \u degrading, strict \u 4-digit, and bracketed \u)
    ['a\\cM\\u34\\u1234\\u10abcdz', 'a\\x0Du34\\x{1234}\\x{10ab}cdz'],
    ['a\\cM\\u34\\u1234\\u{10abcd}z', 'a\\x0Du34\\x{1234}\\x{10abcd}z'],
    ['\\cM\\u1234\\n\\c1\\u1', '\\x0D\\x{1234}\\nc1u1'],

    // Control Escapes (\c) - Uppercase
    ['\\cA', '\\x01'],
    ['\\cM', '\\x0D'],
    ['\\cZ', '\\x1A'],

    // Control Escapes (\c) - Lowercase (ES Standard)
    ['\\ca', '\\x01'],
    ['\\cm', '\\x0D'],
    ['\\cz', '\\x1A'],

    // Control Escapes (\c) - Invalid Degradation (Fall back to literal 'c')
    ['\\c', 'c'],
    ['\\c1', 'c1'],
    ['\\c_', 'c_'],

    // Unicode Escapes (\u) - Strict 4-Digit Hex
    ['\\u0034', '\\x{0034}'],
    ['\\uABCD', '\\x{ABCD}'],
    ['\\uabcd', '\\x{abcd}'],
    ['a\\u0034b', 'a\\x{0034}b'],

    // Unicode Escapes (\u) - Bracketed ES6 Syntax
    ['\\u{10abcd}', '\\x{10abcd}'],
    ['\\u{1234}', '\\x{1234}'],
    ['\\u{}', '\\x{}'],

    // Unicode Escapes (\u) - Invalid Degradation (Fall back to literal 'u')
    ['\\u', 'u'],
    ['\\u1', 'u1'],
    ['\\u12', 'u12'],
    ['\\u123', 'u123'],
    ['\\u123G', 'u123G'],
    ['\\uXXXX', 'uXXXX'],

    // Bypasses lookaround assertions without treating them as named captures
    ['(?<)', '(?<)'],
    ['(?<=a)b', '(?<=a)b'], // Positive lookbehind
    ['(?<!a)b', '(?<!a)b'] // Negative lookbehind
  ])('#translate(%p) === %p', (input, expected) => {
    expect(TranslateRegExpString.translate(input)).toEqual(expected)
  })
})
