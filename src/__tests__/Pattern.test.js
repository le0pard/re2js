import { expect, describe, test } from '@jest/globals'
import { Pattern } from '../Pattern'

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
