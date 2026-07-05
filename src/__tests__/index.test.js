import { expect, describe, it } from 'vitest'
import { RE2JS, re } from '../index.js'
import { RE2Flags } from '../RE2Flags.js'
import { MatcherInput } from '../MatcherInput.js'
import { Utils } from '../Utils.js'
import { RE2JSGroupException } from '../exceptions.js'

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

describe('re tagged template literal', () => {
  const cases = [
    // Basic compilation without double escaping
    [() => re`\b\w+\b`, '\\b\\w+\\b', 0, 'hello world', true],
    [() => re`\d+\.\d+`, '\\d+\\.\\d+', 0, '3.14', true],
    [() => re`\\`, '\\\\', 0, '\\', true], // Edge case: explicit literal backslash

    // Interpolation
    [() => re`@${'example\\.com'}`, '@example\\.com', 0, 'user@example.com', true],
    [() => re`${'^'}foo${'\\d+'}`, '^foo\\d+', 0, 'foo123', true],

    // Flags via dual-signature function
    [() => re(RE2JS.CASE_INSENSITIVE)`^foo`, '^foo', RE2JS.CASE_INSENSITIVE, 'FOObar', true],
    [
      () => re(RE2JS.CASE_INSENSITIVE | RE2JS.MULTILINE)`^foo$`,
      '^foo$',
      RE2JS.CASE_INSENSITIVE | RE2JS.MULTILINE,
      'bar\nFOO\nbaz',
      true
    ],
    [() => re(RE2JS.DOTALL)`a.b`, 'a.b', RE2JS.DOTALL, 'a\nb', true],
    [() => re()`^foo`, '^foo', 0, 'foo', true],
    [() => re(void 0)`^foo`, '^foo', 0, 'foo', true]
  ]

  it.each(cases)(
    'evaluates template %# correctly: pattern %p',
    (getRegex, expectedPattern, expectedFlags, testString, expectedMatch) => {
      const regex = getRegex()
      expect(regex.pattern()).toEqual(expectedPattern)
      expect(regex.flags()).toEqual(expectedFlags)
      expect(regex.test(testString)).toEqual(expectedMatch)
    }
  )
})

describe('.translateRegExp', () => {
  it.each([
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
    ['[(?<foo>bar)]', '[(?<foo>bar)]'], // Named group syntax inside a char class should remain untouched
    ['[a-z\\]](?<foo>bar)', '[a-z\\]](?P<foo>bar)'], // Properly detects the end of the class despite escaped bracket
    ['\\[(?<foo>bar)', '\\[(?P<foo>bar)'], // Escaped opening bracket means we are NOT in a char class

    // Unclosed bounds fallback checks
    ['[abc(?<foo>bar)', '[abc(?<foo>bar)'], // Unclosed bracket assumes everything trailing is in a char class
    ['abc](?<foo>bar)', 'abc](?P<foo>bar)'], // Unopened closing bracket safely resets tracking flag
    ['(?<)', '(?<)'], // Too short to be a named capture

    // Complex combination (Checks \cM, \u degrading, strict \u 4-digit, and bracketed \u)
    ['a\\cM\\u34\\u1234\\u10abcdz', 'a\\x0Du34\\x{1234}\\x{10ab}cdz'],
    ['a\\cM\\u34\\u1234\\u{10abcd}z', 'a\\x0Du34\\x{1234}\\x{10abcd}z'],
    ['\\cM\\u1234\\n\\c1\\u1', '\\x0D\\x{1234}\\nc1u1'],

    ['\\x1G', 'x1G'], // Invalid hex length (non-hex character 'G')
    ['\\x', 'x'], // Dangling 'x' without any trailing characters
    ['\\x{', 'x{'], // Unclosed hex bracket

    // Out of bounds octal fallback
    ['\\8\\9', '89'], // '8' and '9' are not valid octal digits, JS degrades them to literals

    // Unassigned letters fallback
    ['\\e\\K\\h', 'eKh'], // e, K, and h are not valid regex escapes in RE2, JS degrades them to literals

    // Safely Preserved Valid RE2 Escapes (Whitelist check)
    ['\\d\\D\\s\\S\\w\\W', '\\d\\D\\s\\S\\w\\W'], // Standard character classes
    ['\\n\\r\\t\\a\\f\\v', '\\n\\r\\t\\a\\f\\v'], // Standard control escapes
    ['\\b\\B\\A\\z', '\\b\\B\\A\\z'], // Boundary assertions
    ['\\Q...\\E', '\\Q...\\E'], // Quote meta blocks
    ['\\0\\7', '\\0\\7'], // Valid octals

    // Escaped symbols are perfectly preserved
    ['\\.\\*\\[\\]\\\\', '\\.\\*\\[\\]\\\\'],

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
    ['\\u{', 'u{'], // Unclosed unicode bracket
    ['\\u{}', 'u{}'], // Empty unicode bracket
    ['\\u{12G}', 'u{12G}'], // Non-hexadecimal characters inside bracket
    ['\\u{10abcd}', '\\x{10abcd}'],
    ['\\u{1234}', '\\x{1234}'],

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
    ['(?<!a)b', '(?<!a)b'], // Negative lookbehind

    // native regex
    [/hello/, 'hello'],
    [/foo/i, '(?i)foo'],
    [/bar/ims, '(?ims)bar'],
    [/baz/giy, '(?i)baz'], // Ignores execution flags (g, y)
    [/\u0061/, '\\x{0061}'], // Auto-translates JS quirks embedded in RegExp
    [/\cM/i, '(?i)\\x0D'],
    [new RegExp(''), '(?:)'], // Empty RegExp
    [/(?:)/, '(?:)']
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

  it.each(cases)('regexp %p match %p and not match %p', (regexp, match, nonMatch) => {
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

  it.each(cases)(
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

  it.each(cases)('pattern %p with input %p will return %p', (pattern, input, expected) => {
    const re2 = RE2JS.compile(pattern)

    // Test UTF-16 String input
    expect(re2.test(input)).toEqual(expected)

    // Test UTF-8 Byte Array input
    const utf8Input = Utils.stringToUtf8ByteArray(input)
    expect(re2.test(utf8Input)).toEqual(expected)
  })
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

  it.each(cases)('pattern %p with input %p will return %p', (pattern, input, expected) => {
    const re2 = RE2JS.compile(pattern)

    // Test UTF-16 String input
    expect(re2.testExact(input)).toEqual(expected)

    // Test UTF-8 Byte Array input
    const utf8Input = Utils.stringToUtf8ByteArray(input)
    expect(re2.testExact(utf8Input)).toEqual(expected)
  })
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

  it.each(cases)(
    'regexp %p with flags %p find %p and not find %p',
    (regexp, flags, match, nonMatch) => {
      expect(RE2JS.compile(regexp, flags).matcher(match).find()).toBe(true)
      expect(RE2JS.compile(regexp, flags).matcher(nonMatch).find()).toBe(false)
    }
  )
})

describe('.exec()', () => {
  // [pattern, input, expectedMatchArray, expectedIndex, expectedGroups]
  const cases = [
    // No match
    ['foo', 'bar', null, null, null],
    // Basic match with a capture group
    ['b(a)r', 'foo bar baz', ['bar', 'a'], 4, void 0],
    // Unmatched optional capture group maps to `undefined` (JS Parity)
    ['a(b)?(c)', 'ac', ['ac', void 0, 'c'], 0, void 0],
    // Named capture groups populate the `groups` dictionary
    [
      '(?P<year>\\d{4})-(?P<month>\\d{2})',
      '2024-05',
      ['2024-05', '2024', '05'],
      0,
      { year: '2024', month: '05' }
    ],

    // Unmatched named capture groups map to `undefined` in the dictionary (JS Parity)
    [
      '(?P<first>\\w+) (?:(?P<middle>\\w+) )?(?P<last>\\w+)',
      'John Doe',
      ['John Doe', 'John', void 0, 'Doe'],
      0,
      { first: 'John', middle: void 0, last: 'Doe' }
    ],
    // Zero-width match at the beginning of a string
    ['^', 'abc', [''], 0, void 0],

    // Zero-width boundary match in the middle of a string
    ['\\b', ' abc', [''], 1, void 0],

    // Empty string input matching an empty pattern
    ['', '', [''], 0, void 0],

    // Deeply nested capture groups
    ['((a)(b))', 'ab', ['ab', 'ab', 'a', 'b'], 0, void 0],

    // Empty match ("") vs Non-participating group (undefined)
    // Group 1 (a*) matches 0 times, yielding "". Group 2 (c)? does not participate, yielding undefined.
    ['(a*)b(c)?', 'b', ['b', '', void 0], 0, void 0]
  ]

  it.each(cases)(
    'pattern %p with input %p returns expected exec result',
    (pattern, inputStr, expectedArray, expectedIndex, expectedGroups) => {
      const re2 = RE2JS.compile(pattern)
      const resultStr = re2.exec(inputStr)

      if (expectedArray === null) {
        expect(resultStr).toBeNull()
      } else {
        expect(resultStr).not.toBeNull()
        expect([...resultStr]).toEqual(expectedArray)
        expect(resultStr.index).toBe(expectedIndex)
        expect(resultStr.input).toBe(inputStr)
        expect(resultStr.groups).toEqual(expectedGroups)
      }

      const utf8Input = Utils.stringToUtf8ByteArray(inputStr)
      const resultUtf8 = re2.exec(utf8Input)

      if (expectedArray === null) {
        expect(resultUtf8).toBeNull()
      } else {
        expect(resultUtf8).not.toBeNull()
        expect([...resultUtf8]).toEqual(expectedArray)
        expect(resultUtf8.index).toBe(expectedIndex)
        // The .input property MUST retain the exact original Uint8Array/Array reference
        expect(resultUtf8.input).toBe(utf8Input)
        expect(resultUtf8.groups).toEqual(expectedGroups)
      }
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

  it.each(cases)('regexp %p split text %p to %p', (regexp, text, expected) => {
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

  it.each(cases)('regexp %p split text %p (limit %p) to %p', (regexp, text, limit, expected) => {
    expect(RE2JS.compile(regexp).split(text, limit)).toEqual(expected)
  })
})

describe('split edge cases', () => {
  it('handles splitting when input is fully matched and limit is 0', () => {
    // Standard JS RegExp parity check: "   ".split(/\s+/) returns [] when trailing empties are dropped
    const re2 = RE2JS.compile('\\s+')

    // Completely empty strings
    expect(re2.split('', 0)).toEqual([''])

    // Fully matched strings (should drop the trailing empty strings)
    expect(re2.split('   ', 0)).toEqual([])

    // Prefix matched
    expect(re2.split('   foo', 0)).toEqual(['', 'foo'])

    // Suffix matched
    expect(re2.split('foo   ', 0)).toEqual(['foo'])
  })
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

  it.each(cases)('pattern %p program size %p', (pattern, count) => {
    const p = RE2JS.compile(pattern)
    const programSize = p.programSize()

    expect(programSize).toEqual(count)
  })

  it('taken into account LOOKBEHINDS flag', () => {
    const p = RE2JS.compile('(?<=(?:a|aa)+)b', RE2JS.LOOKBEHINDS)
    expect(p.programSize()).toEqual(12)
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

  it.each(cases)('pattern %p have groups %p', (pattern, count) => {
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

  it.each(cases)('pattern %p named groups %p', (pattern, expected) => {
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

describe('.matchAll', () => {
  it('iterates over all matches and returns native-shaped arrays', () => {
    const re2 = RE2JS.compile('(?P<year>\\d{4})-(?P<month>\\d{2})')
    const input = 'Dates: 2024-05 and 2025-11.'

    const matches = [...re2.matchAll(input)]

    expect(matches.length).toBe(2)

    // First match
    expect(matches[0][0]).toBe('2024-05')
    expect(matches[0][1]).toBe('2024')
    expect(matches[0][2]).toBe('05')
    expect(matches[0].index).toBe(7)
    expect(matches[0].input).toBe(input)
    expect(matches[0].groups).toEqual({ year: '2024', month: '05' })

    // Second match
    expect(matches[1][0]).toBe('2025-11')
    expect(matches[1][1]).toBe('2025')
    expect(matches[1][2]).toBe('11')
    expect(matches[1].index).toBe(19)
    expect(matches[1].input).toBe(input)
    expect(matches[1].groups).toEqual({ year: '2025', month: '11' })
  })

  it('safely maps unmatched capture groups to undefined (JS Parity)', () => {
    // Group 2 (b) is optional
    const re2 = RE2JS.compile('(a)(b)?(c)')
    const input = 'ac abc'

    const matches = [...re2.matchAll(input)]
    expect(matches.length).toBe(2)

    // "ac" -> Group 2 is missing
    expect(matches[0][0]).toBe('ac')
    expect(matches[0][1]).toBe('a')
    expect(matches[0][2]).toBeUndefined() // Should be undefined, NOT null!
    expect(matches[0][3]).toBe('c')

    // "abc" -> Group 2 is present
    expect(matches[1][0]).toBe('abc')
    expect(matches[1][1]).toBe('a')
    expect(matches[1][2]).toBe('b')
    expect(matches[1][3]).toBe('c')
  })

  it('safely maps unmatched named capture groups to undefined (JS Parity)', () => {
    const re2 = RE2JS.compile('(?P<first>\\w+) (?:(?P<middle>\\w+) )?(?P<last>\\w+)')
    const input = 'John Doe, Jane Mary Smith'

    const matches = [...re2.matchAll(input)]
    expect(matches.length).toBe(2)

    // "John Doe" (No middle name)
    expect(matches[0].groups.first).toBe('John')
    expect(matches[0].groups.middle).toBeUndefined() // Should be undefined, NOT null!
    expect(matches[0].groups.last).toBe('Doe')

    // "Jane Mary Smith"
    expect(matches[1].groups.first).toBe('Jane')
    expect(matches[1].groups.middle).toBe('Mary')
    expect(matches[1].groups.last).toBe('Smith')
  })

  it('returns an empty iterator when no matches are found', () => {
    const re2 = RE2JS.compile('x')
    const matches = [...re2.matchAll('abc')]

    expect(matches.length).toBe(0)
  })

  it('does not leak state across multiple loops (Stateless Guarantee)', () => {
    const re2 = RE2JS.compile('\\d+')
    const input = '123 456'

    // Loop 1
    const matches1 = [...re2.matchAll(input)]
    expect(matches1.length).toBe(2)

    // Loop 2 (should perfectly restart, unlike native RegExp with /g where lastIndex persists)
    const matches2 = [...re2.matchAll(input)]
    expect(matches2.length).toBe(2)
  })

  it('supports UTF-8 byte array inputs', () => {
    const re2 = RE2JS.compile('\\w+')
    const utf8Input = Utils.stringToUtf8ByteArray('hello world')

    const matches = [...re2.matchAll(utf8Input)]

    expect(matches.length).toBe(2)
    expect(matches[0][0]).toBe('hello')
    expect(matches[1][0]).toBe('world')

    expect(matches[0].input).toBe(utf8Input)
  })

  it('returns accurate byte offsets and avoids desync for Uint8Array multibyte inputs', () => {
    // 'a' is what we are looking for.
    const re2 = RE2JS.compile('a')

    // '😊' is 4 bytes in UTF-8 (F0 9F 98 8A). 'a' is 1 byte (61).
    // In a UTF-16 string, 'a' sits at index 2.
    // In a UTF-8 byte array, 'a' sits at index 4.
    const utf8Input = new Uint8Array(Utils.stringToUtf8ByteArray('😊a'))

    const matches = [...re2.matchAll(utf8Input)]

    expect(matches.length).toBe(1)

    const match = matches[0]
    expect(match[0]).toBe('a')

    // The index must be the byte offset (4), not the string offset (2)!
    expect(match.index).toBe(4)

    // result.input must remain the raw byte array so developers
    // can safely slice it using the returned byte index.
    expect(match.input).toBe(utf8Input)

    // Prove that slicing the returned input with the returned index perfectly yields the match
    const slicedBytes = match.input.slice(match.index, match.index + 1)
    expect(Utils.utf8ByteArrayToString(slicedBytes)).toBe('a')
  })
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

  it.each(replaceAllCases)(
    'replaceAll: pattern %p with input %p and replacement %p will return %p',
    (pattern, input, replacement, expected) => {
      const re2 = RE2JS.compile(pattern)
      expect(re2.matcher(input).replaceAll(replacement)).toEqual(expected)
      // with java mode
      expect(re2.matcher(input).replaceAll(replacement, true)).toEqual(expected)
    }
  )

  it.each(replaceFirstCases)(
    'replaceFirst: pattern %p with input %p and replacement %p will return %p',
    (pattern, input, replacement, expected) => {
      const re2 = RE2JS.compile(pattern)
      expect(re2.matcher(input).replaceFirst(replacement)).toEqual(expected)
      // with java mode
      expect(re2.matcher(input).replaceFirst(replacement, true)).toEqual(expected)
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

    it.each(jsGroupCases)(
      'groups cases: pattern %p with input %p and replacement %p will return %p',
      (pattern, input, replacement, expected) => {
        const re2 = RE2JS.compile(pattern)
        // Verify default parses as JS mode
        expect(re2.matcher(input).replaceAll(replacement)).toEqual(expected)
        // Verify explicit JS mode
        expect(re2.matcher(input).replaceAll(replacement, false)).toEqual(expected)
      }
    )
  })

  describe('java mode and groups', () => {
    const javaGroupCases = [
      ['(\\w+) (\\w+)', 'Hello World', '$2 - $1', 'World - Hello'],
      ['(\\w+)', 'Hello World Dear Friend', '[$1]', '[Hello] [World] [Dear] [Friend]'],
      ['(\\w+) (\\w+)', 'Hello World', '$20 - $11', 'World0 - Hello1'],
      ['(\\w+) (\\w+)', 'Hello World', '$0 - $0', 'Hello World - Hello World'], // $0 is overall match in Java
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
      ]
    ]

    it.each(javaGroupCases)(
      'groups cases: pattern %p with input %p and replacement %p will return %p',
      (pattern, input, replacement, expected) => {
        const re2 = RE2JS.compile(pattern)
        // Verify explicit Java mode
        expect(re2.matcher(input).replaceAll(replacement, true)).toEqual(expected)
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

describe('replaceAll and replaceFirst using replacer function', () => {
  const cases = [
    // Test empty input and/or replacement,
    // with pattern that matches the empty string.
    ['', '', () => '', '', false],
    ['', '', () => 'x', 'x', false],
    ['', 'abc', () => '', 'abc', false],
    ['', 'abc', () => 'x', 'xaxbxcx', false],

    // Test empty input and/or replacement,
    // with pattern that does not match the empty string.
    ['b', '', () => '', '', false],
    ['b', '', () => 'x', '', false],
    ['b', 'abc', () => '', 'ac', false],
    ['b', 'abc', () => 'x', 'axc', false],
    ['y', '', () => '', '', false],
    ['y', '', () => 'x', '', false],
    ['y', 'abc', () => '', 'abc', false],
    ['y', 'abc', () => 'x', 'abc', false],

    // Multibyte characters
    ['[a-c]*', '\u65e5', () => 'x', 'x\u65e5x', false],
    ['[^\u65e5]', 'abc\u65e5def', () => 'x', 'xxx\u65e5xxx', false],

    ['a{2,10}', 'aabaaa', () => 'x', 'xbx', false],
    ['a{5,10}', 'aabaaaaa', () => 'x', 'aabx', false],

    // Start and end of a string.
    ['^[a-c]*', 'abcdabc', () => 'x', 'xdabc', false],
    ['[a-c]*$', 'abcdabc', () => 'x', 'abcdxx', false],
    ['^[a-c]*$', 'abcdabc', () => 'x', 'abcdabc', false],
    ['^[a-c]*', 'abc', () => 'x', 'x', false],
    ['[a-c]*$', 'abc', () => 'x', 'xx', false],
    ['^[a-c]*$', 'abc', () => 'x', 'x', false],
    ['^[a-c]*', 'dabce', () => 'x', 'xdabce', false],
    ['[a-c]*$', 'dabce', () => 'x', 'dabcex', false],
    ['^[a-c]*$', 'dabce', () => 'x', 'dabce', false],
    ['^[a-c]*', '', () => 'x', 'x', false],
    ['[a-c]*$', '', () => 'x', 'x', false],
    ['^[a-c]*$', '', () => 'x', 'x', false],
    ['^[a-c]+', 'abcdabc', () => 'x', 'xdabc', false],
    ['[a-c]+$', 'abcdabc', () => 'x', 'abcdx', false],
    ['^[a-c]+$', 'abcdabc', () => 'x', 'abcdabc', false],
    ['^[a-c]+', 'abc', () => 'x', 'x', false],
    ['[a-c]+$', 'abc', () => 'x', 'x', false],
    ['^[a-c]+$', 'abc', () => 'x', 'x', false],
    ['^[a-c]+', 'dabce', () => 'x', 'dabce', false],
    ['[a-c]+$', 'dabce', () => 'x', 'dabce', false],
    ['^[a-c]+$', 'dabce', () => 'x', 'dabce', false],
    ['^[a-c]+', '', () => 'x', '', false],
    ['[a-c]+$', '', () => 'x', '', false],
    ['^[a-c]+$', '', () => 'x', '', false],

    // Other cases.
    ['abc', 'abcdefg', () => 'def', 'defdefg', false],
    ['bc', 'abcbcdcdedef', () => 'BC', 'aBCBCdcdedef', false],
    ['abc', 'abcdabc', () => '', 'd', false],
    ['x', 'xxxXxxx', () => 'xXx', 'xXxxXxxXxXxXxxXxxXx', false],
    ['abc', '', () => 'd', '', false],
    ['abc', 'abc', () => 'd', 'd', false],
    ['.+', 'abc', () => 'x', 'x', false],
    ['[a-c]*', 'def', () => 'x', 'xdxexfx', false],
    ['[a-c]+', 'abcbcdcdedef', () => 'x', 'xdxdedef', false],
    ['[a-c]*', 'abcbcdcdedef', () => 'x', 'xxdxxdxexdxexfx', false],

    // Test empty input and/or replacement,
    // with pattern that matches the empty string.
    ['', '', () => '', '', true],
    ['', '', () => 'x', 'x', true],
    ['', 'abc', () => '', 'abc', true],
    ['', 'abc', () => 'x', 'xabc', true],

    // Test empty input and/or replacement,
    // with pattern that does not match the empty string.
    ['b', '', () => '', '', true],
    ['b', '', () => 'x', '', true],
    ['b', 'abc', () => '', 'ac', true],
    ['b', 'abc', () => 'x', 'axc', true],
    ['y', '', () => '', '', true],
    ['y', '', () => 'x', '', true],
    ['y', 'abc', () => '', 'abc', true],
    ['y', 'abc', () => 'x', 'abc', true],

    // Multibyte characters
    ['[a-c]*', '\u65e5', () => 'x', 'x\u65e5', true],
    ['[^\u65e5]', 'abc\u65e5def', () => 'x', 'xbc\u65e5def', true],

    // Start and end of a string.
    ['^[a-c]*', 'abcdabc', () => 'x', 'xdabc', true],
    ['[a-c]*$', 'abcdabc', () => 'x', 'abcdx', true],
    ['^[a-c]*$', 'abcdabc', () => 'x', 'abcdabc', true],
    ['^[a-c]*', 'abc', () => 'x', 'x', true],
    ['[a-c]*$', 'abc', () => 'x', 'x', true],
    ['^[a-c]*$', 'abc', () => 'x', 'x', true],
    ['^[a-c]*', 'dabce', () => 'x', 'xdabce', true],
    ['[a-c]*$', 'dabce', () => 'x', 'dabcex', true],
    ['^[a-c]*$', 'dabce', () => 'x', 'dabce', true],
    ['^[a-c]*', '', () => 'x', 'x', true],
    ['[a-c]*$', '', () => 'x', 'x', true],
    ['^[a-c]*$', '', () => 'x', 'x', true],
    ['^[a-c]+', 'abcdabc', () => 'x', 'xdabc', true],
    ['[a-c]+$', 'abcdabc', () => 'x', 'abcdx', true],
    ['^[a-c]+$', 'abcdabc', () => 'x', 'abcdabc', true],
    ['^[a-c]+', 'abc', () => 'x', 'x', true],
    ['[a-c]+$', 'abc', () => 'x', 'x', true],
    ['^[a-c]+$', 'abc', () => 'x', 'x', true],
    ['^[a-c]+', 'dabce', () => 'x', 'dabce', true],
    ['[a-c]+$', 'dabce', () => 'x', 'dabce', true],
    ['^[a-c]+$', 'dabce', () => 'x', 'dabce', true],
    ['^[a-c]+', '', () => 'x', '', true],
    ['[a-c]+$', '', () => 'x', '', true],
    ['^[a-c]+$', '', () => 'x', '', true],

    // Other cases.
    ['abc', 'abcdefg', () => 'def', 'defdefg', true],
    ['bc', 'abcbcdcdedef', () => 'BC', 'aBCbcdcdedef', true],
    ['abc', 'abcdabc', () => '', 'dabc', true],
    ['x', 'xxxXxxx', () => 'xXx', 'xXxxxXxxx', true],
    ['abc', '', () => 'd', '', true],
    ['abc', 'abc', () => 'd', 'd', true],
    ['.+', 'abc', () => 'x', 'x', true],
    ['[a-c]*', 'def', () => 'x', 'xdef', true],
    ['[a-c]+', 'abcbcdcdedef', () => 'x', 'xdcdedef', true],
    ['[a-c]*', 'abcbcdcdedef', () => 'x', 'xdcdedef', true],

    // --- Dynamic Match / Capture Group Cases ---

    // Replace dynamically using match
    ['[a-c]+', 'defabcdef', (m) => m.toUpperCase(), 'defABCdef', false],
    ['[a-c]+', 'abcbcdcdedef', (m) => m.toUpperCase(), 'ABCBCdcdedef', true],

    // Replace dynamically using capture groups (p1, p2)
    ['(\\w+) (\\w+)', 'hello world', (m, p1, p2) => `${p2} ${p1}`, 'world hello', false],
    ['(a)(b)', 'xabx', (m, p1, p2) => p2 + p1, 'xbax', false],

    // Utilizing offset and unmodified string references
    ['x', 'axbxc', (m, offset) => offset.toString(), 'a1b3c', false]
  ]

  it.each(cases)(
    'pattern %p with input %p and replacer fn will return %p (only first: %p)',
    (pattern, input, replacerFn, expected, replaceFirst) => {
      const re2 = RE2JS.compile(pattern)
      const m = re2.matcher(input)
      expect(replaceFirst ? m.replaceFirst(replacerFn) : m.replaceAll(replacerFn)).toEqual(expected)
    }
  )
})

it('does not re-evaluate characters inside named groups in JS mode', () => {
  const re2 = RE2JS.compile('(world)')
  const m = re2.matcher('hello world')

  // $<na$1> references a non-existent group 'na$1'.
  // In JS mode, it should output exactly 'hello $<na$1>'
  expect(m.replaceAll('$<na$1>')).toBe('hello $<na$1>')
})

it('does not re-evaluate characters inside malformed named groups in JS mode', () => {
  const re2 = RE2JS.compile('(world)')
  const m = re2.matcher('hello world')

  expect(m.replaceAll('$<na$1 ')).toBe('hello $<na$1 ')
})

it('unmatched named groups append empty string', () => {
  // Regex containing two named groups.
  // Matching 'foo' will leave the 'bar' group unmatched.
  const re2 = RE2JS.compile('(?P<foo>foo)|(?P<bar>bar)')

  // Test for both UTF-16 strings and UTF-8 Byte Array targets
  for (let input of [MatcherInput.utf16('foo'), MatcherInput.utf8('foo')]) {
    const mJs = re2.matcher(input)
    // JS Mode: $<bar> is unmatched, should be safely ignored
    expect(mJs.replaceFirst('$<foo>-$<bar>', false)).toBe('foo-')

    const mJava = re2.matcher(input)
    // Java Mode: ${bar} is unmatched, should be safely ignored
    expect(mJava.replaceAll('${foo}-${bar}', true)).toBe('foo-')
  }
})

it("supports $` (prefix) and $' (suffix) in JS replacement mode", () => {
  const re2 = RE2JS.compile('world')

  // Test for both UTF-16 strings and UTF-8 Byte Array targets
  for (let input of [
    MatcherInput.utf16('hello world today'),
    MatcherInput.utf8('hello world today')
  ]) {
    const mPrefix = re2.matcher(input)
    // $` should evaluate to the prefix: "hello "
    expect(mPrefix.replaceFirst('[$`]')).toBe('hello [hello ] today')

    const mSuffix = re2.matcher(input)
    // $' should evaluate to the suffix: " today"
    expect(mSuffix.replaceFirst("[$']")).toBe('hello [ today] today')
  }
})

it("safely evaluates $` and $' on zero-width boundary matches", () => {
  // Edge case: matching the exact beginning of the string (0 width)
  const re2 = RE2JS.compile('^')

  for (let input of [MatcherInput.utf16('abc'), MatcherInput.utf8('abc')]) {
    const m = re2.matcher(input)
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
  const re2 = RE2JS.compile('a', RE2JS.CASE_INSENSITIVE)

  expect(re2.testExact('')).toBe(false)
  expect(re2.test('')).toBe(false)
})

it('should correctly update execution flag after fast-forwarding pointer', () => {
  const re2 = RE2JS.compile('\\Bfoo')

  const m = re2.matcher('afoo')
  expect(m.find()).toBe(true)

  // Additional boundary validations
  const re2Second = RE2JS.compile('\\bfoo')
  expect(re2Second.matcher('a foo').find()).toBe(true)
  expect(re2Second.matcher('afoo').find()).toBe(false)
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

it('testExact should strictly match the end of the string in OnePass', () => {
  // The '^' assertion guarantees compilation into the OnePass DFA engine.
  // testExact() forces the ANCHOR_BOTH flag under the hood.
  const re2 = RE2JS.compile('^foo')

  expect(re2.testExact('foo')).toBe(true)
  // because 'foobar' has trailing characters
  expect(re2.testExact('foobar')).toBe(false)
})

it('matches() should fail if the string is not fully consumed', () => {
  // .matches() also forces ANCHOR_BOTH
  const re2 = RE2JS.compile('^hello')
  expect(re2.matches('hello')).toBe(true)
  expect(re2.matches('hello world')).toBe(false)
})

it('does not corrupt UTF-16 surrogate pairs when stepping past zero-width matches', () => {
  // A regex that guarantees a match at the start and end of the string
  const re2 = RE2JS.compile('^|$')
  const matcher = re2.matcher('😊') // Surrogate pair length 2

  expect(matcher.find()).toBe(true)
  expect(matcher.start()).toBe(0) // Matches at ^

  expect(matcher.find()).toBe(true)
  // Safely jumped over the 2-unit surrogate pair
  expect(matcher.start()).toBe(2)
})

it('does not catastrophically corrupt UTF-8 byte sequences', () => {
  const re2 = RE2JS.compile('^|$')
  // '日' is 3 bytes in UTF-8
  const utf8Input = Utils.stringToUtf8ByteArray('日')
  const matcher = re2.matcher(utf8Input)

  expect(matcher.find()).toBe(true)
  expect(matcher.start()).toBe(0)

  expect(matcher.find()).toBe(true)
  // Safely jumped over the 3-byte Kanji
  expect(matcher.start()).toBe(3)
})

it('safely evaluates Node Buffers and Uint8Arrays without crashing', () => {
  const re2 = RE2JS.compile('hello')

  // Uint8Array representing the UTF-8 bytes for "hello world"
  const u8 = new Uint8Array([104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100])

  // .test() Unanchored DFA/NFA
  expect(re2.test(u8)).toBe(true)

  // .testExact() Anchored DFA
  expect(re2.testExact(u8)).toBe(false)
  const exactU8 = new Uint8Array([104, 101, 108, 108, 111]) // "hello"
  expect(re2.testExact(exactU8)).toBe(true)

  // .matcher() extraction
  const m = re2.matcher(u8)
  expect(m.find()).toBe(true)
  expect(m.group(0)).toBe('hello')
})

it('case-insensitive regex correctly matches supplementary characters', () => {
  const re2 = RE2JS.compile('(?i)\\x{10400}')

  expect(re2.test(String.fromCodePoint(0x10428))).toBe(true)
})

it('respects bounded regions for zero-width end assertions ($)', () => {
  // Regex looks for "c" at the absolute end of the string ($)
  const re2 = RE2JS.compile('c$')

  // We evaluate against "abcdef", but strictly bound the execution region to "abc" (length 3).
  // Since "c" is at the end of "abc", it MUST match.

  // UTF-16 String evaluation
  const result16 = re2.re2Input.matchWithGroup('abcdef', 0, 3, RE2Flags.UNANCHORED, 0)
  expect(result16[0]).toBe(true)

  // UTF-8 Byte Array evaluation
  const utf8Input = Utils.stringToUtf8ByteArray('abcdef')
  const result8 = re2.re2Input.matchWithGroup(utf8Input, 0, 3, RE2Flags.UNANCHORED, 0)
  expect(result8[0]).toBe(true)
})

it('does not swallow ASCII characters following an invalid UTF-8 sequence', () => {
  // [0xE0, 0x41, 0x42] -> 0xE0 is an incomplete 3-byte sequence header.
  // It is immediately followed by 'A' (0x41) and 'B' (0x42).
  // The UTF-8 decoder must realize 0xE0 is invalid (because 0x41 is not a continuation byte),
  // safely consume only 1 unit for the bad byte, and proceed to read 'A' and 'B' normally.
  // Use '(A+)' instead of 'A' to disable the Literal Fast-Path
  const re2 = RE2JS.compile('(A+)')
  const utf8Input = [0xe0, 0x41, 0x42] // 0xE0, 'A', 'B'

  // because 'A' is clearly in the string and should be evaluated
  expect(re2.test(utf8Input)).toBe(true)
})

it('does not exceed V8 maximum call stack size on massive NFA state chains', () => {
  // Generate an extremely deep AST of ALTs and NOPs (10,000 deep).
  // We bypass the parser's 1000 repetition limit by chaining them:
  // "(?:a?){1000}(?:a?){1000}..." 10 times.
  const massiveChain = '(' + '(?:a?){1000}'.repeat(10) + 'b)'

  const re2 = RE2JS.compile(massiveChain)

  const nfaInput = 'a'.repeat(30) + 'b'
  // Evaluates safely and returns true
  expect(() => {
    const matcher = re2.matcher(nfaInput)
    matcher.find()
  }).not.toThrow()

  expect(re2.matcher(nfaInput).find()).toBe(true)
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

describe('Unicode Binary Properties', () => {
  it('correctly matches \\p{Emoji}', () => {
    const re2 = RE2JS.compile('^\\p{Emoji}+$')
    expect(re2.matches('😀🚀🎉')).toBe(true)
    expect(re2.matches('abc')).toBe(false)
  })

  it('correctly matches negated \\P{Emoji}', () => {
    const re2 = RE2JS.compile('^\\P{Emoji}+$')
    expect(re2.matches('abc')).toBe(true)
    expect(re2.matches('😀')).toBe(false)
  })

  it('correctly matches \\p{White_Space}', () => {
    const re2 = RE2JS.compile('^\\p{White_Space}+$')
    // Matches standard spaces, tabs, and newlines
    expect(re2.matches(' \t\n\r')).toBe(true)
    expect(re2.matches('a')).toBe(false)
  })

  it('correctly folds case for Binary Properties if applicable', () => {
    // ASCII_Hex_Digit is a true binary property
    const re2 = RE2JS.compile('^\\p{ASCII_Hex_Digit}+$', RE2JS.CASE_INSENSITIVE)
    expect(re2.matches('abcdef')).toBe(true)
    expect(re2.matches('ABCDEF')).toBe(true)
  })
})

describe('NFA Fast-Forwarding and Context Preservation', () => {
  it('correctly recalculates flag contexts when fast-forwarding past lookbehinds', () => {
    // The prefix is "bar". The engine will use indexOf("bar") to jump.
    // It MUST verify the lookbehind "foo " and the boundaries \b on BOTH sides.
    const re2 = RE2JS.compile('(?<=foo )\\bbar\\b', RE2JS.LOOKBEHINDS)

    // "bar" appears 3 times:
    // 1. "bar" - missing "foo " lookbehind
    // 2. "foo barx" - lookbehind matches, but \b fails on the right.
    // 3. "foo bar" - lookbehind matches, \b matches both sides.
    const input = 'bar foo barx foo bar'

    const m = re2.matcher(input)
    expect(m.find()).toBe(true)

    // It should have safely skipped the first two invalid "bar"s
    // and matched the 3rd one perfectly at index 17.
    expect(m.start()).toBe(17)
  })
})

describe('Machine Pooling and Reentrancy', () => {
  it('safely allocates multiple Machine instances for recursive or nested matching', () => {
    const re2 = RE2JS.compile('a(b+)c')
    const input = 'abbc abbbc'

    const m = re2.matcher(input)
    let matches = 0

    m.replaceAll(() => {
      matches++
      // Inside the replacer, we fire up another match using the SAME regex.
      // This forces the RE2 engine to allocate a second Machine from the Treiber stack
      // because the first Machine is currently frozen in the outer .replaceAll loop!
      expect(re2.test('abbc')).toBe(true)
      return 'x'
    })

    expect(matches).toBe(2)
  })
})
