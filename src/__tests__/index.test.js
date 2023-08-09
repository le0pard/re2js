import { RE2JS } from '../index'
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
      // with perl mode
      expect(re.matcher(input).replaceAll(replacement, true)).toEqual(expected)
    }
  )

  test.concurrent.each(replaceFirstCases)(
    'replaceFirst: pattern %p with input %p and replacement %p will return %p',
    (pattern, input, replacement, expected) => {
      const re = RE2JS.compile(pattern)
      expect(re.matcher(input).replaceFirst(replacement)).toEqual(expected)
      // with perl mode
      expect(re.matcher(input).replaceFirst(replacement, true)).toEqual(expected)
    }
  )

  describe('default mode and groups', () => {
    const defaultGroupCases = [
      ['(\\w+) (\\w+)', 'Hello World', '$2 - $1', 'World - Hello'],
      ['(\\w+)', 'Hello World Dear Friend', '[$1]', '[Hello] [World] [Dear] [Friend]'],
      ['(\\w+) (\\w+)', 'Hello World', '$20 - $11', 'World0 - Hello1'],
      ['(\\w+) (\\w+)', 'Hello World', '$0 - $0', 'Hello World - Hello World'],
      ['(\\w+) (\\w+)', 'Hello World', '$$0 - $$0', '$Hello World - $Hello World'],
      ['(\\w+) (\\w+)', 'Hello World', '$& - $&', '$& - $&'],
      ['(\\w+)', 'Hello World Dear Friend', '[\\$1]', '[$1] [$1] [$1] [$1]'],
      ['(\\w+)', 'Hello World Dear Friend', '[$$1]', '[$Hello] [$World] [$Dear] [$Friend]'],
      [
        '(?P<name>[a-zA-Z0-9._%+-]+)@(?P<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
        'max.power@example.com',
        '${name} - user; ${domain} - domain',
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
        '$<name> - user; $<domain> - domain'
      ]
    ]

    test.concurrent.each(defaultGroupCases)(
      'groups cases: pattern %p with input %p and replacement %p will return %p',
      (pattern, input, replacement, expected) => {
        const re = RE2JS.compile(pattern)
        expect(re.matcher(input).replaceAll(replacement)).toEqual(expected)
      }
    )

    it('throws on invalid groups', () => {
      expect(() => RE2JS.compile('(\\w+) (\\w+)').matcher('Hello World').replaceAll('$5')).toThrow(
        new RE2JSGroupException('n > number of groups: 5')
      )
      expect(() =>
        RE2JS.compile('(?P<name>[a-zA-Z0-9._%+-]+)').matcher('Hello World').replaceAll('${test}')
      ).toThrow(new RE2JSGroupException("group 'test' not found"))
      expect(() =>
        RE2JS.compile('(?P<name>[a-zA-Z0-9._%+-]+)').matcher('Hello World').replaceAll('${test')
      ).toThrow(new RE2JSGroupException("named capture group is missing trailing '}'"))
    })
  })

  describe('perl mode and groups', () => {
    const perlGroupCases = [
      ['(\\w+) (\\w+)', 'Hello World', '$2 - $1', 'World - Hello'],
      ['(\\w+) (\\w+)', 'Hello World', '$5', '$5'],
      ['(\\w+)', 'Hello World Dear Friend', '[$1]', '[Hello] [World] [Dear] [Friend]'],
      ['(\\w+) (\\w+)', 'Hello World', '$20 - $11', 'World0 - Hello1'],
      ['(\\w+) (\\w+)', 'Hello World', '$0 - $0', '$0 - $0'],
      ['(\\w+) (\\w+)', 'Hello World', '$& - $&', 'Hello World - Hello World'],
      ['(\\w+)', 'Hello World Dear Friend', '[\\$1]', '[\\Hello] [\\World] [\\Dear] [\\Friend]'],
      ['(\\w+)', 'Hello World Dear Friend', '[$$1]', '[$1] [$1] [$1] [$1]'],
      [
        '(?P<name>[a-zA-Z0-9._%+-]+)@(?P<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
        'max.power@example.com',
        '${name} - user; ${domain} - domain',
        '${name} - user; ${domain} - domain'
      ],
      [
        '(?P<name>[a-zA-Z0-9._%+-]+)@(?P<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
        'max.power@example.com',
        '$<name> - user; $<domain> - domain',
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

    test.concurrent.each(perlGroupCases)(
      'groups cases: pattern %p with input %p and replacement %p will return %p',
      (pattern, input, replacement, expected) => {
        const re = RE2JS.compile(pattern)
        expect(re.matcher(input).replaceAll(replacement, true)).toEqual(expected)
      }
    )
  })
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
