import { RE2JS } from '../index'
import { RE2Flags } from '../RE2Flags'
import { MatcherInput } from '../MatcherInput'
import { Utils } from '../Utils'
import { RE2JSGroupException } from '../exceptions'
import { expect, describe, test } from '@jest/globals'

it('compile', () => {
  const p = RE2JS.compile('abc')
  expect(p.pattern()).toEqual('abc')
  expect(p.flags()).toEqual(0)
})

it('compile exception with duplicate groups', () => {
  expect(() => RE2JS.compile('(?P<any>.*)(?P<any>.*')).toThrow(
    'error parsing regexp: duplicate capture group name: `any`'
  )
})

describe('.translateRegExp', () => {
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
  ])('#translateRegExp(%p) === %p', (input, expected) => {
    expect(RE2JS.translateRegExp(input)).toEqual(expected)
  })
})

it('.toString', () => {
  expect(RE2JS.compile('abc').toString()).toEqual('abc')
})

it('compile flags', () => {
  const p = RE2JS.compile('abc', 5)
  expect(p.pattern()).toEqual('abc')
  expect(p.flags()).toEqual(5)
})

it('syntax error', () => {
  const compile = () => RE2JS.compile('abc(')
  expect(compile).toThrow('error parsing regexp: missing closing ): `abc(`')

  let error = null
  try {
    compile()
  } catch (e) {
    error = e
  }

  expect(error).not.toBeNull()
  expect(error.getDescription()).toEqual('missing closing )')
  expect(error.message).toEqual('error parsing regexp: missing closing ): `abc(`')
  expect(error.getPattern()).toEqual('abc(')
})

describe('matches no flags', () => {
  const source = String.fromCodePoint(110781)
  const cases = [
    ['ab+c', 'abbbc', 'cbbba'],
    ['ab.*c', 'abxyzc', 'ab\nxyzc'],
    ['^ab.*c$', 'abc', 'xyz\nabc\ndef'],
    // Test quoted codepoints that require a surrogate pair
    [source, source, 'blah'],
    [`\\Q${source}\\E`, source, 'blah']
  ]

  test.concurrent.each(cases)('regexp %p match %p and not match %p', (regexp, match, nonMatch) => {
    expect(RE2JS.matches(regexp, match)).toBe(true)
    expect(RE2JS.matches(regexp, nonMatch)).toBe(false)
    expect(RE2JS.matches(regexp, Utils.stringToUtf8ByteArray(match))).toBe(true)
    expect(RE2JS.matches(regexp, Utils.stringToUtf8ByteArray(nonMatch))).toBe(false)
  })
})

describe('matches with flags', () => {
  const cases = [
    ['ab+c', 0, 'abbbc', 'cbba'],
    ['ab+c', RE2JS.CASE_INSENSITIVE, 'abBBc', 'cbbba'],
    ['ab.*c', 0, 'abxyzc', 'ab\nxyzc'],
    ['ab.*c', RE2JS.DOTALL, 'ab\nxyzc', 'aB\nxyzC'],
    ['ab.*c', RE2JS.DOTALL | RE2JS.CASE_INSENSITIVE, 'aB\nxyzC', 'z'],
    ['^ab.*c$', 0, 'abc', 'xyz\nabc\ndef'],
    ['^ab.*c$', RE2JS.MULTILINE, 'abc', 'xyz\nabc\ndef'],
    ['^ab.*c$', RE2JS.MULTILINE, 'abc', ''],
    ['^ab.*c$', RE2JS.DOTALL | RE2JS.MULTILINE, 'ab\nc', 'AB\nc'],
    ['^ab.*c$', RE2JS.DOTALL | RE2JS.MULTILINE | RE2JS.CASE_INSENSITIVE, 'AB\nc', 'z']
  ]

  test.concurrent.each(cases)(
    'regexp %p with flags %p match %p and not match %p',
    (regexp, flags, match, nonMatch) => {
      const p = RE2JS.compile(regexp, flags)

      expect(p.matches(match)).toBe(true)
      expect(p.matches(Utils.stringToUtf8ByteArray(match))).toBe(true)
      expect(p.matches(nonMatch)).toBe(false)
      expect(p.matches(Utils.stringToUtf8ByteArray(nonMatch))).toBe(false)
    }
  )
})

describe('.test (Unanchored DFA Match)', () => {
  const cases = [
    // [pattern, input, expected]
    ['foo', 'foo', true],
    ['foo', 'a foo b', true], // Unanchored: matches in the middle
    ['foo', 'bar', false],
    ['(?i)foo', 'FoO', true], // Case insensitive
    ['^[a-z]+$', 'hello', true], // Explicitly anchored in pattern
    ['^[a-z]+$', 'hello 123', false],
    ['enters.*battlefield', 'When this creature enters the battlefield, it deals 3 damage', true],
    ['[0-9]+ mana', 'Add 1 mana of any color', true]
  ]

  test.concurrent.each(cases)(
    'pattern %p with input %p will return %p',
    (pattern, input, expected) => {
      const re = RE2JS.compile(pattern)

      // Test UTF-16 String input
      expect(re.test(input)).toEqual(expected)

      // Test UTF-8 Byte Array input
      const utf8Input = Utils.stringToUtf8ByteArray(input)
      expect(re.test(utf8Input)).toEqual(expected)
    }
  )
})

describe('.testExact (Anchored DFA Match)', () => {
  const cases = [
    // [pattern, input, expected]
    ['foo', 'foo', true],
    ['foo', 'a foo b', false], // Anchored: fails if not exact match
    ['foo', 'foobar', false], // Anchored: fails if trailing characters
    ['[a-z]+', 'hello', true],
    ['[a-z]+', 'hello 123', false], // Anchored: fails due to space and numbers
    ['(?i)foo', 'FOO', true], // Case insensitive
    ['[0-9A-Fa-f]+', '1A4F', true],
    ['[0-9A-Fa-f]+', '1A4F-xyz', false]
  ]

  test.concurrent.each(cases)(
    'pattern %p with input %p will return %p',
    (pattern, input, expected) => {
      const re = RE2JS.compile(pattern)

      // Test UTF-16 String input
      expect(re.testExact(input)).toEqual(expected)

      // Test UTF-8 Byte Array input
      const utf8Input = Utils.stringToUtf8ByteArray(input)
      expect(re.testExact(utf8Input)).toEqual(expected)
    }
  )
})

describe('find', () => {
  const cases = [
    ['ab+c', 0, 'xxabbbc', 'cbbba'],
    ['ab+c', RE2JS.CASE_INSENSITIVE, 'abBBc', 'cbbba'],
    ['ab.*c', 0, 'xxabxyzc', 'ab\nxyzc'],
    ['ab.*c', RE2JS.DOTALL, 'ab\nxyzc', 'aB\nxyzC'],
    ['ab.*c', RE2JS.DOTALL | RE2JS.CASE_INSENSITIVE, 'xaB\nxyzCz', 'z'],
    ['^ab.*c$', 0, 'abc', 'xyz\nabc\ndef'],
    ['^ab.*c$', RE2JS.MULTILINE, 'xyz\nabc\ndef', 'xyz\nab\nc\ndef'],
    ['^ab.*c$', RE2JS.DOTALL | RE2JS.MULTILINE, 'xyz\nab\nc\ndef', 'xyz\nAB\nc\ndef'],
    ['^ab.*c$', RE2JS.DOTALL | RE2JS.MULTILINE | RE2JS.CASE_INSENSITIVE, 'xyz\nAB\nc\ndef', 'z']
  ]

  test.concurrent.each(cases)(
    'regexp %p with flags %p find %p and not find %p',
    (regexp, flags, match, nonMatch) => {
      expect(RE2JS.compile(regexp, flags).matcher(match).find()).toBe(true)
      expect(RE2JS.compile(regexp, flags).matcher(nonMatch).find()).toBe(false)
    }
  )
})

describe('split', () => {
  const cases = [
    ['/', 'abcde', ['abcde']],
    ['/', 'a/b/cc//d/e//', ['a', 'b', 'cc', '', 'd', 'e']],

    ['o', 'boo:and:foo', ['b', '', ':and:f']],

    ['x*', 'foo', ['f', 'o', 'o']],
    [':', ':a::b', ['', 'a', '', 'b']]
  ]

  test.concurrent.each(cases)('regexp %p split text %p to %p', (regexp, text, expected) => {
    expect(RE2JS.compile(regexp).split(text, 0)).toEqual(expected)
  })
})

describe('split with limit', () => {
  const s = 'boo:and:foo'
  const cases = [
    ['/', 'a/b/cc//d/e//', 3, ['a', 'b', 'cc//d/e//']],
    ['/', 'a/b/cc//d/e//', 4, ['a', 'b', 'cc', '/d/e//']],
    ['/', 'a/b/cc//d/e//', 5, ['a', 'b', 'cc', '', 'd/e//']],
    ['/', 'a/b/cc//d/e//', 6, ['a', 'b', 'cc', '', 'd', 'e//']],
    ['/', 'a/b/cc//d/e//', 7, ['a', 'b', 'cc', '', 'd', 'e', '/']],
    ['/', 'a/b/cc//d/e//', 8, ['a', 'b', 'cc', '', 'd', 'e', '', '']],
    ['/', 'a/b/cc//d/e//', 9, ['a', 'b', 'cc', '', 'd', 'e', '', '']],

    [':', s, 2, ['boo', 'and:foo']],
    [':', s, 5, ['boo', 'and', 'foo']],
    [':', s, -2, ['boo', 'and', 'foo']],
    ['o', s, 5, ['b', '', ':and:f', '', '']],
    ['o', s, -2, ['b', '', ':and:f', '', '']],
    ['o', s, 0, ['b', '', ':and:f']],

    ['x*', 'foo', 1, ['foo']],
    ['x*', 'f', 2, ['f', '']]
  ]

  test.concurrent.each(cases)(
    'regexp %p split text %p (limit %p) to %p',
    (regexp, text, limit, expected) => {
      expect(RE2JS.compile(regexp).split(text, limit)).toEqual(expected)
    }
  )
})

describe('program size', () => {
  const cases = [
    ['', 3],
    ['a', 3],
    ['^', 3],
    ['^$', 4],
    ['a+b', 5],
    ['a+b?', 6],
    ['(a+b)', 7],
    ['a+b.*', 7],
    ['(a+b?)', 8],
    ['(a+b?)(a+b?)', 14]
  ]

  test.concurrent.each(cases)('pattern %p program size %p', (pattern, count) => {
    const p = RE2JS.compile(pattern)
    const programSize = p.programSize()

    expect(programSize).toEqual(count)
  })

  test('taken into account LOOKBEHINDS flag', () => {
    const p = RE2JS.compile('(?<=(a|aa)+)b', RE2JS.LOOKBEHINDS)
    expect(p.programSize()).toEqual(14)
  })
})

describe('group count', () => {
  const cases = [
    ['(.*)ab(.*)a', 2],
    ['(.*)(ab)(.*)a', 3],
    ['(.*)((a)b)(.*)a', 4],
    ['(.*)(\\(ab)(.*)a', 3],
    ['(.*)(\\(a\\)b)(.*)a', 3]
  ]

  test.concurrent.each(cases)('pattern %p have groups %p', (pattern, count) => {
    const p = RE2JS.compile(pattern)
    const m1 = p.matcher('x')
    const m2 = p.matcher(Utils.stringToUtf8ByteArray('x'))

    expect(p.groupCount()).toEqual(count)
    expect(m1.groupCount()).toEqual(count)
    expect(m2.groupCount()).toEqual(count)
  })
})

describe('named groups', () => {
  const cases = [
    ['(?P<foo>\\d{2})', { foo: 1 }],
    ['\\d{2}', {}],
    ['hello', {}],
    ['(.*)', {}],
    ['(?P<any>.*)', { any: 1 }],
    ['(?P<foo>.*)(?P<bar>.*)', { foo: 1, bar: 2 }]
  ]

  test.concurrent.each(cases)('pattern %p named groups %p', (pattern, expected) => {
    expect(RE2JS.compile(pattern).namedGroups()).toEqual(expected)
  })

  it('factoring of common prefixes in alternations', () => {
    const p1 = RE2JS.compile('(a.*?c)|a.*?b')
    const p2 = RE2JS.compile('a.*?c|a.*?b')

    const m1 = p1.matcher('abc')
    m1.find()
    const m2 = p2.matcher('abc')
    m2.find()

    expect(m2.group()).toEqual(m1.group())
  })
})

it('quote', () => {
  const regexp = RE2JS.quote('ab+c')
  const match = 'ab+c'
  const nonMatch = 'abc'

  expect(RE2JS.matches(regexp, match)).toBe(true)
  expect(RE2JS.matches(regexp, nonMatch)).toBe(false)
  expect(RE2JS.matches(regexp, Utils.stringToUtf8ByteArray(match))).toBe(true)
  expect(RE2JS.matches(regexp, Utils.stringToUtf8ByteArray(nonMatch))).toBe(false)
})

describe('replaceAll and replaceFirst', () => {
  const replaceAllCases = [
    // Test empty input and/or replacement,
    // with pattern that matches the empty string.
    ['', '', '', ''],
    ['', '', 'x', 'x'],
    ['', 'abc', '', 'abc'],
    ['', 'abc', 'x', 'xaxbxcx'],

    // Test empty input and/or replacement,
    // with pattern that does not match the empty string.
    ['b', '', '', ''],
    ['b', '', 'x', ''],
    ['b', 'abc', '', 'ac'],
    ['b', 'abc', 'x', 'axc'],
    ['y', '', '', ''],
    ['y', '', 'x', ''],
    ['y', 'abc', '', 'abc'],
    ['y', 'abc', 'x', 'abc'],

    // Multibyte characters -- verify that we don't try to match in the middle
    // of a character.
    ['[a-c]*', '\u65e5', 'x', 'x\u65e5x'],
    ['[^\u65e5]', 'abc\u65e5def', 'x', 'xxx\u65e5xxx'],

    ['a{2,10}', 'aabaaa', 'x', 'xbx'],
    ['a{5,10}', 'aabaaaaa', 'x', 'aabx'],

    // Start and end of a string.
    ['^[a-c]*', 'abcdabc', 'x', 'xdabc'],
    ['[a-c]*$', 'abcdabc', 'x', 'abcdxx'],
    ['^[a-c]*$', 'abcdabc', 'x', 'abcdabc'],
    ['^[a-c]*', 'abc', 'x', 'x'],
    ['[a-c]*$', 'abc', 'x', 'xx'],
    ['^[a-c]*$', 'abc', 'x', 'x'],
    ['^[a-c]*', 'dabce', 'x', 'xdabce'],
    ['[a-c]*$', 'dabce', 'x', 'dabcex'],
    ['^[a-c]*$', 'dabce', 'x', 'dabce'],
    ['^[a-c]*', '', 'x', 'x'],
    ['[a-c]*$', '', 'x', 'x'],
    ['^[a-c]*$', '', 'x', 'x'],
    ['^[a-c]+', 'abcdabc', 'x', 'xdabc'],
    ['[a-c]+$', 'abcdabc', 'x', 'abcdx'],
    ['^[a-c]+$', 'abcdabc', 'x', 'abcdabc'],
    ['^[a-c]+', 'abc', 'x', 'x'],
    ['[a-c]+$', 'abc', 'x', 'x'],
    ['^[a-c]+$', 'abc', 'x', 'x'],
    ['^[a-c]+', 'dabce', 'x', 'dabce'],
    ['[a-c]+$', 'dabce', 'x', 'dabce'],
    ['^[a-c]+$', 'dabce', 'x', 'dabce'],
    ['^[a-c]+', '', 'x', ''],
    ['[a-c]+$', '', 'x', ''],
    ['^[a-c]+$', '', 'x', ''],

    // Other cases.
    ['abc', 'abcdefg', 'def', 'defdefg'],
    ['bc', 'abcbcdcdedef', 'BC', 'aBCBCdcdedef'],
    ['abc', 'abcdabc', '', 'd'],
    ['x', 'xxxXxxx', 'xXx', 'xXxxXxxXxXxXxxXxxXx'],
    ['abc', '', 'd', ''],
    ['abc', 'abc', 'd', 'd'],
    ['.+', 'abc', 'x', 'x'],
    ['[a-c]*', 'def', 'x', 'xdxexfx'],
    ['[a-c]+', 'abcbcdcdedef', 'x', 'xdxdedef']
  ]

  const replaceFirstCases = [
    // Test empty input and/or replacement,
    // with pattern that matches the empty string.
    ['', '', '', ''],
    ['', '', 'x', 'x'],
    ['', 'abc', '', 'abc'],
    ['', 'abc', 'x', 'xabc'],

    // Test empty input and/or replacement,
    // with pattern that does not match the empty string.
    ['b', '', '', ''],
    ['b', '', 'x', ''],
    ['b', 'abc', '', 'ac'],
    ['b', 'abc', 'x', 'axc'],
    ['y', '', '', ''],
    ['y', '', 'x', ''],
    ['y', 'abc', '', 'abc'],
    ['y', 'abc', 'x', 'abc'],

    // Multibyte characters -- verify that we don't try to match in the middle
    // of a character.
    ['[a-c]*', '\u65e5', 'x', 'x\u65e5'],
    ['[^\u65e5]', 'abc\u65e5def', 'x', 'xbc\u65e5def'],

    // Start and end of a string.
    ['^[a-c]*', 'abcdabc', 'x', 'xdabc'],
    ['[a-c]*$', 'abcdabc', 'x', 'abcdx'],
    ['^[a-c]*$', 'abcdabc', 'x', 'abcdabc'],
    ['^[a-c]*', 'abc', 'x', 'x'],
    ['[a-c]*$', 'abc', 'x', 'x'],
    ['^[a-c]*$', 'abc', 'x', 'x'],
    ['^[a-c]*', 'dabce', 'x', 'xdabce'],
    ['[a-c]*$', 'dabce', 'x', 'dabcex'],
    ['^[a-c]*$', 'dabce', 'x', 'dabce'],
    ['^[a-c]*', '', 'x', 'x'],
    ['[a-c]*$', '', 'x', 'x'],
    ['^[a-c]*$', '', 'x', 'x'],
    ['^[a-c]+', 'abcdabc', 'x', 'xdabc'],
    ['[a-c]+$', 'abcdabc', 'x', 'abcdx'],
    ['^[a-c]+$', 'abcdabc', 'x', 'abcdabc'],
    ['^[a-c]+', 'abc', 'x', 'x'],
    ['[a-c]+$', 'abc', 'x', 'x'],
    ['^[a-c]+$', 'abc', 'x', 'x'],
    ['^[a-c]+', 'dabce', 'x', 'dabce'],
    ['[a-c]+$', 'dabce', 'x', 'dabce'],
    ['^[a-c]+$', 'dabce', 'x', 'dabce'],
    ['^[a-c]+', '', 'x', ''],
    ['[a-c]+$', '', 'x', ''],
    ['^[a-c]+$', '', 'x', ''],

    // Other cases.
    ['abc', 'abcdefg', 'def', 'defdefg'],
    ['bc', 'abcbcdcdedef', 'BC', 'aBCbcdcdedef'],
    ['abc', 'abcdabc', '', 'dabc'],
    ['x', 'xxxXxxx', 'xXx', 'xXxxxXxxx'],
    ['abc', '', 'd', ''],
    ['abc', 'abc', 'd', 'd'],
    ['.+', 'abc', 'x', 'x'],
    ['[a-c]*', 'def', 'x', 'xdef'],
    ['[a-c]+', 'abcbcdcdedef', 'x', 'xdcdedef']
  ]

  test.concurrent.each(replaceAllCases)(
    'replaceAll: pattern %p with input %p and replacement %p will return %p',
    (pattern, input, replacement, expected) => {
      const re = RE2JS.compile(pattern)
      expect(re.matcher(input).replaceAll(replacement)).toEqual(expected)
      // with java mode
      expect(re.matcher(input).replaceAll(replacement, true)).toEqual(expected)
    }
  )

  test.concurrent.each(replaceFirstCases)(
    'replaceFirst: pattern %p with input %p and replacement %p will return %p',
    (pattern, input, replacement, expected) => {
      const re = RE2JS.compile(pattern)
      expect(re.matcher(input).replaceFirst(replacement)).toEqual(expected)
      // with java mode
      expect(re.matcher(input).replaceFirst(replacement, true)).toEqual(expected)
    }
  )

  describe('default mode (JS semantics) and groups', () => {
    const jsGroupCases = [
      ['(\\w+) (\\w+)', 'Hello World', '$2 - $1', 'World - Hello'],
      ['(\\w+) (\\w+)', 'Hello World', '$5', '$5'], // JS mode leaves unmatched groups as literal string
      ['(\\w+)', 'Hello World Dear Friend', '[$1]', '[Hello] [World] [Dear] [Friend]'],
      ['(\\w+) (\\w+)', 'Hello World', '$20 - $11', 'World0 - Hello1'],
      ['(\\w+) (\\w+)', 'Hello World', '$0 - $0', '$0 - $0'], // $0 doesn't mean overall match in JS
      ['(\\w+) (\\w+)', 'Hello World', '$$0 - $$0', '$0 - $0'], // $$ escapes to $
      ['(\\w+) (\\w+)', 'Hello World', '$& - $&', 'Hello World - Hello World'], // $& is overall match in JS
      ['(\\w+)', 'Hello World Dear Friend', '[\\$1]', '[\\Hello] [\\World] [\\Dear] [\\Friend]'], // \ is literal
      ['(\\w+)', 'Hello World Dear Friend', '[$$1]', '[$1] [$1] [$1] [$1]'],
      [
        '(?P<name>[a-zA-Z0-9._%+-]+)@(?P<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
        'max.power@example.com',
        '${name} - user; ${domain} - domain',
        '${name} - user; ${domain} - domain' // Java's ${name} is not evaluated
      ],
      [
        '(?P<name>[a-zA-Z0-9._%+-]+)@(?P<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
        'max.power@example.com',
        '$<name> - user; $<domain> - domain', // JS uses $<name>
        'max.power - user; example.com - domain'
      ],
      [
        '(?P<name>[a-zA-Z0-9._%+-]+)@(?P<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
        'max.power@example.com',
        '$$<name> - user; $$<domain> - domain',
        '$<name> - user; $<domain> - domain'
      ],
      [
        '(?P<name>[a-zA-Z0-9._%+-]+)@(?P<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
        'max.power@example.com',
        '$<name - user',
        '$<name - user'
      ],
      [
        '(?P<name>[a-zA-Z0-9._%+-]+)@(?P<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
        'max.power@example.com',
        '$<name - $<domain> - $domain>',
        '$<name - example.com - $domain>'
      ],
      [
        '(?P<name>[a-zA-Z0-9._%+-]+)@(?P<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
        'max.power@example.com',
        '$<undefined> - $<domain> - $<void>',
        '$<undefined> - example.com - $<void>'
      ]
    ]

    test.concurrent.each(jsGroupCases)(
      'groups cases: pattern %p with input %p and replacement %p will return %p',
      (pattern, input, replacement, expected) => {
        const re = RE2JS.compile(pattern)
        // Verify default parses as JS mode
        expect(re.matcher(input).replaceAll(replacement)).toEqual(expected)
        // Verify explicit JS mode
        expect(re.matcher(input).replaceAll(replacement, false)).toEqual(expected)
      }
    )
  })

  describe('java mode and groups', () => {
    const javaGroupCases = [
      ['(\\w+) (\\w+)', 'Hello World', '$2 - $1', 'World - Hello'],
      ['(\\w+)', 'Hello World Dear Friend', '[$1]', '[Hello] [World] [Dear] [Friend]'],
      ['(\\w+) (\\w+)', 'Hello World', '$20 - $11', 'World0 - Hello1'],
      ['(\\w+) (\\w+)', 'Hello World', '$0 - $0', 'Hello World - Hello World'], // $0 is overall match in Java
      ['(\\w+) (\\w+)', 'Hello World', '$$0 - $$0', '$Hello World - $Hello World'],
      ['(\\w+) (\\w+)', 'Hello World', '$& - $&', '$& - $&'], // $& is not evaluated
      ['(\\w+)', 'Hello World Dear Friend', '[\\$1]', '[$1] [$1] [$1] [$1]'], // \$ escapes the dollar
      [
        '(?P<name>[a-zA-Z0-9._%+-]+)@(?P<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
        'max.power@example.com',
        '${name} - user; ${domain} - domain', // Java uses ${name}
        'max.power - user; example.com - domain'
      ],
      [
        '(?P<name>[a-zA-Z0-9._%+-]+)@(?P<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
        'max.power@example.com',
        '\\${name} - user; \\${domain} - domain',
        '${name} - user; ${domain} - domain'
      ],
      [
        '(?P<name>[a-zA-Z0-9._%+-]+)@(?P<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
        'max.power@example.com',
        '$<name> - user; $<domain> - domain',
        '$<name> - user; $<domain> - domain' // JS's $<name> is not evaluated
      ]
    ]

    test.concurrent.each(javaGroupCases)(
      'groups cases: pattern %p with input %p and replacement %p will return %p',
      (pattern, input, replacement, expected) => {
        const re = RE2JS.compile(pattern)
        // Verify explicit Java mode
        expect(re.matcher(input).replaceAll(replacement, true)).toEqual(expected)
      }
    )

    it('throws on invalid groups', () => {
      expect(() =>
        RE2JS.compile('(\\w+) (\\w+)').matcher('Hello World').replaceAll('$5', true)
      ).toThrow(new RE2JSGroupException('n > number of groups: 5'))
      expect(() =>
        RE2JS.compile('(?P<name>[a-zA-Z0-9._%+-]+)')
          .matcher('Hello World')
          .replaceAll('${test}', true)
      ).toThrow(new RE2JSGroupException("group 'test' not found"))
      expect(() =>
        RE2JS.compile('(?P<name>[a-zA-Z0-9._%+-]+)')
          .matcher('Hello World')
          .replaceAll('${test', true)
      ).toThrow(new RE2JSGroupException("named capture group is missing trailing '}'"))
    })
  })
})

test('does not re-evaluate characters inside named groups in JS mode', () => {
  const re = RE2JS.compile('(world)')
  const m = re.matcher('hello world')

  // $<na$1> references a non-existent group 'na$1'.
  // In JS mode, it should output exactly 'hello $<na$1>'
  expect(m.replaceAll('$<na$1>')).toBe('hello $<na$1>')
})

test('does not re-evaluate characters inside malformed named groups in JS mode', () => {
  const re = RE2JS.compile('(world)')
  const m = re.matcher('hello world')

  expect(m.replaceAll('$<na$1 ')).toBe('hello $<na$1 ')
})

test('unmatched named groups append empty string', () => {
  // Regex containing two named groups.
  // Matching 'foo' will leave the 'bar' group unmatched.
  const re = RE2JS.compile('(?P<foo>foo)|(?P<bar>bar)')

  // Test for both UTF-16 strings and UTF-8 Byte Array targets
  for (let input of [MatcherInput.utf16('foo'), MatcherInput.utf8('foo')]) {
    const mJs = re.matcher(input)
    // JS Mode: $<bar> is unmatched, should be safely ignored
    expect(mJs.replaceFirst('$<foo>-$<bar>', false)).toBe('foo-')

    const mJava = re.matcher(input)
    // Java Mode: ${bar} is unmatched, should be safely ignored
    expect(mJava.replaceAll('${foo}-${bar}', true)).toBe('foo-')
  }
})

test("supports $` (prefix) and $' (suffix) in JS replacement mode", () => {
  const re = RE2JS.compile('world')

  // Test for both UTF-16 strings and UTF-8 Byte Array targets
  for (let input of [
    MatcherInput.utf16('hello world today'),
    MatcherInput.utf8('hello world today')
  ]) {
    const mPrefix = re.matcher(input)
    // $` should evaluate to the prefix: "hello "
    expect(mPrefix.replaceFirst('[$`]')).toBe('hello [hello ] today')

    const mSuffix = re.matcher(input)
    // $' should evaluate to the suffix: " today"
    expect(mSuffix.replaceFirst("[$']")).toBe('hello [ today] today')
  }
})

test("safely evaluates $` and $' on zero-width boundary matches", () => {
  // Edge case: matching the exact beginning of the string (0 width)
  const re = RE2JS.compile('^')

  for (let input of [MatcherInput.utf16('abc'), MatcherInput.utf8('abc')]) {
    const m = re.matcher(input)
    // $` is empty prefix, $' is full suffix "abc"
    expect(m.replaceFirst("[$`|$']")).toBe('[|abc]abc')
  }
})

it('equals', () => {
  const pattern1 = RE2JS.compile('abc')
  const pattern2 = RE2JS.compile('abc')
  const pattern3 = RE2JS.compile('def')
  const pattern4 = RE2JS.compile('abc', RE2JS.CASE_INSENSITIVE)

  expect(pattern1).toEqual(pattern2)
  expect(pattern1).not.toEqual(pattern3)
  expect(pattern1).not.toEqual(pattern4)
})

it('email regex', () => {
  const p = RE2JS.compile('[\\w\\.]+@[\\w\\.]+')
  expect(p.matches('test@example.com')).toBe(true)
  expect(p.matches('test')).toBe(false)
})

it('date regex', () => {
  const p = RE2JS.compile('([0-9]{4})-?(1[0-2]|0[1-9])-?(3[01]|0[1-9]|[12][0-9])')
  expect(p.matches('2023-10-12')).toBe(true)
  expect(p.matches('2023-02-02')).toBe(true)
  expect(p.matches('300')).toBe(false)

  expect(p.matches('example 2023-02-02 date')).toBe(false)

  const m = p.matcher('example 2023-02-02 date')
  expect(m.find()).toBe(true)
  expect(m.group()).toEqual('2023-02-02')
})

it('should not match EOF when FOLD_CASE is enabled', () => {
  const re = RE2JS.compile('a', RE2JS.CASE_INSENSITIVE)

  expect(re.testExact('')).toBe(false)
  expect(re.test('')).toBe(false)
})

it('should correctly update execution flag after fast-forwarding pointer', () => {
  const re = RE2JS.compile('\\Bfoo')

  const m = re.matcher('afoo')
  expect(m.find()).toBe(true)

  // Additional boundary validations
  const re2 = RE2JS.compile('\\bfoo')
  expect(re2.matcher('a foo').find()).toBe(true)
  expect(re2.matcher('afoo').find()).toBe(false)
})

it('evaluates boundary conditions properly when fast-forwarding (NFA Fallback)', () => {
  // We MUST use a string longer than Backtracker.maxBitStateLen to force the NFA engine.
  // For a simple regex, maxBitStateLen is ~43,000. 90,000 guarantees NFA execution.
  const longString = 'a'.repeat(90000) + 'foo'

  // Without the fix, the stale flag at pos=0 (BOF to 'a' -> WORD_BOUNDARY) is preserved.
  // True context at 90000 ('a' to 'f') is NO_WORD_BOUNDARY.

  // \b demands WORD_BOUNDARY. Stale flag has it, so it FALSELY MATCHES.
  const re1 = RE2JS.compile('\\bfoo')
  expect(re1.matcher(longString).find()).toBe(false)

  // \B demands NO_WORD_BOUNDARY. Stale flag lacks it, so it FALSELY FAILS.
  const re2 = RE2JS.compile('\\Bfoo')
  expect(re2.matcher(longString).find()).toBe(true)
})

test('testExact should strictly match the end of the string in OnePass', () => {
  // The '^' assertion guarantees compilation into the OnePass DFA engine.
  // testExact() forces the ANCHOR_BOTH flag under the hood.
  const re = RE2JS.compile('^foo')

  expect(re.testExact('foo')).toBe(true)
  // because 'foobar' has trailing characters
  expect(re.testExact('foobar')).toBe(false)
})

test('matches() should fail if the string is not fully consumed', () => {
  // .matches() also forces ANCHOR_BOTH
  const re = RE2JS.compile('^hello')
  expect(re.matches('hello')).toBe(true)
  expect(re.matches('hello world')).toBe(false)
})

test('does not corrupt UTF-16 surrogate pairs when stepping past zero-width matches', () => {
  // A regex that guarantees a match at the start and end of the string
  const re = RE2JS.compile('^|$')
  const matcher = re.matcher('😊') // Surrogate pair length 2

  expect(matcher.find()).toBe(true)
  expect(matcher.start()).toBe(0) // Matches at ^

  expect(matcher.find()).toBe(true)
  // Safely jumped over the 2-unit surrogate pair
  expect(matcher.start()).toBe(2)
})

test('does not catastrophically corrupt UTF-8 byte sequences', () => {
  const re = RE2JS.compile('^|$')
  // '日' is 3 bytes in UTF-8
  const utf8Input = Utils.stringToUtf8ByteArray('日')
  const matcher = re.matcher(utf8Input)

  expect(matcher.find()).toBe(true)
  expect(matcher.start()).toBe(0)

  expect(matcher.find()).toBe(true)
  // Safely jumped over the 3-byte Kanji
  expect(matcher.start()).toBe(3)
})

test('safely evaluates Node Buffers and Uint8Arrays without crashing', () => {
  const re = RE2JS.compile('hello')

  // Uint8Array representing the UTF-8 bytes for "hello world"
  const u8 = new Uint8Array([104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100])

  // .test() Unanchored DFA/NFA
  expect(re.test(u8)).toBe(true)

  // .testExact() Anchored DFA
  expect(re.testExact(u8)).toBe(false)
  const exactU8 = new Uint8Array([104, 101, 108, 108, 111]) // "hello"
  expect(re.testExact(exactU8)).toBe(true)

  // .matcher() extraction
  const m = re.matcher(u8)
  expect(m.find()).toBe(true)
  expect(m.group(0)).toBe('hello')
})

test('case-insensitive regex correctly matches supplementary characters', () => {
  const re = RE2JS.compile('(?i)\\x{10400}')

  expect(re.test(String.fromCodePoint(0x10428))).toBe(true)
})

test('respects bounded regions for zero-width end assertions ($)', () => {
  // Regex looks for "c" at the absolute end of the string ($)
  const re = RE2JS.compile('c$')

  // We evaluate against "abcdef", but strictly bound the execution region to "abc" (length 3).
  // Since "c" is at the end of "abc", it MUST match.

  // UTF-16 String evaluation
  const result16 = re.re2Input.matchWithGroup('abcdef', 0, 3, RE2Flags.UNANCHORED, 0)
  expect(result16[0]).toBe(true)

  // UTF-8 Byte Array evaluation
  const utf8Input = Utils.stringToUtf8ByteArray('abcdef')
  const result8 = re.re2Input.matchWithGroup(utf8Input, 0, 3, RE2Flags.UNANCHORED, 0)
  expect(result8[0]).toBe(true)
})

test('does not swallow ASCII characters following an invalid UTF-8 sequence', () => {
  // [0xE0, 0x41, 0x42] -> 0xE0 is an incomplete 3-byte sequence header.
  // It is immediately followed by 'A' (0x41) and 'B' (0x42).
  // The UTF-8 decoder must realize 0xE0 is invalid (because 0x41 is not a continuation byte),
  // safely consume only 1 unit for the bad byte, and proceed to read 'A' and 'B' normally.
  // Use '(A+)' instead of 'A' to disable the Literal Fast-Path
  const re = RE2JS.compile('(A+)')
  const utf8Input = [0xe0, 0x41, 0x42] // 0xE0, 'A', 'B'

  // because 'A' is clearly in the string and should be evaluated
  expect(re.test(utf8Input)).toBe(true)
})

test('does not exceed V8 maximum call stack size on massive NFA state chains', () => {
  // Generate an extremely deep AST of ALTs and NOPs (10,000 deep).
  // We bypass the parser's 1000 repetition limit by chaining them:
  // "(?:a?){1000}(?:a?){1000}..." 10 times.
  const massiveChain = '(' + '(?:a?){1000}'.repeat(10) + 'b)'

  const re = RE2JS.compile(massiveChain)

  const nfaInput = 'a'.repeat(30) + 'b'
  // Evaluates safely and returns true
  expect(() => {
    const matcher = re.matcher(nfaInput)
    matcher.find()
  }).not.toThrow()

  expect(re.matcher(nfaInput).find()).toBe(true)
})

describe('.quoteReplacement', () => {
  it('delegates to Matcher.quoteReplacement', () => {
    // Default mode (JS semantics)
    expect(RE2JS.quoteReplacement('$1')).toEqual('$$1')
    expect(RE2JS.quoteReplacement('$1', false)).toEqual('$$1')
    expect(RE2JS.quoteReplacement('\\')).toEqual('\\')
    expect(RE2JS.quoteReplacement('foo$bar\\baz')).toEqual('foo$$bar\\baz')

    // Java mode
    expect(RE2JS.quoteReplacement('$1', true)).toEqual('\\$1')
    expect(RE2JS.quoteReplacement('\\', true)).toEqual('\\\\')
    expect(RE2JS.quoteReplacement('foo$bar\\baz', true)).toEqual('foo\\$bar\\\\baz')
  })
})

describe('Core Unicode Properties (Ascii, Assigned, Lc)', () => {
  it('compiles without error', () => {
    expect(() => RE2JS.compile('\\p{Ascii}')).not.toThrow()
    expect(() => RE2JS.compile('\\p{Assigned}')).not.toThrow()
    expect(() => RE2JS.compile('\\p{Lc}')).not.toThrow()
  })

  it('matches \\p{Ascii} correctly', () => {
    const p = RE2JS.compile('^\\p{Ascii}+$')

    // Standard ASCII
    expect(p.matches('abc123!@#\x7F')).toBe(true)

    // Contains non-ASCII (Emoji)
    expect(p.matches('abc😊')).toBe(false)
  })

  it('matches \\p{Lc} (Cased Letters) correctly', () => {
    const p = RE2JS.compile('^\\p{Lc}+$')

    // All cased letters
    expect(p.matches('aBcDeFéÜ')).toBe(true)

    // Contains a digit (not a letter)
    expect(p.matches('aBcDeF1')).toBe(false)

    // Contains a space
    expect(p.matches('aBcDeF ')).toBe(false)
  })

  it('matches \\p{Assigned} correctly (Inverse of Cn)', () => {
    const p = RE2JS.compile('^\\p{Assigned}+$')

    // Most standard strings are assigned characters
    expect(p.matches('abc123!@#😊')).toBe(true)

    // U+0378 is a permanently unassigned character in the Greek block (Cn category)
    const unassignedChar = String.fromCodePoint(0x0378)
    expect(p.matches(unassignedChar)).toBe(false)
  })
})
