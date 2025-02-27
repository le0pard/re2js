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
