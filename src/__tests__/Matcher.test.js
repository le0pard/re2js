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

describe('.replaceFirst', () => {
  const cases = [
    [
      "What the Frog's Eye Tells the Frog's Brain",
      'Frog',
      'Lizard',
      "What the Lizard's Eye Tells the Frog's Brain"
    ],
    [
      "What the Frog's Eye Tells the Frog's Brain",
      'F(rog)',
      '\\$Liza\\rd$1',
      "What the $Lizardrog's Eye Tells the Frog's Brain"
    ],
    [
      'abcdefghijklmnopqrstuvwxyz123',
      '(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)',
      '$10$20',
      'jb0nopqrstuvwxyz123'
    ],
    ['\u00e1\u0062\u00e7\u2655', '(.)', '<$1>', '<\u00e1>\u0062\u00e7\u2655'],
    ['\u00e1\u0062\u00e7\u2655', '[\u00e0-\u00e9]', '<$0>', '<\u00e1>\u0062\u00e7\u2655'],
    ['hello world', 'z*', 'x', 'xhello world'],
    ['aab', 'a*', '<$0>', '<aa>b'],
    ['aab', 'a*?', '<$0>', '<>aab']
  ]

  test.concurrent.each(cases)('orig %p regex %p repl %p actual %p', (orig, regex, repl, actual) => {
    for (let input of [MatcherInput.utf16(orig), MatcherInput.utf8(orig)]) {
      expect(Pattern.compile(regex).matcher(input).replaceFirst(repl)).toEqual(actual)
    }
  })
})

describe('.groupCount', () => {
  const cases = [
    ['(a)(b(c))d?(e)', 4],
    ['abc', 0],
    ['(a)(b)(c)', 3]
  ]

  test.concurrent.each(cases)('regexp %p have %p groups', (regexp, count) => {
    const re = Pattern.compile(regexp)

    expect(re.groupCount()).toEqual(count)
    expect(re.matcher('x').groupCount()).toEqual(count)
    expect(re.matcher(Utils.stringToUtf8ByteArray('x')).groupCount()).toEqual(count)
  })
})

describe('.group', () => {
  const cases = [
    ['xabdez', '(a)(b(c)?)d?(e)', ['abde', 'a', 'b', null, 'e']],
    ['abc', '(a)(b$)?(b)?', ['ab', 'a', null, 'b']],
    ['abc', '(^b)?(b)?c', ['bc', null, 'b']],
    [' a b', '\\b(.).\\b', ['a ', 'a']],
    ['αβξδεφγ', '(.)(..)(...)', ['αβξδεφ', 'α', 'βξ', 'δεφ']],
    [
      '\u03b1\u03b2\u03be\u03b4\u03b5\u03c6\u03b3',
      '(.)(..)(...)',
      ['\u03b1\u03b2\u03be\u03b4\u03b5\u03c6', '\u03b1', '\u03b2\u03be', '\u03b4\u03b5\u03c6']
    ]
  ]

  test.concurrent.each(cases)('text %p regexp %p output %p', (text, regexp, output) => {
    const p = Pattern.compile(regexp)

    for (let input of [MatcherInput.utf16(text), MatcherInput.utf8(text)]) {
      const matchString = p.matcher(input)
      expect(matchString.find()).toBeTruthy()
      expect(matchString.group()).toEqual(output[0])
      for (let i = 0; i < output.length; i++) {
        expect(matchString.group(i)).toEqual(output[i])
      }
      expect(matchString.groupCount()).toEqual(output.length - 1)
    }
  })
})

describe('.find', () => {
  const casesMatch = [
    ['abcdefgh', '.*[aeiou]', 0, 'abcde'],
    ['abcdefgh', '.*[aeiou]', 1, 'bcde'],
    ['abcdefgh', '.*[aeiou]', 2, 'cde'],
    ['abcdefgh', '.*[aeiou]', 3, 'de'],
    ['abcdefgh', '.*[aeiou]', 4, 'e']
  ]

  test.concurrent.each(casesMatch)(
    'match: text %p regexp %p start %p output %p',
    (text, regexp, start, output) => {
      const p = Pattern.compile(regexp)

      for (let input of [MatcherInput.utf16(text), MatcherInput.utf8(text)]) {
        const matchString = p.matcher(input)
        expect(matchString.find(start)).toBeTruthy()
        expect(matchString.group()).toEqual(output)
      }
    }
  )

  const casesNoMatch = [
    ['abcdefgh', '.*[aeiou]', 5],
    ['abcdefgh', '.*[aeiou]', 6],
    ['abcdefgh', '.*[aeiou]', 7]
  ]

  test.concurrent.each(casesNoMatch)(
    'no match: text %p regexp %p start %p',
    (text, regexp, start) => {
      const p = Pattern.compile(regexp)

      for (let input of [MatcherInput.utf16(text), MatcherInput.utf8(text)]) {
        const matchString = p.matcher(input)
        expect(matchString.find(start)).toBeFalsy()
      }
    }
  )
})
