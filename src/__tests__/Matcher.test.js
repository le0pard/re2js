import { RE2 } from '../RE2'
import { MatcherInput } from '../MatcherInput'
import { Matcher } from '../Matcher'
import { RE2JS } from '../index'
import { Utils } from '../Utils'
import { RE2JSGroupException } from '../exceptions'
import { expect, describe, test } from '@jest/globals'

const helperTestMatchEndUTF16 = (string, num, end) => {
  const pattern = `[${string}]`
  const RE2Modified = class extends RE2 {
    matchWithGroup(input, start, e, anchor, group, ngroup) {
      expect(end).toEqual(e)
      return super.matchWithGroup(input, start, e, anchor, group, ngroup)
    }
  }
  const re = RE2Modified.initTest(pattern)

  const pat = RE2JS.initTest(pattern, 0, re)
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
    expect(RE2JS.compile(regexp).matcher(text).lookingAt()).toEqual(expected)
    expect(RE2JS.compile(regexp).matcher(Utils.stringToUtf8ByteArray(text)).lookingAt()).toEqual(
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
      const pr = RE2JS.compile(regexp)
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
  describe('default mode (javaMode = false, JS semantics)', () => {
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
        '$$Liza\\rd$1', // JS mode: $$ escapes to $, \r remains \r, $1 evaluates to group 1
        "What the $Liza\\rdrog's Eye Tells the $Liza\\rdrog's Brain"
      ],
      [
        'abcdefghijklmnopqrstuvwxyz123',
        '(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)',
        '$10$20', // JS mode: $10 parses as group 10 ('j'). $20 hits max groups (13), parses as group 2 + '0' ('b0')
        'jb0wo0123'
      ],
      ['\u00e1\u0062\u00e7\u2655', '(.)', '<$1>', '<\u00e1><\u0062><\u00e7><\u2655>'],
      ['\u00e1\u0062\u00e7\u2655', '[\u00e0-\u00e9]', '<$&>', '<\u00e1>\u0062<\u00e7>\u2655'], // $& refers to full match
      ['hello world', 'z*', 'x', 'xhxexlxlxox xwxoxrxlxdx'],
      ['123:foo', '(?:\\w+|\\d+:foo)', 'x', 'x:x'],
      ['123:foo', '(?:\\d+:foo|\\w+)', 'x', 'x'],
      ['aab', 'a*', '<$&>', '<aa><>b<>'], // $& refers to full match
      ['aab', 'a*?', '<$&>', '<>a<>a<>b<>'] // $& refers to full match
    ]

    test.concurrent.each(cases)(
      'orig %p regex %p repl %p actual %p',
      (orig, regex, repl, actual) => {
        for (let input of [MatcherInput.utf16(orig), MatcherInput.utf8(orig)]) {
          // Defaults to JS Mode (false)
          expect(RE2JS.compile(regex).matcher(input).replaceAll(repl)).toEqual(actual)
          expect(RE2JS.compile(regex).matcher(input).replaceAll(repl, false)).toEqual(actual)
        }
      }
    )
  })

  describe('java mode (javaMode = true)', () => {
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
        '\\$Liza\\rd$1', // Java mode: \$ escapes to $, \r escapes to r
        "What the $Lizardrog's Eye Tells the $Lizardrog's Brain"
      ],
      [
        'abcdefghijklmnopqrstuvwxyz123',
        '(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)',
        '$10$20', // Java mode: works identically here because it also caps parsing safely
        'jb0wo0123'
      ],
      ['\u00e1\u0062\u00e7\u2655', '(.)', '<$1>', '<\u00e1><\u0062><\u00e7><\u2655>'],
      ['\u00e1\u0062\u00e7\u2655', '[\u00e0-\u00e9]', '<$0>', '<\u00e1>\u0062<\u00e7>\u2655'], // $0 refers to full match
      ['hello world', 'z*', 'x', 'xhxexlxlxox xwxoxrxlxdx'],
      ['123:foo', '(?:\\w+|\\d+:foo)', 'x', 'x:x'],
      ['123:foo', '(?:\\d+:foo|\\w+)', 'x', 'x'],
      ['aab', 'a*', '<$0>', '<aa><>b<>'],
      ['aab', 'a*?', '<$0>', '<>a<>a<>b<>']
    ]

    test.concurrent.each(cases)(
      'orig %p regex %p repl %p actual %p',
      (orig, regex, repl, actual) => {
        for (let input of [MatcherInput.utf16(orig), MatcherInput.utf8(orig)]) {
          expect(RE2JS.compile(regex).matcher(input).replaceAll(repl, true)).toEqual(actual)
        }
      }
    )
  })
})

describe('.replaceFirst', () => {
  describe('default mode (javaMode = false, JS semantics)', () => {
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
        '$$Liza\\rd$1',
        "What the $Liza\\rdrog's Eye Tells the Frog's Brain"
      ],
      [
        'abcdefghijklmnopqrstuvwxyz123',
        '(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)',
        '$10$20',
        'jb0nopqrstuvwxyz123'
      ],
      ['\u00e1\u0062\u00e7\u2655', '(.)', '<$1>', '<\u00e1>\u0062\u00e7\u2655'],
      ['\u00e1\u0062\u00e7\u2655', '[\u00e0-\u00e9]', '<$&>', '<\u00e1>\u0062\u00e7\u2655'], // $& refers to full match
      ['hello world', 'z*', 'x', 'xhello world'],
      ['aab', 'a*', '<$&>', '<aa>b'],
      ['aab', 'a*?', '<$&>', '<>aab']
    ]

    test.concurrent.each(cases)(
      'orig %p regex %p repl %p actual %p',
      (orig, regex, repl, actual) => {
        for (let input of [MatcherInput.utf16(orig), MatcherInput.utf8(orig)]) {
          expect(RE2JS.compile(regex).matcher(input).replaceFirst(repl)).toEqual(actual)
          expect(RE2JS.compile(regex).matcher(input).replaceFirst(repl, false)).toEqual(actual)
        }
      }
    )
  })

  describe('java mode (javaMode = true)', () => {
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
      ['\u00e1\u0062\u00e7\u2655', '[\u00e0-\u00e9]', '<$0>', '<\u00e1>\u0062\u00e7\u2655'], // $0 refers to full match
      ['hello world', 'z*', 'x', 'xhello world'],
      ['aab', 'a*', '<$0>', '<aa>b'],
      ['aab', 'a*?', '<$0>', '<>aab']
    ]

    test.concurrent.each(cases)(
      'orig %p regex %p repl %p actual %p',
      (orig, regex, repl, actual) => {
        for (let input of [MatcherInput.utf16(orig), MatcherInput.utf8(orig)]) {
          expect(RE2JS.compile(regex).matcher(input).replaceFirst(repl, true)).toEqual(actual)
        }
      }
    )
  })
})

describe('invalid replacement', () => {
  it('falls back to literal string in default JS mode instead of throwing', () => {
    const p = RE2JS.compile('abc')

    const text = 'abc'
    for (let input of [MatcherInput.utf16(text), MatcherInput.utf8(text)]) {
      const matchString = p.matcher(input)

      // In JS mode, evaluating a non-existent group outputs literally
      expect(matchString.replaceFirst('$4')).toEqual('$4')
      expect(matchString.replaceFirst('$4', false)).toEqual('$4')
    }
  })

  it('raises error in java mode', () => {
    const p = RE2JS.compile('abc')

    const text = 'abc'
    for (let input of [MatcherInput.utf16(text), MatcherInput.utf8(text)]) {
      const matchString = p.matcher(input)
      expect(() => matchString.replaceFirst('$4', true)).toThrow(
        new RE2JSGroupException('n > number of groups: 4')
      )
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
    const re = RE2JS.compile(regexp)

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
    const p = RE2JS.compile(regexp)

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
      const p = RE2JS.compile(regexp)

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
      const p = RE2JS.compile(regexp)

      for (let input of [MatcherInput.utf16(text), MatcherInput.utf8(text)]) {
        const matchString = p.matcher(input)
        expect(matchString.find(start)).toBe(false)
      }
    }
  )
})

describe('invalid find', () => {
  it('raise error', () => {
    const p = RE2JS.compile('.*')

    const text = 'abcdef'
    for (let input of [MatcherInput.utf16(text), MatcherInput.utf8(text)]) {
      const matchString = p.matcher(input)
      expect(() => matchString.find(10)).toThrow(
        new RE2JSGroupException('start index out of bounds: 10')
      )
    }
  })
})

it('throws on null input reset', () => {
  expect(() => new Matcher(RE2JS.compile('pattern'), null)).toThrow(
    'Cannot read properties of null'
  )
})

it('throws on null input ctor', () => {
  expect(() => new Matcher(null, 'input')).toThrow('pattern is null')
})

describe('start end before find', () => {
  it('raise error', () => {
    const m = RE2JS.compile('a').matcher('abaca')
    expect(() => m.start()).toThrow(new RE2JSGroupException('perhaps no match attempted'))
  })
})

it('matches updates match information', () => {
  const m = RE2JS.compile('a+').matcher('aaa')
  expect(m.matches()).toBe(true)
  expect(m.group(0)).toEqual('aaa')
})

it('alternation matches', () => {
  const string = '123:foo'
  expect(RE2JS.compile('(?:\\w+|\\d+:foo)').matcher(string).matches()).toBe(true)
  expect(RE2JS.compile('(?:\\d+:foo|\\w+)').matcher(string).matches()).toBe(true)
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
    const p = RE2JS.compile('b(an)*(.)')
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
    const p = RE2JS.compile(
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

    expect(() => m.group('nonexistent')).toThrow(
      new RE2JSGroupException("group 'nonexistent' not found")
    )
  })

  it('another named', () => {
    const p = RE2JS.compile('(?P<baz>f+)(?P<bag>b+)?')
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
    const p = RE2JS.compile('(?P<baz>f{0,10})(?P<bag>b{0,10})')
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
  const m = RE2JS.compile('(\\d{2} ?(\\d|[a-z])?)($|[^a-zA-Z])').matcher('22 bored')
  expect(m.find()).toBe(true)
  expect(m.group(1)).toEqual('22')
})

it('pattern longest match', () => {
  const pattern = '(?:a+)|(?:a+ b+)'
  const text = 'xxx aaa bbb yyy'

  const matcher = RE2JS.compile(pattern).matcher(text)
  expect(matcher.find()).toBe(true)
  expect(text.substring(matcher.start(), matcher.end())).toEqual('aaa')

  const longMatcher = RE2JS.compile(pattern, RE2JS.LONGEST_MATCH).matcher(text)
  expect(longMatcher.find()).toBe(true)
  expect(longMatcher.substring(longMatcher.start(), longMatcher.end())).toEqual('aaa bbb')
})

describe('.quoteReplacement', () => {
  describe('default mode (javaMode = false, JS semantics)', () => {
    const cases = [
      ['', ''], // Empty string
      ['hello world', 'hello world'], // No special characters
      ['$1', '$$1'], // Single dollar sign
      ['\\', '\\'], // Backslash shouldn't be escaped in JS mode
      ['hello $1 \\ world', 'hello $$1 \\ world'], // Mixed characters
      ['$$', '$$$$'], // Multiple dollar signs
      ['\\\\', '\\\\'], // Multiple backslashes
      ['$name', '$$name'], // Named group reference
      ['$&', '$$&'], // Entire match reference
      ['$1$2$3', '$$1$$2$$3'], // Sequential references
      ['\\$1\\', '\\$$1\\'] // Mixed sequential
    ]

    test.concurrent.each(cases)('input %p expected %p', (input, expected) => {
      // Should default to JS mode if omitted
      expect(Matcher.quoteReplacement(input)).toEqual(expected)
      expect(Matcher.quoteReplacement(input, false)).toEqual(expected)
    })
  })

  describe('java mode (javaMode = true)', () => {
    const cases = [
      ['', ''], // Empty string
      ['hello world', 'hello world'], // No special characters
      ['$1', '\\$1'], // Single dollar sign
      ['\\', '\\\\'], // Single backslash
      ['hello $1 \\ world', 'hello \\$1 \\\\ world'], // Mixed characters
      ['$$', '\\$\\$'], // Multiple dollar signs
      ['\\\\', '\\\\\\\\'], // Multiple backslashes
      ['$name', '\\$name'], // Named group reference
      ['$&', '\\$&'], // Entire match reference
      ['$1$2$3', '\\$1\\$2\\$3'], // Sequential references
      ['\\$1\\', '\\\\\\$1\\\\'] // Mixed sequential
    ]

    test.concurrent.each(cases)('input %p expected %p', (input, expected) => {
      expect(Matcher.quoteReplacement(input, true)).toEqual(expected)
    })
  })
})

describe('Replacement String Injection Prevention', () => {
  it('should safely replace user input in default JS mode', () => {
    const maliciousUserInput = '$1' // Attempts to reference capture group 1
    const safeReplacement = Matcher.quoteReplacement(maliciousUserInput) // Defaults to false

    // Pattern captures "world" into group 1
    const matcher = RE2JS.compile('(world)').matcher('hello world')

    // If vulnerable, it would output "hello world" (evaluating $1)
    // If fixed, it outputs "hello $1" (treating $1 as a literal string via $$1)
    expect(matcher.replaceAll(safeReplacement)).toEqual('hello $1')
    expect(matcher.replaceAll(safeReplacement, false)).toEqual('hello $1')
  })

  it('should safely replace user input in Java mode', () => {
    const maliciousUserInput = '$1'
    const safeReplacement = Matcher.quoteReplacement(maliciousUserInput, true)

    const matcher = RE2JS.compile('(world)').matcher('hello world')

    // Must output "hello $1" exactly, treating it as a literal string via \$1
    expect(matcher.replaceAll(safeReplacement, true)).toEqual('hello $1')
  })
})
