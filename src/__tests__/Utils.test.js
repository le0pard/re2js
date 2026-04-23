import { Utils } from '../Utils'
import { Codepoint } from '../Codepoint'
import { expect, describe, test, afterEach } from '@jest/globals'

describe('Utils', () => {
  describe('.escapeRune', () => {
    const cases = [
      // Printable non-meta characters
      ['a'.codePointAt(0), 'a'],
      ['1'.codePointAt(0), '1'],
      ['z'.codePointAt(0), 'z'],
      ['"'.codePointAt(0), '"'], // " is printable and not a meta character
      [0x100, 'Ā'], // 0x100 is printable (Latin Capital Letter A with Macron)
      // Printable meta characters
      ['*'.codePointAt(0), '\\*'],
      ['+'.codePointAt(0), '\\+'],
      ['?'.codePointAt(0), '\\?'],
      ['('.codePointAt(0), '\\('],
      ['|'.codePointAt(0), '\\|'],
      ['\\'.codePointAt(0), '\\\\'],
      // Named non-printable control characters
      ['\n'.codePointAt(0), '\\n'],
      ['\t'.codePointAt(0), '\\t'],
      ['\r'.codePointAt(0), '\\r'],
      ['\f'.codePointAt(0), '\\f'],
      ['\b'.codePointAt(0), '\\b'],
      // Unnamed control characters (under 0x100) - hex formatting
      [0x07, '\\x07'], // Bell character
      [0x1b, '\\x1b'], // Escape character
      // Unnamed control characters (0x100 and above) - hex formatting with braces
      [0x2028, '\\x{2028}'] // Line separator (Zl category, non-printable)
    ]

    test.concurrent.each(cases)('rune %p escapes to %p', (rune, expected) => {
      expect(Utils.escapeRune(rune)).toEqual(expected)
    })
  })

  describe('UTF-8 Encoding and Decoding (stringToUtf8ByteArray & utf8ByteArrayToString)', () => {
    const textCases = [
      'Hello World', // Standard ASCII (1-byte sequences)
      'áéíóú', // Latin-1 Supplement (2-byte sequences)
      '日本語', // CJK Unified Ideographs (3-byte sequences)
      '🚀👽👨‍👩‍👧‍👦', // Emojis and ZWJ sequences (4-byte sequences and surrogate pairs)
      '\x00\x07\x1b' // Control characters
    ]

    // Save the native implementations to restore them later
    const OriginalTextEncoder = globalThis.TextEncoder
    const OriginalTextDecoder = globalThis.TextDecoder

    afterEach(() => {
      // Restore native encoders after tests
      globalThis.TextEncoder = OriginalTextEncoder
      globalThis.TextDecoder = OriginalTextDecoder
    })

    test.each(textCases)('Native implementation correctly processes %p', (text) => {
      // Ensure native globals are available
      expect(globalThis.TextEncoder).toBeDefined()
      expect(globalThis.TextDecoder).toBeDefined()

      const bytes = Utils.stringToUtf8ByteArray(text)
      expect(Array.isArray(bytes) || bytes instanceof Uint8Array).toBe(true)
      expect(bytes.length).toBeGreaterThan(0)

      const decodedText = Utils.utf8ByteArrayToString(bytes)
      expect(decodedText).toEqual(text)
    })

    test.each(textCases)('Fallback polyfill implementation correctly processes %p', (text) => {
      // Temporarily delete native implementations to force the fallback logic
      delete globalThis.TextEncoder
      delete globalThis.TextDecoder

      expect(globalThis.TextEncoder).toBeUndefined()
      expect(globalThis.TextDecoder).toBeUndefined()

      // Convert to bytes using the manual fallback
      const bytes = Utils.stringToUtf8ByteArray(text)
      expect(Array.isArray(bytes)).toBe(true)
      expect(bytes.length).toBeGreaterThan(0)

      // Convert back to string using the manual fallback
      const decodedText = Utils.utf8ByteArrayToString(bytes)
      expect(decodedText).toEqual(text)
    })

    test('Fallback decoding safely handles surrogate pairs specifically', () => {
      delete globalThis.TextEncoder
      delete globalThis.TextDecoder

      expect(globalThis.TextEncoder).toBeUndefined()
      expect(globalThis.TextDecoder).toBeUndefined()

      // The surrogate pair for '𐍈' (U+10348)
      // High surrogate: 0xD800, Low surrogate: 0xDF48
      const str = '𐍈'

      const bytes = Utils.stringToUtf8ByteArray(str)
      // U+10348 encodes to 4 bytes in UTF-8: F0 90 8D 88
      expect(bytes).toEqual([240, 144, 141, 136])

      const decodedStr = Utils.utf8ByteArrayToString(bytes)
      expect(decodedStr).toEqual(str)
    })

    test('correctly converts strings to and from UTF-8 byte arrays using fallback', () => {
      delete globalThis.TextEncoder
      delete globalThis.TextDecoder

      expect(globalThis.TextEncoder).toBeUndefined()
      expect(globalThis.TextDecoder).toBeUndefined()

      // String covering standard ASCII, Multi-byte characters, and Surrogate Pair Emojis
      const str = 'Hello \uD83D\uDE00 world \u00e1\u0062\u00e7'

      // Test manual encoding
      const bytes = Utils.stringToUtf8ByteArray(str)
      expect(bytes.length).toBeGreaterThan(0)
      expect(Array.isArray(bytes)).toBe(true)

      // Test manual decoding
      const decodedStr = Utils.utf8ByteArrayToString(bytes)
      expect(decodedStr).toEqual(str)
    })
  })

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

  describe('.isByteArray', () => {
    test('should return true for standard Arrays', () => {
      expect(Utils.isByteArray([])).toBe(true)
      expect(Utils.isByteArray([1, 2, 3])).toBe(true)
      expect(Utils.isByteArray(['a', 'b', 'c'])).toBe(true)
    })

    test('should return true for Uint8Array instances', () => {
      expect(Utils.isByteArray(new Uint8Array())).toBe(true)
      expect(Utils.isByteArray(new Uint8Array([1, 2, 3]))).toBe(true)
      expect(Utils.isByteArray(new Uint8Array(new ArrayBuffer(8)))).toBe(true)
    })

    test('should return false for other Typed Arrays', () => {
      expect(Utils.isByteArray(new Int8Array([1, 2, 3]))).toBe(false)
      expect(Utils.isByteArray(new Uint16Array([1, 2, 3]))).toBe(false)
      expect(Utils.isByteArray(new Float32Array([1.5, 2.5]))).toBe(false)
    })

    test('should return false for ArrayBuffers and DataViews', () => {
      const buffer = new ArrayBuffer(8)
      expect(Utils.isByteArray(buffer)).toBe(false)
      expect(Utils.isByteArray(new DataView(buffer))).toBe(false)
    })

    test('should return false for primitives and objects', () => {
      expect(Utils.isByteArray(null)).toBe(false)
      expect(Utils.isByteArray(undefined)).toBe(false)
      expect(Utils.isByteArray(123)).toBe(false)
      expect(Utils.isByteArray('string')).toBe(false)
      expect(Utils.isByteArray(true)).toBe(false)
      expect(Utils.isByteArray({})).toBe(false)
      expect(Utils.isByteArray({ a: 1, b: 2 })).toBe(false)
      expect(Utils.isByteArray(() => {})).toBe(false)
    })
  })
})
