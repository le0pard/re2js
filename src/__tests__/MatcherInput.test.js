import { MatcherInputBase } from '../MatcherInput'
import { expect, describe, test } from '@jest/globals'

describe('MatcherInputBase', () => {
  test('throws Not Implemented error when base class methods are accessed directly', () => {
    const base = new MatcherInputBase()
    expect(() => base.getEncoding()).toThrow('not implemented')
  })
})
