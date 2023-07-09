import { RE2JS } from '../index'
import { expect, describe, test } from '@jest/globals'

describe('.match', () => {
  const cases = [
    ['a+', 'aaaa', true],
    ['a*', 'aaaa', true],
    ['a{4}', 'aaaa', true],
    ['a{1}', 'aaaa', false],
    ['[abc]+', 'abccba', true],
    ['[ac]', 'b', false],
    ['a{0,}', 'aa', true],
    ['^ab.*c$', 'ab\nc', false],
    ['[[:ascii:]]+', 'abcdef', true],
    ['(?i)hello', 'Hello', true]
  ]

  test.concurrent.each(cases)('regex %p with input %p, returns %p', (regex, input, expected) => {
    expect(RE2JS.compile(regex).match(input)).toEqual(expected)
  })

  describe('with flags', () => {
    const flagsCases = [
      ['ab+c', RE2JS.CASE_INSENSITIVE, 'abBBc', true],
      ['ab+c', RE2JS.CASE_INSENSITIVE, 'cbbba', false],
      ['^ab.*c$', RE2JS.DOTALL | RE2JS.MULTILINE, 'ab\nc', true]
    ]

    test.concurrent.each(flagsCases)(
      'regex %p with flags %p and input %p, returns %p',
      (regex, flags, input, expected) => {
        expect(RE2JS.compile(regex, flags).match(input)).toEqual(expected)
      }
    )
  })
})

describe('.extract', () => {
  const cases = [
    ['a+', 'aaaa1111', 'aaaa'],
    ['a*', 'aaaa1111', 'aaaa'],
    ['a{4}', 'aaaa1111', 'aaaa'],
    ['a{1}', 'aaaa', 'a'],
    ['b{1}', 'aaaa', null]
  ]

  test.concurrent.each(cases)('regex %p with input %p, returns %p', (regex, input, expected) => {
    expect(RE2JS.compile(regex).extract(input)).toEqual(expected)
  })

  describe('with flags', () => {
    const flagsCases = [
      ['ab+c', RE2JS.CASE_INSENSITIVE, 'abBBc', 'abBBc'],
      ['ab+c', RE2JS.CASE_INSENSITIVE, 'cbbba', null]
    ]

    test.concurrent.each(flagsCases)(
      'regex %p with flags %p and input %p, returns %p',
      (regex, flags, input, expected) => {
        expect(RE2JS.compile(regex, flags).extract(input)).toEqual(expected)
      }
    )
  })
})

describe('.replaceAll', () => {
  const cases = [
    ['a+', 'aaaa1111', 'bb', 'bb1111'],
    ['a*', 'aaaa1111', 'bb', 'bbbb1bb1bb1bb1bb'],
    ['a{4}', 'aaaa1111', 'bb', 'bb1111'],
    ['a{4}', 'aaaaaaaa1111', 'bb', 'bbbb1111'],
    ['a{1}', 'aaaa', 'b', 'bbbb'],
    ['b{1}', 'aaaa', 'c', 'aaaa']
  ]

  test.concurrent.each(cases)(
    'regex %p with input %p and replace %p, returns %p',
    (regex, input, replace, expected) => {
      expect(RE2JS.compile(regex).replaceAll(input, replace)).toEqual(expected)
    }
  )

  describe('with flags', () => {
    const flagsCases = [
      ['ab+c', RE2JS.CASE_INSENSITIVE, 'abBBc', '11', '11'],
      ['ab+c', RE2JS.CASE_INSENSITIVE, 'cbbba', '11', 'cbbba']
    ]

    test.concurrent.each(flagsCases)(
      'regex %p with input %p and replace %p, returns %p',
      (regex, flags, input, replace, expected) => {
        expect(RE2JS.compile(regex, flags).replaceAll(input, replace)).toEqual(expected)
      }
    )
  })
})

describe('.replaceFirst', () => {
  const cases = [
    ['a+', 'aaaa1111', 'bb', 'bb1111'],
    ['a*', 'aaaa1111', 'bb', 'bb1111'],
    ['a{4}', 'aaaaaaaa1111', 'bb', 'bbaaaa1111'],
    ['a{1}', 'aaaa', 'b', 'baaa'],
    ['b{1}', 'aaaa', 'c', 'aaaa']
  ]

  test.concurrent.each(cases)(
    'regex %p with input %p and replace %p, returns %p',
    (regex, input, replace, expected) => {
      expect(RE2JS.compile(regex).replaceFirst(input, replace)).toEqual(expected)
    }
  )

  describe('with flags', () => {
    const flagsCases = [
      ['ab+c', RE2JS.CASE_INSENSITIVE, 'abBBcabBBc', '11', '11abBBc'],
      ['ab+c', RE2JS.CASE_INSENSITIVE, 'cbbbacbbba', '11', 'cbbbacbbba']
    ]

    test.concurrent.each(flagsCases)(
      'regex %p with input %p and replace %p, returns %p',
      (regex, flags, input, replace, expected) => {
        expect(RE2JS.compile(regex, flags).replaceFirst(input, replace)).toEqual(expected)
      }
    )
  })
})
