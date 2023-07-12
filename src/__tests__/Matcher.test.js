import { RE2 } from '../RE2'
import { MatcherInput } from '../MatcherInput'
import { Matcher } from '../Matcher'
import { Pattern } from '../Pattern'
import { Utils } from '../Utils'
import { expect, describe, test } from '@jest/globals'

const helperTestMatchEndUTF16 = (string, num, end) => {
  const pattern = `[${string}]`
  const RE2Modified = class extends RE2 {
    match(input, start, e, anchor, group, ngroup) {
      expect(end).toEqual(e)
      return super.match(input, start, e, anchor, group, ngroup)
    }
  }
  const re = RE2Modified.initTest(pattern)

  const pat = new Pattern(pattern, 0, re)
  const m = pat.matcher(string)

  let found = 0
  while (m.find()) {
    found += 1
  }
  expect(num).toEqual(found)
}

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
      expect(pr.matcher(match).matches()).toBe(true)
      expect(pr.matcher(Utils.stringToUtf8ByteArray(match)).matches()).toBe(true)

      const noMatchRes = nativeRe.exec(nonMatch) ? nativeRe.exec(nonMatch)[0] : null
      expect(noMatchRes).not.toEqual(nonMatch)
      expect(pr.matcher(nonMatch).matches()).toBe(false)
      expect(pr.matcher(Utils.stringToUtf8ByteArray(nonMatch)).matches()).toBe(false)
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
      expect(matchString.find()).toBe(true)
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
        expect(matchString.find(start)).toBe(true)
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
        expect(matchString.find(start)).toBe(false)
      }
    }
  )
})

describe('invalid find', () => {
  it('raise error', () => {
    const p = Pattern.compile('.*')

    const text = 'abcdef'
    for (let input of [MatcherInput.utf16(text), MatcherInput.utf8(text)]) {
      const matchString = p.matcher(input)
      expect(() => matchString.find(10)).toThrow('start index out of bounds: 10')
    }
  })
})

describe('invalid replacement', () => {
  it('raise error', () => {
    const p = Pattern.compile('abc')

    const text = 'abc'
    for (let input of [MatcherInput.utf16(text), MatcherInput.utf8(text)]) {
      const matchString = p.matcher(input)
      expect(() => matchString.replaceFirst('$4')).toThrow('n > number of groups: 4')
    }
  })
})

it('throws on null input reset', () => {
  expect(() => new Matcher(Pattern.compile('pattern'), null)).toThrow(
    'Cannot read properties of null'
  )
})

it('throws on null input ctor', () => {
  expect(() => new Matcher(null, 'input')).toThrow('pattern is null')
})

describe('start end before find', () => {
  it('raise error', () => {
    const m = Pattern.compile('a').matcher('abaca')
    expect(() => m.start()).toThrow('perhaps no match attempted')
  })
})

it('matches updates match information', () => {
  const m = Pattern.compile('a+').matcher('aaa')
  expect(m.matches()).toBe(true)
  expect(m.group(0)).toEqual('aaa')
})

it('alternation matches', () => {
  const string = '123:foo'
  expect(Pattern.compile('(?:\\w+|\\d+:foo)').matcher(string).matches()).toBe(true)
  expect(Pattern.compile('(?:\\d+:foo|\\w+)').matcher(string).matches()).toBe(true)
})

it('match end UTF16', () => {
  // Latin alphabetic chars such as these 5 lower-case, acute vowels have multi-byte UTF-8
  // encodings but fit in a single UTF-16 code, so the final match is at UTF16 offset 5.
  const vowels = '\u00A5\u00E9\u00DF\u00F3\u00F8'
  helperTestMatchEndUTF16(vowels, 5, 5)

  const utf16 = String.fromCodePoint(0x10000, 0x10001, 0x10002)
  expect(utf16).toEqual('\uD800\uDC00\uD800\uDC01\uD800\uDC02')
  helperTestMatchEndUTF16(utf16, 3, 6)
})

describe('groups', () => {
  it('search', () => {
    const p = Pattern.compile('b(an)*(.)')
    const m = p.matcher('by, band, banana')
    expect(m.lookingAt()).toBe(true)
    m.reset()

    expect(m.find()).toBe(true)
    expect(m.group(0)).toEqual('by')
    expect(m.group(1)).toBeNull()
    expect(m.group(2)).toEqual('y')

    expect(m.find()).toBe(true)
    expect(m.group(0)).toEqual('band')
    expect(m.group(1)).toEqual('an')
    expect(m.group(2)).toEqual('d')

    expect(m.find()).toBe(true)
    expect(m.group(0)).toEqual('banana')
    expect(m.group(1)).toEqual('an')
    expect(m.group(2)).toEqual('a')

    expect(m.find()).toBe(false)
  })

  it('named', () => {
    const p = Pattern.compile(
      '(?P<baz>f(?P<foo>b*a(?P<another>r+)){0,10})(?P<bag>bag)?(?P<nomatch>zzz)?'
    )
    const m = p.matcher('fbbarrrrrbag')

    expect(m.matches()).toBe(true)
    expect(m.group('baz')).toEqual('fbbarrrrr')
    expect(m.group('foo')).toEqual('bbarrrrr')
    expect(m.group('another')).toEqual('rrrrr')

    expect(m.start('baz')).toEqual(0)
    expect(m.start('foo')).toEqual(1)
    expect(m.start('another')).toEqual(4)
    expect(m.end('baz')).toEqual(9)
    expect(m.end('foo')).toEqual(9)

    expect(m.group('bag')).toEqual('bag')
    expect(m.start('bag')).toEqual(9)
    expect(m.end('bag')).toEqual(12)

    expect(m.group('nomatch')).toBeNull()
    expect(m.start('nomatch')).toEqual(-1)
    expect(m.end('nomatch')).toEqual(-1)

    expect(() => m.group('nonexistent')).toThrow("group 'nonexistent' not found")
  })

  it('another named', () => {
    const p = Pattern.compile('(?P<baz>f+)(?P<bag>b+)?')
    const m = p.matcher('ffffbbbbb')

    expect(m.matches()).toBe(true)
    expect(m.group('baz')).toEqual('ffff')
    expect(m.group('bag')).toEqual('bbbbb')

    expect(m.start('baz')).toEqual(0)
    expect(m.start('bag')).toEqual(4)

    expect(m.end('baz')).toEqual(4)
    expect(m.end('bag')).toEqual(9)
  })

  it('second named', () => {
    const p = Pattern.compile('(?P<baz>f{0,10})(?P<bag>b{0,10})')
    const m = p.matcher('ffffbbbbb')

    expect(m.matches()).toBe(true)
    expect(m.group('baz')).toEqual('ffff')
    expect(m.group('bag')).toEqual('bbbbb')

    expect(m.start('baz')).toEqual(0)
    expect(m.start('bag')).toEqual(4)

    expect(m.end('baz')).toEqual(4)
    expect(m.end('bag')).toEqual(9)
  })
})

it('froup zero width assertions', () => {
  const m = Pattern.compile('(\\d{2} ?(\\d|[a-z])?)($|[^a-zA-Z])').matcher('22 bored')
  expect(m.find()).toBe(true)
  expect(m.group(1)).toEqual('22')
})

it('pattern longest match', () => {
  const pattern = '(?:a+)|(?:a+ b+)'
  const text = 'xxx aaa bbb yyy'

  const matcher = Pattern.compile(pattern).matcher(text)
  expect(matcher.find()).toBe(true)
  expect(text.substring(matcher.start(), matcher.end())).toEqual('aaa')

  const longMatcher = Pattern.compile(pattern, Pattern.LONGEST_MATCH).matcher(text)
  expect(longMatcher.find()).toBe(true)
  expect(longMatcher.substring(longMatcher.start(), longMatcher.end())).toEqual('aaa bbb')
})
