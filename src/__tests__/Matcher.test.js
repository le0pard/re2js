import { expect, describe, test } from '@jest/globals'
import { MatcherInput } from '../MatcherInput'
import { Pattern } from '../Pattern'
import { Utils } from '../Utils'

describe('.lookingAt', () => {
  const cases = [
    ['abc', 'abcdef', true],
    ['abc', 'ab', false],
    ['abc', 'babcdf', false]
  ]

  test.concurrent.each(cases)('regexp %p for text %p will return %p', (regexp, text, expected) => {
    expect(Pattern.compile(regexp).matcher(text).lookingAt()).toEqual(expected)
    expect(Pattern.compile(regexp).matcher(Utils.stringToUtf8ByteArray(text)).lookingAt()).toEqual(
      expected
    )

    expect(text.match(`^${regexp}`) !== null).toBe(expected)
  })
})

describe('.macthes', () => {
  const cases = [
    ['ab+c', 'abbbc', 'cbbba'],
    ['ab.*c', 'abxyzc', 'ab\nxyzc'],
    ['^ab.*c$', 'abc', 'xyz\nabc\ndef'],
    ['ab+c', 'abbbc', 'abbcabc']
  ]

  test.concurrent.each(cases)(
    'regexp %p match text %p and not match text %p',
    (regexp, match, nonMatch) => {
      const nativeRe = new RegExp(regexp)
      const pr = Pattern.compile(regexp)
      expect(match.match(nativeRe)[0]).toEqual(match)
      expect(pr.matcher(match).matches()).toBeTruthy()
      expect(pr.matcher(Utils.stringToUtf8ByteArray(match)).matches()).toBeTruthy()

      const noMatchRes = nativeRe.exec(nonMatch) ? nativeRe.exec(nonMatch)[0] : null
      expect(noMatchRes).not.toEqual(nonMatch)
      expect(pr.matcher(nonMatch).matches()).toBeFalsy()
      expect(pr.matcher(Utils.stringToUtf8ByteArray(nonMatch)).matches()).toBeFalsy()
    }
  )
})

describe('.replaceAll', () => {
  const cases = [
    [
      "What the Frog's Eye Tells the Frog's Brain",
      'Frog',
      'Lizard',
      "What the Lizard's Eye Tells the Lizard's Brain"
    ],
    [
      "What the Frog's Eye Tells the Frog's Brain",
      'F(rog)',
      '\\$Liza\\rd$1',
      "What the $Lizardrog's Eye Tells the $Lizardrog's Brain"
    ],
    [
      'abcdefghijklmnopqrstuvwxyz123',
      '(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)',
      '$10$20',
      'jb0wo0123'
    ],
    ['\u00e1\u0062\u00e7\u2655', '(.)', '<$1>', '<\u00e1><\u0062><\u00e7><\u2655>'],
    ['\u00e1\u0062\u00e7\u2655', '[\u00e0-\u00e9]', '<$0>', '<\u00e1>\u0062<\u00e7>\u2655'],
    ['hello world', 'z*', 'x', 'xhxexlxlxox xwxoxrxlxdx'],
    ['123:foo', '(?:\\w+|\\d+:foo)', 'x', 'x:x'],
    ['123:foo', '(?:\\d+:foo|\\w+)', 'x', 'x'],
    ['aab', 'a*', '<$0>', '<aa><>b<>'],
    ['aab', 'a*?', '<$0>', '<>a<>a<>b<>']
  ]

  test.concurrent.each(cases)('orig %p regex %p repl %p actual %p', (orig, regex, repl, actual) => {
    for (let input of [MatcherInput.utf16(orig), MatcherInput.utf8(orig)]) {
      expect(Pattern.compile(regex).matcher(input).replaceAll(repl)).toEqual(actual)
    }
  })
})
