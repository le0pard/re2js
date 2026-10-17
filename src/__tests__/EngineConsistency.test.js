// Seeded cross-engine consistency tests.
//
// RE2JS has several matching engines (Pike VM, bit-state backtracker, one-pass, lazy DFA, the
// literal fast path) and picks one per call by program and input size. Each engine must give
// the same answer, on UTF-16 and UTF-8 input alike. These tests run random patterns and inputs
// from a fixed seed through every engine directly and compare them with the Pike VM, the
// reference implementation. A failure prints the pattern, input and engine to reproduce it.
import { expect, describe, it } from 'vitest'
import { RE2 } from '../RE2.js'
import { RE2Flags } from '../RE2Flags.js'
import { RE2JS } from '../index.js'
import { MachineInput } from '../MachineInput.js'
import { Backtracker } from '../Backtracker.js'
import { Utils } from '../Utils.js'
import { runEngines } from '../__utils__/engines.js'

const makeRandom = (seed) => {
  let state = seed
  const next = () => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
  return { next, pick: (items) => items[Math.floor(next() * items.length)] }
}

const makePatternGenerator = (random, atoms) => {
  // atom and sequence are mutually recursive, so they live on one object
  const gen = {
    atom(depth) {
      const r = random.next()
      if (r < 0.6 || depth > 2) return random.pick(atoms)
      if (r < 0.8) return `(?:${gen.sequence(depth + 1)})`
      return `(${gen.sequence(depth + 1)})`
    },
    quantify(s) {
      const r = random.next()
      if (r < 0.5) return s
      if (r < 0.6) return `${s}*`
      if (r < 0.7) return `${s}+`
      if (r < 0.8) return `${s}?`
      if (r < 0.85) return `${s}*?`
      if (r < 0.9) return `${s}??`
      if (r < 0.95) return `${s}{1,3}`
      return `${s}{2}`
    },
    sequence(depth) {
      const parts = []
      const n = 1 + Math.floor(random.next() * 3)
      for (let i = 0; i < n; i++) parts.push(gen.quantify(gen.atom(depth)))
      if (random.next() < 0.3) parts.push(`|${gen.quantify(gen.atom(depth))}`)
      return parts.join('')
    }
  }
  return () => gen.sequence(0)
}

const makeText = (random, pieces, maxLength) => {
  let s = ''
  const n = Math.floor(random.next() * maxLength)
  for (let i = 0; i < n; i++) s += random.pick(pieces)
  return s
}

const ATOMS = [
  'a',
  'b',
  'ab',
  '.',
  '(?s:.)',
  '[ab]',
  '[^a]',
  '[a-c]',
  'x',
  '\\b',
  '\\B',
  '^',
  '$',
  '(?m:^)',
  '(?m:$)',
  '\\A',
  '\\z',
  '(?i:A)',
  '(?i:k)',
  'é',
  '😀',
  '\\d',
  '\\w',
  '\\s',
  '\\pL',
  '[\\x{100}-\\x{2000}]'
]
const TEXT_PIECES = ['a', 'b', 'c', 'x', 'A', 'K', 'K', ' ', '\n', 'é', '😀', '1', 'ā']

const expectSameAsNfa = (re, text, bytes, anchor) => {
  const results = runEngines(re, text, bytes, anchor)
  const reference = results.find(([name]) => name === 'utf8 nfa')[1]
  for (const [engine, have] of results) {
    const message = `${engine} /${re.toString()}/ longest=${re.longest} anchor=${anchor} on ${JSON.stringify(text ?? Array.from(bytes))}`
    if (typeof have === 'boolean') {
      expect(have, message).toBe(reference !== null)
    } else {
      expect(have, message).toEqual(reference)
    }
  }
}

describe('every engine agrees with the Pike VM', () => {
  it.each([1, 2, 3, 4])('random patterns and inputs (seed %i)', (seed) => {
    const random = makeRandom(seed)
    const generate = makePatternGenerator(random, ATOMS)
    for (let i = 0; i < 120; i++) {
      // Every third pattern is anchored, which makes many of them one-pass programs
      const pattern = i % 3 === 0 ? `^(?:${generate()})` : generate()
      for (const longest of [false, true]) {
        let re
        try {
          re = RE2.compileImpl(pattern, RE2Flags.PERL, longest)
        } catch {
          continue
        }
        for (let k = 0; k < 3; k++) {
          const text = makeText(random, TEXT_PIECES, 12)
          const bytes = Utils.stringToUtf8ByteArray(text)
          for (const anchor of [RE2Flags.UNANCHORED, RE2Flags.ANCHOR_START, RE2Flags.ANCHOR_BOTH]) {
            expectSameAsNfa(re, text, bytes, anchor)
          }
        }
      }
    }
  })

  it('on invalid UTF-8 input', () => {
    const random = makeRandom(7)
    const generate = makePatternGenerator(random, [...ATOMS, '\\x{FFFD}', '[\\x{80}-\\x{10FFFF}]'])
    const byteRuns = [
      [0x61],
      [0x62],
      [0x0a],
      [0xc3, 0xa9],
      [0xf0, 0x9f, 0x98, 0x80],
      [0xe0, 0x80, 0x8a],
      [0xed, 0xa0, 0x80],
      [0xf4, 0x90, 0x80, 0x80],
      [0xc3],
      [0x80],
      [0xff],
      [0xe2, 0x82]
    ]
    for (let i = 0; i < 200; i++) {
      let re
      try {
        re = RE2.compile(generate())
      } catch {
        continue
      }
      for (let k = 0; k < 3; k++) {
        const bytes = []
        const n = Math.floor(random.next() * 6)
        for (let j = 0; j < n; j++) bytes.push(...random.pick(byteRuns))
        expectSameAsNfa(re, null, Uint8Array.from(bytes), RE2Flags.UNANCHORED)
      }
    }
  })

  it('on inputs around the bit-state backtracker size limit', () => {
    // Programs with many pending branches: deep backtracking stacks in the backtracker
    for (const pattern of ['(a?){100}', '(?:a|ab)*c', '((a|b)*?)(b+)$', '(a*)(a*)(a*)x|(a+)$']) {
      const re = RE2.compile(pattern)
      const limit = Backtracker.maxBitStateLen(re.prog)
      for (const length of [100, limit, limit + 1]) {
        const text = 'ab'.repeat(Math.ceil(length / 2)).slice(0, length)
        expectSameAsNfa(re, text, Utils.stringToUtf8ByteArray(text), RE2Flags.UNANCHORED)
      }
    }
  })
})

describe('lookbehind state carried across repeated matches', () => {
  it('matches like a stateless scan from the start of the input', () => {
    const random = makeRandom(11)
    const generate = makePatternGenerator(random, ['a', 'b', 'x', '.', '[ab]', '\\b', 'é'])
    const lookbehinds = ['(?<=a)', '(?<!a)', '(?<=x.*)', '(?<!b[ab])', '(?<=é|b)']
    for (let i = 0; i < 150; i++) {
      const pattern = random.pick(lookbehinds) + generate()
      let re
      try {
        re = RE2JS.compile(pattern, RE2JS.LOOKBEHINDS)
      } catch {
        continue
      }
      const re2 = re.re2()
      for (let k = 0; k < 3; k++) {
        const text = makeText(random, ['a', 'b', 'x', ' ', 'é'], 24)
        const viaMatcher = Array.from(re.matchAll(text), (m) => [m.index, m.index + m[0].length])
        // Stateless: every search rescans the lookbehinds from the start of the input
        const stateless = []
        const input = MachineInput.fromUTF16(text)
        let pos = 0
        while (pos <= text.length) {
          const found = re2.doExecuteNFA(input, pos, RE2Flags.UNANCHORED, 2, null)
          if (found === null) break
          stateless.push([found[0], found[1]])
          pos = found[1] > found[0] ? found[1] : found[1] + 1
        }
        expect(viaMatcher, `/${pattern}/ on ${JSON.stringify(text)}`).toEqual(stateless)
      }
    }
  })
})

describe('the prefilter never changes a result', () => {
  it('matches the same with and without the prefilter', () => {
    const random = makeRandom(13)
    const generate = makePatternGenerator(random, [
      'ab',
      'abc',
      'b',
      'ca',
      'é',
      '😀x',
      'xyz',
      '.',
      '[ab]',
      '\\d',
      'q'
    ])
    let withPrefilter = 0
    for (let i = 0; i < 400; i++) {
      let re
      try {
        re = RE2JS.compile(generate())
      } catch {
        continue
      }
      const re2 = re.re2()
      if (re2.prefilter === null) continue
      withPrefilter++
      for (let k = 0; k < 3; k++) {
        const text = makeText(random, ['a', 'b', 'c', 'x', 'y', 'z', 'q', 'é', '😀', '1', ' '], 30)
        const run = () => [
          re.test(text),
          re.test(Utils.stringToUtf8ByteArray(text)),
          Array.from(re.matchAll(text), (m) => [m.index, m[0]])
        ]
        const have = run()
        const saved = re2.prefilter
        re2.prefilter = null
        const want = run()
        re2.prefilter = saved
        expect(have, `/${re.pattern()}/ on ${JSON.stringify(text)}`).toEqual(want)
      }
    }
    expect(withPrefilter).toBeGreaterThan(20)
  })
})
