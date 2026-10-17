// Port of RE2's search tests (re2/testing/search_test.cc, simple_tests): 236 regexp and text
// pairs chosen by the RE2 authors to exercise every engine.
//
// Two checks per case:
// - The first match must equal what the C++ RE2 engine returns. Those results are recorded in
//   src/__fixtures__/re2-search-golden.json by tools/scripts/genRE2SearchFixture.js, through the
//   re2 Node.js binding, so the test does not need the native binding to run.
// - As RE2's own tester does, every engine must give the same result for every anchoring and
//   both match kinds (leftmost-first and leftmost-longest). RE2 compares against its exponential
//   backtracker; here the Pike VM is the reference, and the other engines (bit-state
//   backtracker, one-pass, lazy DFA, public API, UTF-16 and UTF-8 input) must agree with it.
import { expect, describe, it } from 'vitest'
import { RE2 } from '../RE2.js'
import { RE2Flags } from '../RE2Flags.js'
import { Utils } from '../Utils.js'
import { runEngines } from '../__utils__/engines.js'
import { utf16IndicesToUtf8 } from '../__utils__/unicode.js'
import golden from '../__fixtures__/re2-search-golden.json' with { type: 'json' }

const ANCHORS = [RE2Flags.UNANCHORED, RE2Flags.ANCHOR_START, RE2Flags.ANCHOR_BOTH]

// \C (any single byte) is not supported, as in Go's regexp: it can split a UTF-8 sequence,
// which a rune-based engine cannot represent. Those cases must be rejected at compile time.
const usesAnyByte = (c) => c.pattern.includes('\\C')
const CASES = golden.cases.filter((c) => !usesAnyByte(c))
const ANY_BYTE_CASES = golden.cases.filter(usesAnyByte)

const expectAllEngines = (re, text, bytes, anchor, want, where) => {
  for (const [engine, have] of runEngines(re, text, bytes, anchor)) {
    const message = `${where}: ${engine}`
    if (typeof have === 'boolean') {
      expect(have, message).toBe(want !== null)
    } else {
      expect(have, message).toEqual(want)
    }
  }
}

describe('RE2 search tests (search_test.cc)', () => {
  it('has every case of the upstream table', () => {
    expect(golden.cases).toHaveLength(236)
    expect(ANY_BYTE_CASES).toHaveLength(10)
  })

  it('rejects \\C like Go does', () => {
    for (const { pattern } of ANY_BYTE_CASES) {
      expect(() => RE2.compile(pattern), pattern).toThrow('invalid escape sequence: `\\C`')
    }
  })

  describe('first match equals C++ RE2', () => {
    it.each(CASES.map((c) => [c.pattern, c.text, c]))(
      '/%s/ on %j',
      (pattern, text, { partial, full }) => {
        const bytes = Utils.stringToUtf8ByteArray(text)
        const toUtf8 = (a) => (a === null ? null : utf16IndicesToUtf8(a, text))

        const re = RE2.compile(pattern)
        expect(re.findSubmatchIndex(text), 'partial, UTF-16').toEqual(partial)
        expect(re.findUTF8SubmatchIndex(bytes), 'partial, UTF-8').toEqual(toUtf8(partial))
        expectAllEngines(re, text, bytes, RE2Flags.UNANCHORED, toUtf8(partial), 'partial')

        const refull = RE2.compile(`\\A(?:${pattern})\\z`)
        expect(refull.findSubmatchIndex(text), 'full, UTF-16').toEqual(full)
        expectAllEngines(refull, text, bytes, RE2Flags.UNANCHORED, toUtf8(full), 'full')
      }
    )
  })

  describe('every engine agrees for every anchoring and match kind', () => {
    it.each(CASES.map((c) => [c.pattern, c.text]))('/%s/ on %j', (pattern, text) => {
      const bytes = Utils.stringToUtf8ByteArray(text)
      for (const longest of [false, true]) {
        const re = RE2.compileImpl(pattern, RE2Flags.PERL, longest)
        for (const anchor of ANCHORS) {
          const results = runEngines(re, text, bytes, anchor)
          const reference = results.find(([name]) => name === 'utf8 nfa')[1]
          expectAllEngines(
            re,
            text,
            bytes,
            anchor,
            reference,
            `longest=${longest} anchor=${anchor}`
          )
        }
      }
    })
  })
})
