import { expect, describe, test } from '@jest/globals'
import { RE2JS, Flags } from '../index'

describe('.match', () => {
  const cases = [
    ['a+', 'aaaa', true],
    ['a*', 'aaaa', true],
    ['a{4}', 'aaaa', true],
    ['a{1}', 'aaaa', false]
    // ['(?i)a{2}', 'AA', true]
  ]

  test.each(cases)('regex %p with input %p, returns %p', (regex, input, expected) => {
    expect(RE2JS.compile(regex).match(input)).toEqual(expected)
  })

  describe.skip('with flags', () => {
    const flagsCases = [
      ['ab+c', Flags.CASE_INSENSITIVE, 'abBBc', true],
      ['ab+c', Flags.CASE_INSENSITIVE, 'cbbba', true],
      ['^ab.*c$', Flags.DOTALL | Flags.MULTILINE, 'ab\nc', true]
    ]

    test.each(flagsCases)('regex %p with flags %p and input %p, returns %p', (regex, flags, input, expected) => {
      expect(RE2JS.compile(regex, flags).match(input)).toEqual(expected)
    })
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

  test.each(cases)('regex %p with input %p, returns %p', (regex, input, expected) => {
    expect(RE2JS.compile(regex).extract(input)).toEqual(expected)
  })

  describe.skip('with flags', () => {
    const flagsCases = [
      ['ab+c', Flags.CASE_INSENSITIVE, 'abBBc', 'abBBc'],
      ['ab+c', Flags.CASE_INSENSITIVE, 'cbbba', null]
    ]

    test.each(flagsCases)('regex %p with flags %p and input %p, returns %p', (regex, flags, input, expected) => {
      expect(RE2JS.compile(regex, flags).extract(input)).toEqual(expected)
    })
  })
})

describe('.replace', () => {
  const cases = [
    ['a+', 'aaaa1111', 'bb', 'bb1111'],
    ['a*', 'aaaa1111', 'bb', 'bbbb1bb1bb1bb1bb'],
    ['a{4}', 'aaaa1111', 'bb', 'bb1111'],
    ['a{1}', 'aaaa', 'b', 'bbbb'],
    ['b{1}', 'aaaa', 'c', 'aaaa']
  ]

  test.each(cases)('regex %p with input %p and replace %p, returns %p', (regex, input, replace, expected) => {
    expect(RE2JS.compile(regex).replace(input, replace)).toEqual(expected)
  })

  describe.skip('with flags', () => {
    const flagsCases = [
      ['ab+c', Flags.CASE_INSENSITIVE, 'abBBc', '11', '11'],
      ['ab+c', Flags.CASE_INSENSITIVE, 'cbbba', '11', 'cbbba']
    ]

    test.each(flagsCases)('regex %p with input %p and replace %p, returns %p', (regex, flags, input, replace, expected) => {
      expect(RE2JS.compile(regex, flags).replace(input, replace)).toEqual(expected)
    })
  })
})
