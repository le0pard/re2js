import { expect, describe, it } from 'vitest'
import { MachineInput, MachineInputBase } from '../MachineInput.js'
import { RE2JS } from '../index.js'
import { Utils } from '../Utils.js'
import { RE2 } from '../RE2.js'
import { RE2Flags } from '../RE2Flags.js'
import { Backtracker } from '../Backtracker.js'
import { OnePass } from '../OnePass.js'

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

describe('Inputs that start inside a buffer', () => {
  // Every position the engines use is relative to the start of the input, endPos() included, so
  // [start, end) of a buffer matches like that slice alone (the text around it is not visible).
  const engines = (re, input, anchor) => {
    const ncap = 2 * (1 + re.numSubexp)
    const results = [
      ['nfa', re.doExecuteNFA(input(), 0, anchor, ncap)],
      ['backtracker', Backtracker.execute(re, input(), 0, anchor, ncap)],
      ['dfa', re.dfa.match(input(), 0, anchor)]
    ]
    if (re.onepass !== null) {
      results.push(['onepass', OnePass.execute(re, input(), 0, anchor, ncap)])
    }
    return results
  }

  it.each(['(?i)\\w', '^a+$', 'a\\b', '(a)(b)?$', '^(a)b\\z', '\\Bb', '(?m)^b$'])(
    'matches /%s/ in a slice like in the slice alone',
    (pattern) => {
      const re = RE2.compile(pattern)
      const text = 'Kab\nb!'
      for (let start = 0; start <= text.length; start++) {
        for (let end = start; end <= text.length; end++) {
          const slice = text.slice(start, end)
          const bytes = Utils.stringToUtf8ByteArray(text)
          for (const anchor of [RE2Flags.UNANCHORED, RE2Flags.ANCHOR_START, RE2Flags.ANCHOR_BOTH]) {
            const want = engines(re, () => MachineInput.fromUTF16(slice), anchor)
            const utf16 = engines(re, () => MachineInput.fromUTF16(text, start, end), anchor)
            const utf8 = engines(re, () => MachineInput.fromUTF8(bytes, start, end), anchor)
            const where = `${JSON.stringify(slice)} anchor=${anchor}`
            expect(utf16, `UTF-16 ${where}`).toEqual(want)
            expect(utf8, `UTF-8 ${where}`).toEqual(want)
          }
        }
      }
    }
  )
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

  it('decodes the character before a position like Go utf8.DecodeLastRune', () => {
    // The rune before pos must end exactly at pos; a truncated sequence or a stray byte after
    // an ASCII character is U+FFFD, not that ASCII character.
    const context = (b, pos) => MachineInput.fromUTF8(Uint8Array.from(b)).context(pos)
    const { EMPTY_BEGIN_LINE, EMPTY_WORD_BOUNDARY, EMPTY_NO_WORD_BOUNDARY } = Utils
    expect(context([0x61, 0xc3], 2) & EMPTY_NO_WORD_BOUNDARY).not.toBe(0)
    expect(context([0x61, 0xff], 2) & EMPTY_NO_WORD_BOUNDARY).not.toBe(0)
    expect(context([0x61, 0xf0, 0x9f], 3) & EMPTY_NO_WORD_BOUNDARY).not.toBe(0)
    expect(context([0x0a, 0xff, 0x62], 2) & EMPTY_BEGIN_LINE).toBe(0)
    expect(context([0x0a, 0xc3, 0x62], 2) & EMPTY_BEGIN_LINE).toBe(0)
    // valid sequences decode as themselves
    expect(context([0xc3, 0xa9, 0x61], 3) & EMPTY_WORD_BOUNDARY).not.toBe(0)
    expect(context([0x61, 0xc3, 0xa9], 3) & EMPTY_NO_WORD_BOUNDARY).not.toBe(0)
    expect(context([0xe2, 0x82, 0xac, 0x0a], 4) & EMPTY_BEGIN_LINE).toBe(EMPTY_BEGIN_LINE)
  })

  it.each([
    // [pattern, input, Go's FindIndex]
    ['\\b$', [0x61, 0xc3], null],
    ['\\b$', [0x61, 0xff], null],
    ['\\B$', [0x61, 0xc3], [2, 2]],
    ['(?m)^b', [0x0a, 0xff, 0x62], null],
    ['(?m)^b', [0x0a, 0xc3, 0x62], null],
    ['a\\b', [0x61, 0xf0, 0x9f], [0, 1]],
    ['(?m)^', [0xc3, 0xa9, 0x0a, 0x80, 0x78], [0, 0]]
  ])('evaluates %s after invalid bytes as Go does, in every engine', (pattern, b, want) => {
    const re = RE2JS.compile(pattern)
    const m = re.matcher(Uint8Array.from(b))
    expect(m.find() ? [m.start(), m.end()] : null).toEqual(want)
    expect(re.test(Uint8Array.from(b))).toBe(want !== null)
  })

  it('advances through invalid bytes in repeated matching', () => {
    const input = bytes(0x61, 0xff, 0x61, 0xc3, 0x61, 0xe2, 0x82, 0x61)
    expect(Array.from(RE2JS.compile('a').matchAll(input), (m) => m.index)).toEqual([0, 2, 4, 7])
    expect(RE2JS.compile('\\x{FFFD}+').matcher(input).replaceAll('?')).toBe('a?a?a?a')
  })
})
