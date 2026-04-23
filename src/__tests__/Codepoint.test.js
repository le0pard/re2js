import { Codepoint } from '../Codepoint'
import { expect, describe, it } from '@jest/globals'

describe('Codepoint', () => {
  describe('ASCII fast-path memoization', () => {
    it('should correctly convert ASCII to upper case via lookup table', () => {
      expect(Codepoint.toUpperCase(97)).toBe(65) // 'a' -> 'A'
      expect(Codepoint.toUpperCase(122)).toBe(90) // 'z' -> 'Z'
      expect(Codepoint.toUpperCase(65)).toBe(65) // 'A' -> 'A'
      expect(Codepoint.toUpperCase(48)).toBe(48) // '0' -> '0'
    })

    it('should correctly convert ASCII to lower case via lookup table', () => {
      expect(Codepoint.toLowerCase(65)).toBe(97) // 'A' -> 'a'
      expect(Codepoint.toLowerCase(90)).toBe(122) // 'Z' -> 'z'
      expect(Codepoint.toLowerCase(97)).toBe(97) // 'a' -> 'a'
      expect(Codepoint.toLowerCase(48)).toBe(48) // '0' -> '0'
    })
  })

  describe('Non-ASCII string conversion fallback', () => {
    it('should correctly fold non-ASCII code points', () => {
      // Cyrillic 'А' (U+0410) -> 'а' (U+0430)
      expect(Codepoint.toLowerCase(0x0410)).toBe(0x0430)
      expect(Codepoint.toUpperCase(0x0430)).toBe(0x0410)

      // Greek 'Ω' (U+03A9) -> 'ω' (U+03C9)
      expect(Codepoint.toLowerCase(0x03a9)).toBe(0x03c9)
    })

    test('safely transforms supplementary characters without false length bailouts', () => {
      // Deseret Capital Letter Long I (U+10400)
      const upper = 0x10400
      // Deseret Small Letter Long I (U+10428)
      const lower = 0x10428

      // Correctly returns 0x10428
      expect(Codepoint.toLowerCase(upper)).toBe(lower)
      expect(Codepoint.toUpperCase(lower)).toBe(upper)
    })
  })
})
