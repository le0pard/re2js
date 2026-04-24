import { MatcherInputBase, MatcherInput } from '../MatcherInput'
import { expect, describe, test } from '@jest/globals'

describe('MatcherInputBase', () => {
  test('throws Not Implemented error when base class methods are accessed directly', () => {
    const base = new MatcherInputBase()
    expect(() => base.getEncoding()).toThrow('not implemented')
  })
})

test('Utf16MatcherInput.asBytes correctly translates UTF-16 surrogate pairs to UTF-8 byte arrays', () => {
  // Emoji '😊' is a surrogate pair (U+1F60A)
  const input = MatcherInput.utf16('😊')

  // 4 bytes in UTF-8 for this emoji: F0 9F 98 8A
  expect(input.asBytes()).toEqual([240, 159, 152, 138])
})
