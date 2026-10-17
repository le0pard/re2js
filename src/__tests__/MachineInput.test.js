import { expect, describe, it } from 'vitest'
import { MachineInput, MachineInputBase } from '../MachineInput.js'
import { RE2JS } from '../index.js'

describe('MachineUTF16Input Boundary Checks', () => {
  it('does not report literal prefix matches that exceed the bounded substring', () => {
    // We are searching the string "abcdef", but bounded to end at index 3 ("abc")
    const input = MachineInput.fromUTF16('abcdef', 0, 3)

    // Dummy RE2 instance looking for the prefix "cde"
    const mockRE2 = { prefix: 'cde' }

    // "cde" starts at index 2 (within bounds), but ends at index 5 (out of bounds).
    // The engine must safely reject it and return -1.
    expect(input.index(mockRE2, 0)).toBe(-1)
  })
})

it('MachineUTF8Input.indexOf fallback works without native .indexOf', () => {
  // UTF-8 representation of "hello world"
  const buffer = new Uint8Array([104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100])
  // UTF-8 representation of "world"
  const target = new Uint8Array([119, 111, 114, 108, 100])

  // Mask the native indexOf to force the manual fallback
  const originalIndexOf = buffer.indexOf
  buffer.indexOf = null

  try {
    const input = MachineInput.fromUTF8(buffer)
    const index = input.indexOf(buffer, target, 0)

    expect(index).toBe(6)

    // Test not found condition
    const notFoundTarget = new Uint8Array([122, 122]) // "zz"
    expect(input.indexOf(buffer, notFoundTarget, 0)).toBe(-1)
  } finally {
    // Restore the native function so we don't pollute the Vitest environment
    buffer.indexOf = originalIndexOf
  }
})

describe('UTF-8 decoding follows Go utf8.DecodeRune', () => {
  const RUNE_ERROR = 0xfffd
  // Decode a whole byte array into [rune, width] pairs
  const decodeAll = (bytes) => {
    const input = MachineInput.fromUTF8(new Uint8Array(bytes))
    const out = []
    let pos = 0
    for (;;) {
      const r = input.step(pos)
      if (r === MachineInputBase.EOF()) {
        break
      }
      out.push([r >> 3, r & 7])
      pos += r & 7
    }
    return out
  }

  it('decodes valid 1-4 byte sequences with their width', () => {
    expect(decodeAll([0x61])).toEqual([[0x61, 1]])
    expect(decodeAll([0xc3, 0xa9])).toEqual([[0xe9, 2]]) // é
    expect(decodeAll([0xe2, 0x82, 0xac])).toEqual([[0x20ac, 3]]) // €
    expect(decodeAll([0xf0, 0x9f, 0x98, 0x80])).toEqual([[0x1f600, 4]]) // 😀
    expect(decodeAll([0xed, 0x9f, 0xbf])).toEqual([[0xd7ff, 3]]) // last code point before surrogates
    expect(decodeAll([0xee, 0x80, 0x80])).toEqual([[0xe000, 3]]) // first code point after surrogates
    expect(decodeAll([0xf4, 0x8f, 0xbf, 0xbf])).toEqual([[0x10ffff, 4]]) // U+10FFFF
    expect(decodeAll([0xc2, 0x80])).toEqual([[0x80, 2]]) // smallest 2-byte
    expect(decodeAll([0xe0, 0xa0, 0x80])).toEqual([[0x800, 3]]) // smallest 3-byte
    expect(decodeAll([0xf0, 0x90, 0x80, 0x80])).toEqual([[0x10000, 4]]) // smallest 4-byte
  })

  it('rejects overlong encodings byte by byte', () => {
    expect(decodeAll([0xc0, 0x80])).toEqual([
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1]
    ])
    expect(decodeAll([0xc1, 0xbf])).toEqual([
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1]
    ])
    expect(decodeAll([0xe0, 0x80, 0x8a])).toEqual([
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1]
    ])
    expect(decodeAll([0xf0, 0x80, 0x80, 0x80])).toEqual([
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1]
    ])
  })

  it('rejects surrogates and values above U+10FFFF', () => {
    expect(decodeAll([0xed, 0xa0, 0x80])).toEqual([
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1]
    ]) // U+D800
    expect(decodeAll([0xed, 0xbf, 0xbf])).toEqual([
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1]
    ]) // U+DFFF
    expect(decodeAll([0xf4, 0x90, 0x80, 0x80])).toEqual([
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1]
    ]) // U+110000
    expect(decodeAll([0xf5, 0x80, 0x80, 0x80])[0]).toEqual([RUNE_ERROR, 1])
  })

  it('rejects stray continuation bytes, invalid leads, bad continuations and truncated sequences', () => {
    expect(decodeAll([0x80])).toEqual([[RUNE_ERROR, 1]])
    expect(decodeAll([0xbf, 0x61])).toEqual([
      [RUNE_ERROR, 1],
      [0x61, 1]
    ])
    expect(decodeAll([0xff])).toEqual([[RUNE_ERROR, 1]])
    expect(decodeAll([0xc3, 0x41])).toEqual([
      [RUNE_ERROR, 1],
      [0x41, 1]
    ]) // lead then ASCII
    expect(decodeAll([0xe2, 0x82, 0x41])).toEqual([
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1],
      [0x41, 1]
    ])
    expect(decodeAll([0xe2, 0x82])).toEqual([
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1]
    ]) // truncated
    expect(decodeAll([0xf0, 0x9f, 0x98])).toEqual([
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1],
      [RUNE_ERROR, 1]
    ])
    expect(decodeAll([0xc3])).toEqual([[RUNE_ERROR, 1]])
  })

  it('respects the end bound when a sequence runs past it', () => {
    const input = MachineInput.fromUTF8(new Uint8Array([0xc3, 0xa9, 0x61]), 0, 1)
    expect(input.step(0)).toBe((RUNE_ERROR << 3) | 1)
    expect(input.step(1)).toBe(MachineInputBase.EOF())
  })
})

describe('Invalid UTF-8 input never matches as a different character', () => {
  const bytes = (...b) => new Uint8Array(b)

  it('does not read overlong or malformed sequences as newline, space or Latin-1 letters', () => {
    expect(RE2JS.compile('(?m)^b').test(bytes(0xe0, 0x80, 0x8a, 0x62))).toBe(false)
    expect(RE2JS.compile('(?s)a.b').test(bytes(0x61, 0xe0, 0x80, 0x8a, 0x62))).toBe(false)
    expect(RE2JS.compile('a\\sb').test(bytes(0x61, 0xe0, 0x80, 0x8a, 0x62))).toBe(false)
    expect(RE2JS.compile('a[\\x{C3}\\x{E9}]b').test(bytes(0x61, 0xc3, 0x62))).toBe(false)
    expect(RE2JS.compile('a[\\x{C3}\\x{E9}]b').test(bytes(0x61, 0xc3, 0xa9, 0x62))).toBe(true)
  })

  it('treats each invalid byte as one U+FFFD rune, as Go does', () => {
    expect(RE2JS.compile('^.$').test(bytes(0xff))).toBe(true)
    expect(RE2JS.compile('^..$').test(bytes(0xe2, 0x82))).toBe(true)
    expect(
      RE2JS.compile('^\\x{FFFD}\\x{FFFD}\\x{FFFD}b$').test(bytes(0xed, 0xa0, 0x80, 0x62))
    ).toBe(true)
    expect(RE2JS.compile('^\\x{FFFD}$').test(bytes(0xef, 0xbf, 0xbd))).toBe(true) // a real U+FFFD
    const m = RE2JS.compile('(.)').matcher(bytes(0xc3, 0x41))
    expect(m.find()).toBe(true)
    expect(m.end()).toBe(1)
    expect(m.find()).toBe(true)
    expect(m.group()).toBe('A')
  })

  it('agrees across engines and cannot poison the DFA cache', () => {
    const re = RE2JS.compile('[ab]')
    expect(re.test(bytes(0xf4, 0x90, 0x84, 0x80, 0x61))).toBe(true) // the final 'a'
    expect(re.testExact('\u0100b')).toBe(false) // used to be true after the call above
    const dot = RE2JS.compile('(?s).')
    expect(dot.test(bytes(0xf4, 0x90, 0x80, 0x80))).toBe(true)
    expect(dot.matcher(bytes(0xf4, 0x90, 0x80, 0x80)).find()).toBe(true)
    expect(RE2JS.compile('^(?s).{4}$').test(bytes(0xf4, 0x90, 0x80, 0x80))).toBe(true)
  })

  it('advances through invalid bytes in repeated matching', () => {
    const input = bytes(0x61, 0xff, 0x61, 0xc3, 0x61, 0xe2, 0x82, 0x61)
    expect(Array.from(RE2JS.compile('a').matchAll(input), (m) => m.index)).toEqual([0, 2, 4, 7])
    expect(RE2JS.compile('\\x{FFFD}+').matcher(input).replaceAll('?')).toBe('a?a?a?a')
  })
})
