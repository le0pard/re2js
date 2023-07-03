import { expect, describe, test } from '@jest/globals'
import { Pattern } from '../Pattern'
import { Utils } from '../Utils'

it('compile', () => {
  const p = Pattern.compile('abc')
  expect(p.pattern()).toEqual('abc')
  expect(p.flags()).toEqual(0)
})

it('compile exception with duplicate groups', () => {
  expect(() => Pattern.compile('(?P<any>.*)(?P<any>.*')).toThrow(
    'error parsing regexp: duplicate capture group name: `any`'
  )
})

it('.toString', () => {
  expect(Pattern.compile('abc').toString()).toEqual('abc')
})

it('compile flags', () => {
  const p = Pattern.compile('abc', 5)
  expect(p.pattern()).toEqual('abc')
  expect(p.flags()).toEqual(5)
})

it('syntax error', () => {
  const compile = () => Pattern.compile('abc(')
  expect(compile).toThrow('error parsing regexp: missing closing ): `abc(`')

  let error = null
  try {
    compile()
  } catch (e) {
    error = e
  }
  expect(error).not.toBeNull()
  expect(error.getIndex()).toEqual(-1)
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
    expect(Pattern.matches(regexp, match)).toBe(true)
    expect(Pattern.matches(regexp, nonMatch)).toBe(false)
    expect(Pattern.matches(regexp, Utils.stringToUtf8ByteArray(match))).toBe(true)
    expect(Pattern.matches(regexp, Utils.stringToUtf8ByteArray(nonMatch))).toBe(false)
  })
})

describe('matches with flags', () => {
  const cases = [
    ['ab+c', 0, 'abbbc', 'cbba'],
    ['ab+c', Pattern.CASE_INSENSITIVE, 'abBBc', 'cbbba'],
    ['ab.*c', 0, 'abxyzc', 'ab\nxyzc'],
    ['ab.*c', Pattern.DOTALL, 'ab\nxyzc', 'aB\nxyzC'],
    ['ab.*c', Pattern.DOTALL | Pattern.CASE_INSENSITIVE, 'aB\nxyzC', 'z'],
    ['^ab.*c$', 0, 'abc', 'xyz\nabc\ndef'],
    ['^ab.*c$', Pattern.MULTILINE, 'abc', 'xyz\nabc\ndef'],
    ['^ab.*c$', Pattern.MULTILINE, 'abc', ''],
    ['^ab.*c$', Pattern.DOTALL | Pattern.MULTILINE, 'ab\nc', 'AB\nc'],
    ['^ab.*c$', Pattern.DOTALL | Pattern.MULTILINE | Pattern.CASE_INSENSITIVE, 'AB\nc', 'z']
  ]

  test.concurrent.each(cases)(
    'regexp %p with flags %p match %p and not match %p',
    (regexp, flags, match, nonMatch) => {
      const p = Pattern.compile(regexp, flags)

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
    ['ab+c', Pattern.CASE_INSENSITIVE, 'abBBc', 'cbbba'],
    ['ab.*c', 0, 'xxabxyzc', 'ab\nxyzc'],
    ['ab.*c', Pattern.DOTALL, 'ab\nxyzc', 'aB\nxyzC'],
    ['ab.*c', Pattern.DOTALL | Pattern.CASE_INSENSITIVE, 'xaB\nxyzCz', 'z'],
    ['^ab.*c$', 0, 'abc', 'xyz\nabc\ndef'],
    ['^ab.*c$', Pattern.MULTILINE, 'xyz\nabc\ndef', 'xyz\nab\nc\ndef'],
    ['^ab.*c$', Pattern.DOTALL | Pattern.MULTILINE, 'xyz\nab\nc\ndef', 'xyz\nAB\nc\ndef'],
    [
      '^ab.*c$',
      Pattern.DOTALL | Pattern.MULTILINE | Pattern.CASE_INSENSITIVE,
      'xyz\nAB\nc\ndef',
      'z'
    ]
  ]

  test.concurrent.each(cases)(
    'regexp %p with flags %p find %p and not find %p',
    (regexp, flags, match, nonMatch) => {
      expect(Pattern.compile(regexp, flags).matcher(match).find()).toBe(true)
      expect(Pattern.compile(regexp, flags).matcher(nonMatch).find()).toBe(false)
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
    expect(Pattern.compile(regexp).split(text, 0)).toEqual(expected)
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
      expect(Pattern.compile(regexp).split(text, limit)).toEqual(expected)
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
    const p = Pattern.compile(pattern)
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
    expect(Pattern.compile(pattern).namedGroups()).toEqual(expected)
  })

  it('factoring of common prefixes in alternations', () => {
    const p1 = Pattern.compile('(a.*?c)|a.*?b')
    const p2 = Pattern.compile('a.*?c|a.*?b')

    const m1 = p1.matcher('abc')
    m1.find()
    const m2 = p2.matcher('abc')
    m2.find()

    expect(m2.group()).toEqual(m1.group())
  })
})

it('quote', () => {
  const regexp = Pattern.quote('ab+c')
  const match = 'ab+c'
  const nonMatch = 'abc'

  expect(Pattern.matches(regexp, match)).toBe(true)
  expect(Pattern.matches(regexp, nonMatch)).toBe(false)
  expect(Pattern.matches(regexp, Utils.stringToUtf8ByteArray(match))).toBe(true)
  expect(Pattern.matches(regexp, Utils.stringToUtf8ByteArray(nonMatch))).toBe(false)
})

// TODO: fix me
it('equals', () => {
  const pattern1 = Pattern.compile('abc')
  const pattern2 = Pattern.compile('abc')
  const pattern3 = Pattern.compile('def')
  const pattern4 = Pattern.compile('abc', Pattern.CASE_INSENSITIVE)

  expect(pattern1).toEqual(pattern2)
  // expect(pattern1.hashCode()).toEqual(pattern2.hashCode())
  expect(pattern1).not.toEqual(pattern3)
  expect(pattern1).not.toEqual(pattern4)
})
