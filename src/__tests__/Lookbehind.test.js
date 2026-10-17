import { expect, describe, it, vi } from 'vitest'
import { RE2JS, RE2Set } from '../index.js'
import { RE2 } from '../RE2.js'
import { RE2Flags } from '../RE2Flags.js'
import { Machine } from '../Machine.js'

// more info - https://systemf.epfl.ch/blog/re2-lookbehinds/
describe('Lookbehinds (Linear Time EPFL Algorithm)', () => {
  it('Positive Lookbehind', () => {
    const re = RE2JS.compile('(?<=foo)bar', RE2JS.LOOKBEHINDS)
    expect(re.test('foobar')).toBe(true)
    expect(re.test('bazbar')).toBe(false)

    const match = re.matcher('foobar')
    expect(match.find()).toBe(true)
    expect(match.group(0)).toBe('bar') // Group 0 correctly ignores the zero-width assertion
  })

  it('Negative Lookbehind', () => {
    const re = RE2JS.compile('(?<!foo)bar', RE2JS.LOOKBEHINDS)
    expect(re.test('bazbar')).toBe(true)
    expect(re.test('foobar')).toBe(false)
  })

  it('Multiple lookbehinds', () => {
    const re = RE2JS.compile('(?<=a)(?<!b)c', RE2JS.LOOKBEHINDS)
    expect(re.test('ac')).toBe(true)
    expect(re.test('bc')).toBe(false)
    expect(re.test('xc')).toBe(false)
  })

  it('Lookbehinds are strictly opt-in', () => {
    // Will throw a syntax exception if the flag isn't provided
    expect(() => RE2JS.compile('(?<=foo)bar')).toThrow()
  })

  it('Throws an error for captures inside lookbehinds (captureless algorithm)', () => {
    expect(() => RE2JS.compile('(?<=(foo))bar', RE2JS.LOOKBEHINDS)).toThrow(
      'invalid capture in lookbehind'
    )
  })

  it('Does not crash on factored out alternations with empty branches', () => {
    // The parser factors out empty matches which can trigger edge-cases in AST traversal.
    // This test ensures hasCapture gracefully handles it without throwing "null is not iterable"
    const re = RE2JS.compile('(?<=a|)b', RE2JS.LOOKBEHINDS)
    expect(re.test('ab')).toBe(true)
    expect(re.test('xb')).toBe(true) // Empty prefix branch matches 0-width
  })

  it('C++ Fork Ported Tests - Positive Lookbehinds', () => {
    // FullMatch translates to testExact
    expect(RE2JS.compile('.*there(?<=hello.*)', RE2JS.LOOKBEHINDS).testExact('hello there')).toBe(
      true
    )

    // PartialMatch translates to test
    expect(RE2JS.compile('(?<= )there', RE2JS.LOOKBEHINDS).test('hello there')).toBe(true)
    expect(RE2JS.compile('(?<=123)45', RE2JS.LOOKBEHINDS).test('12345')).toBe(true)
    expect(RE2JS.compile('(?<=abc)123', RE2JS.LOOKBEHINDS).test('abc123def')).toBe(true)
    expect(RE2JS.compile('(?<=123)def', RE2JS.LOOKBEHINDS).test('abc123def')).toBe(true)

    // Nested lookbehinds
    expect(RE2JS.compile('def(?<=def(?<!f))', RE2JS.LOOKBEHINDS).test('abc123def')).toBe(false)
    expect(RE2JS.compile('word2(?<=word1.*)', RE2JS.LOOKBEHINDS).test('word1 word2 word3')).toBe(
      true
    )
  })

  it('C++ Fork Ported Tests - Negative Lookbehinds', () => {
    expect(RE2JS.compile('(?<!def)123', RE2JS.LOOKBEHINDS).test('abc123def')).toBe(true)
    expect(RE2JS.compile('(?<!abc)123', RE2JS.LOOKBEHINDS).test('abc123def')).toBe(false)
    expect(RE2JS.compile('(?<!goodbye )there', RE2JS.LOOKBEHINDS).test('hello there')).toBe(true)

    // FullMatch translates to testExact
    expect(RE2JS.compile('good(?<!d)bye', RE2JS.LOOKBEHINDS).testExact('goodbye')).toBe(false)
  })
})

describe('Captureless Guarantee (Syntax Validation)', () => {
  it('Throws an error for standard captures inside lookbehinds', () => {
    expect(() => RE2JS.compile('(?<=(foo))bar', RE2JS.LOOKBEHINDS)).toThrow(
      'invalid capture in lookbehind'
    )
  })

  it('Throws an error for named captures inside lookbehinds', () => {
    expect(() => RE2JS.compile('(?<=(?P<name>foo))bar', RE2JS.LOOKBEHINDS)).toThrow(
      'invalid capture in lookbehind'
    )
  })

  it('Throws an error for deeply nested captures inside lookbehinds', () => {
    expect(() => RE2JS.compile('(?<=a(?:b(?:c(d))))', RE2JS.LOOKBEHINDS)).toThrow(
      'invalid capture in lookbehind'
    )
  })

  it('Successfully compiles non-capturing groups inside lookbehinds', () => {
    // Should not throw
    const re = RE2JS.compile('(?<=(?:foo))bar', RE2JS.LOOKBEHINDS)
    expect(re.test('foobar')).toBe(true)
  })
})

describe('Advanced Integrations', () => {
  it('Successfully matches lookbehinds when search is started mid-string via find(pos)', () => {
    const re = RE2JS.compile('(?<=foo)bar', RE2JS.LOOKBEHINDS)
    const m = re.matcher('foobar')

    // Start search explicitly at index 3 ("bar")
    // If the engine fails to scan from 0 internally, the lookbehind state won't be populated
    // and this will incorrectly return false.
    expect(m.find(3)).toBe(true)
    expect(m.group(0)).toBe('bar')
  })

  it('RE2Set matches multiple lookbehinds simultaneously', () => {
    // Proves that Multi-Pattern Sets can compile and evaluate
    // lookbehinds simultaneously in a single linear O(N) pass.
    const set = new RE2Set(RE2Set.UNANCHORED, RE2JS.LOOKBEHINDS)
    set.add('(?<=a)b') // ID: 0
    set.add('(?<!a)b') // ID: 1
    set.add('(?<=x)y') // ID: 2
    set.compile()

    expect(set.match('ab')).toEqual([0])
    expect(set.match('cb')).toEqual([1])
    expect(set.match('xy')).toEqual([2])
    expect(set.match('b')).toEqual([1])
  })

  it('replaceAll and split work with zero-width lookbehinds', () => {
    const re = RE2JS.compile('(?<= )foo', RE2JS.LOOKBEHINDS)
    // FIX: replaceAll must be called on the Matcher instance!
    expect(re.matcher('foo bar foo').replaceAll('baz')).toBe('foo bar baz')

    const reSplit = RE2JS.compile('(?<=,) ', RE2JS.LOOKBEHINDS)
    // Splits strictly on the space following a comma
    expect(reSplit.split('a, b, c')).toEqual(['a,', 'b,', 'c'])
  })

  it('Anchors and bounds inside lookbehinds evaluate correctly', () => {
    const re = RE2JS.compile('(?<=^a)b', RE2JS.LOOKBEHINDS)
    expect(re.test('ab')).toBe(true)
    expect(re.test('cab')).toBe(false) // 'a' is not at the start of the line

    const re2 = RE2JS.compile('(?<=a$)b', RE2JS.LOOKBEHINDS)
    // a$ matches 'a' strictly at the END of the string.
    // So (?<=a$)b means 'b' must follow an 'a' that is at the end of the string.
    // Mathematically impossible, so it should safely reject everything!
    expect(re2.test('ab')).toBe(false)
    expect(re2.test('a')).toBe(false)
    expect(re2.test('b')).toBe(false)
  })

  it('Empty string lookbehinds evaluate safely', () => {
    const re = RE2JS.compile('(?<=)a', RE2JS.LOOKBEHINDS)
    expect(re.test('a')).toBe(true)
    expect(re.test('ba')).toBe(true)
  })
})

describe('Lookbehinds across repeated matches', () => {
  // Successive matches over one input carry the lookbehind automata forward (LookbehindState in
  // Machine.js) instead of re-running them from the beginning of the input on every call. These
  // tests check that the carried state produces the same matches as a scan from scratch.
  const spans = (re, input) => {
    const m = re.matcher(input)
    const result = []
    while (m.find()) {
      result.push([m.start(), m.end()])
    }
    return result
  }

  it('positive lookbehind with an unbounded prefix sees text far before the match', () => {
    const re = RE2JS.compile('(?<=x.*)b', RE2JS.LOOKBEHINDS)
    const half = 'ab'.repeat(50)

    expect(spans(re, half)).toEqual([])

    const result = spans(re, `${half}x${half}`)
    expect(result).toHaveLength(50)
    // The first "b" after "x" is two positions behind it ("xab")
    expect(result[0]).toEqual([half.length + 2, half.length + 3])
    expect(result[49]).toEqual([2 * half.length, 2 * half.length + 1])
  })

  it('negative lookbehind with an unbounded prefix stops matching once the prefix appeared', () => {
    const re = RE2JS.compile('(?<!x.*)b', RE2JS.LOOKBEHINDS)
    const half = 'ab'.repeat(50)

    const result = spans(re, `${half}x${half}`)
    expect(result).toHaveLength(50)
    expect(result[0]).toEqual([1, 2])
    expect(result[49]).toEqual([half.length - 1, half.length])
  })

  it('nested lookbehinds', () => {
    // "b" preceded by an "a" that is itself not preceded by "x"
    const re = RE2JS.compile('(?<=(?<!x)a)b', RE2JS.LOOKBEHINDS)
    expect(spans(re, 'ab xab ab')).toEqual([
      [1, 2],
      [8, 9]
    ])
  })

  it('matchAll() loads the capture groups of every match', () => {
    const re = RE2JS.compile('(?<=a)(b)(c)?', RE2JS.LOOKBEHINDS)
    const matches = Array.from(re.matchAll('ab abc xb ab'), (m) => [m.index, m[0], m[1], m[2]])
    expect(matches).toEqual([
      [1, 'b', 'b', void 0],
      [4, 'bc', 'b', 'c'],
      [11, 'b', 'b', void 0]
    ])
  })

  it('find(start) resumes forwards and rescans when moving backwards', () => {
    const re = RE2JS.compile('(?<=a)b', RE2JS.LOOKBEHINDS)
    const m = re.matcher('ab'.repeat(5))

    expect(m.find(0)).toBe(true)
    expect(m.start()).toBe(1)
    expect(m.find(4)).toBe(true)
    expect(m.start()).toBe(5)
    expect(m.find(9)).toBe(true)
    expect(m.start()).toBe(9)
    // Backwards: the saved state is past this position, so the lookbehinds are re-evaluated
    expect(m.find(2)).toBe(true)
    expect(m.start()).toBe(3)
    expect(m.find(10)).toBe(false)
  })

  it('matches(), lookingAt() and reset() interleaved with find()', () => {
    const re = RE2JS.compile('(?<!x)ab', RE2JS.LOOKBEHINDS)
    const m = re.matcher('abab')

    expect(m.find()).toBe(true)
    expect(m.start()).toBe(0)
    expect(m.find()).toBe(true)
    expect(m.start()).toBe(2)
    expect(m.find()).toBe(false)

    expect(m.lookingAt()).toBe(true)
    expect(m.end()).toBe(2)
    expect(m.matches()).toBe(false)

    m.reset()
    expect(m.find()).toBe(true)
    expect(m.start()).toBe(0)
  })

  it('resetting the matcher to a new input discards the previous lookbehind state', () => {
    const re = RE2JS.compile('(?<=x.*)b', RE2JS.LOOKBEHINDS)
    const m = re.matcher('xab ab')
    expect(m.find()).toBe(true)
    expect(m.find()).toBe(true)
    expect(m.find()).toBe(false)

    m.resetMatcherInput('ab ab')
    expect(m.find()).toBe(false)

    m.resetMatcherInput('ab xab')
    expect(m.find()).toBe(true)
    expect(m.start()).toBe(5)
    expect(m.find()).toBe(false)
  })

  it('UTF-8 byte input with multi-byte characters', () => {
    const re = RE2JS.compile('(?<=é)b', RE2JS.LOOKBEHINDS)
    const bytes = new TextEncoder().encode('éb éb xb')
    expect(spans(re, bytes)).toEqual([
      [2, 3],
      [6, 7]
    ])
  })

  it('UTF-16 input with surrogate pairs', () => {
    const re = RE2JS.compile('(?<=😀)b', RE2JS.LOOKBEHINDS)
    expect(spans(re, '😀b 😀b xb')).toEqual([
      [2, 3],
      [6, 7]
    ])
  })

  it('leftmost-longest matching', () => {
    const re = RE2JS.compile('(?<=a)(?:b|bc)', RE2JS.LOOKBEHINDS | RE2JS.LONGEST_MATCH)
    expect(spans(re, 'abc abc')).toEqual([
      [1, 3],
      [5, 7]
    ])
  })

  it('zero-width matches of a lookbehind-only pattern', () => {
    const re = RE2JS.compile('(?<=a)', RE2JS.LOOKBEHINDS)
    expect(spans(re, 'aab')).toEqual([
      [1, 1],
      [2, 2]
    ])
    expect(re.matcher('aab').replaceAll('|')).toBe('a|a|b')
  })

  it('RE2 findAll and replaceAll loops', () => {
    const re2 = RE2.compileImpl('(?<=a)b', RE2Flags.PERL | RE2Flags.LOOKBEHIND, false)
    expect(re2.findAllIndex('ab ab xb', -1)).toEqual([
      [1, 2],
      [4, 5]
    ])
    expect(re2.replaceAll('ab ab xb', 'X')).toBe('aX aX xb')
  })
})

describe('Lookbehind state is only allocated for patterns with lookbehinds', () => {
  it('plain patterns carry no lookbehind state and mark no lookbehind instructions', () => {
    const re = RE2JS.compile('(a+)b', RE2JS.LOOKBEHINDS)
    expect(re.re2().createLookbehindState()).toBeNull()
    expect(re.matcher('aab').lookbehindState).toBeNull()
    expect(re.re2().prog.numLb).toBe(0)
    expect(re.re2().prog.lbInst.every((v) => v === 0)).toBe(true)
  })

  it('patterns with lookbehinds get one state per matcher, reset on a new input', () => {
    const re = RE2JS.compile('(?<=a)b', RE2JS.LOOKBEHINDS)
    const m = re.matcher('ab')
    const state = m.lookbehindState
    expect(state).not.toBeNull()
    expect(m.find()).toBe(true)
    expect(state.pos).toBeGreaterThanOrEqual(0)

    m.resetMatcherInput('xb')
    expect(m.lookbehindState).toBe(state)
    expect(state.pos).toBe(-1)
    expect(m.find()).toBe(false)
  })
})

describe('Lookbehinds keep repeated matching linear', () => {
  // One Machine.step() call processes one input position, so counting the calls measures the
  // work of a loop deterministically. Before the lookbehind state was carried between matches,
  // every call rescanned the input from the beginning: about n²/4 steps for the inputs below.
  const countSteps = (fn) => {
    const spy = vi.spyOn(Machine.prototype, 'step')
    try {
      fn()
      return spy.mock.calls.length
    } finally {
      spy.mockRestore()
    }
  }
  const n = 4000
  const input = 'ab'.repeat(n / 2)

  it('matcher().find() loop', () => {
    const re = RE2JS.compile('(?<=a)b', RE2JS.LOOKBEHINDS)
    const steps = countSteps(() => {
      const m = re.matcher(input)
      let found = 0
      while (m.find()) {
        found++
      }
      expect(found).toBe(n / 2)
    })
    expect(steps).toBeLessThan(4 * n)
  })

  it('matchAll() with capture groups', () => {
    const re = RE2JS.compile('(?<=a)(b)', RE2JS.LOOKBEHINDS)
    const steps = countSteps(() => {
      const matches = Array.from(re.matchAll(input))
      expect(matches).toHaveLength(n / 2)
      expect(matches[n / 2 - 1][1]).toBe('b')
    })
    expect(steps).toBeLessThan(6 * n)
  })

  it('split()', () => {
    const re = RE2JS.compile('(?<=a)b', RE2JS.LOOKBEHINDS)
    const steps = countSteps(() => {
      expect(re.split(input)).toEqual(new Array(n / 2).fill('a'))
    })
    expect(steps).toBeLessThan(4 * n)
  })

  it('matcher().replaceAll()', () => {
    const re = RE2JS.compile('(?<=a)b', RE2JS.LOOKBEHINDS)
    const steps = countSteps(() => {
      expect(re.matcher(input).replaceAll('X')).toBe('aX'.repeat(n / 2))
    })
    expect(steps).toBeLessThan(4 * n)
  })

  it('RE2 findAll loop', () => {
    const re2 = RE2.compileImpl('(?<=a)b', RE2Flags.PERL | RE2Flags.LOOKBEHIND, false)
    const steps = countSteps(() => {
      expect(re2.findAllIndex(input, -1)).toHaveLength(n / 2)
    })
    expect(steps).toBeLessThan(4 * n)
  })

  it('doubling the input doubles the work', () => {
    const re = RE2JS.compile('(?<=a)b', RE2JS.LOOKBEHINDS)
    const run = (length) =>
      countSteps(() => {
        const m = re.matcher('ab'.repeat(length / 2))
        while (m.find()) {
          // consume all matches
        }
      })
    const ratio = run(2 * n) / run(n)
    // A quadratic loop would give a ratio of about 4
    expect(ratio).toBeGreaterThan(1.5)
    expect(ratio).toBeLessThan(2.5)
  })
})
