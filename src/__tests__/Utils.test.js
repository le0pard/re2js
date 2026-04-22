import { Utils } from '../Utils'
import { Codepoint } from '../Codepoint'
import { expect, describe, test } from '@jest/globals'

describe('Utils', () => {
  describe('.unhex', () => {
    test('correctly decodes hexadecimal characters', () => {
      expect(Utils.unhex(Codepoint.CODES.get('0'))).toBe(0)
      expect(Utils.unhex(Codepoint.CODES.get('9'))).toBe(9)
      expect(Utils.unhex('a'.codePointAt(0))).toBe(10)
      expect(Utils.unhex('f'.codePointAt(0))).toBe(15)
      expect(Utils.unhex('A'.codePointAt(0))).toBe(10)
      expect(Utils.unhex('F'.codePointAt(0))).toBe(15)
      expect(Utils.unhex('z'.codePointAt(0))).toBe(-1) // Invalid hex
    })
  })

  describe('UTF-8 Polyfills (TextEncoder/TextDecoder Fallback)', () => {
    test('correctly converts strings to and from UTF-8 byte arrays using fallback', () => {
      // Temporarily mock TextEncoder and TextDecoder to be undefined to hit the polyfill branches
      const OriginalTextEncoder = globalThis.TextEncoder
      const OriginalTextDecoder = globalThis.TextDecoder
      delete globalThis.TextEncoder
      delete globalThis.TextDecoder

      try {
        // String covering standard ASCII, Multi-byte characters, and Surrogate Pair Emojis
        const str = 'Hello \uD83D\uDE00 world \u00e1\u0062\u00e7'

        // Test manual encoding
        const bytes = Utils.stringToUtf8ByteArray(str)
        expect(bytes.length).toBeGreaterThan(0)
        expect(Array.isArray(bytes)).toBe(true)

        // Test manual decoding
        const decodedStr = Utils.utf8ByteArrayToString(bytes)
        expect(decodedStr).toEqual(str)
      } finally {
        // Restore globals
        globalThis.TextEncoder = OriginalTextEncoder
        globalThis.TextDecoder = OriginalTextDecoder
      }
    })
  })
})
