import { expect, describe, it } from 'vitest'
import { RE2JS } from '../index.js'
import { Parser } from '../Parser.js'
import { RE2Flags } from '../RE2Flags.js'

describe('RE2JS Stability and Anti-ReDoS Guarantees', () => {
  describe('Catastrophic Backtracking Immunity (ReDoS)', () => {
    // A helper to assert that an execution finishes quickly, whereas a backtracking engine
    // would take exponential time (2^60 steps) on these inputs and never finish. The bound is
    // generous so that slow CI machines do not make it flaky; a regression to exponential
    // behaviour would exceed it by many orders of magnitude.
    const assertLinearTime = (regexStr, inputStr, expectedMatch, flags = 0) => {
      const re = RE2JS.compile(regexStr, flags)
      const start = Date.now()
      // Use .test() instead of .matches() so unanchored zero-width
      // lookbehinds can correctly scan the string rather than forcing a full-string match.
      const result = re.test(inputStr)
      const elapsed = Date.now() - start

      expect(result).toBe(expectedMatch)
      // Takes well under a millisecond on a laptop.
      expect(elapsed).toBeLessThan(2000)
    }

    it('Defeats classic nested repetition ReDoS: (a+)+b', () => {
      assertLinearTime('^(a+)+b$', `${'a'.repeat(60)}!`, false)
    })

    it('Defeats overlapping alternation ReDoS: (a|a?)+', () => {
      assertLinearTime('^(a|a?)+$', `${'a'.repeat(60)}!`, false)
    })

    it('Defeats OWASP Email Validation ReDoS', () => {
      const emailRegex = '^([a-zA-Z0-9_.-])+@(([a-zA-Z0-9-])+.)+([a-zA-Z0-9]{2,4})+$'
      const maliciousEmail = `${'a'.repeat(60)}@${'a'.repeat(60)}.`
      assertLinearTime(emailRegex, maliciousEmail, false)
    })

    it('Defeats OWASP Whitespace / Content Exhaustion ReDoS', () => {
      const whitespaceRegex = '^.*[ \\t]+.*$'
      const maliciousWhitespace = ` ${'\\t '.repeat(40)} `
      assertLinearTime(whitespaceRegex, maliciousWhitespace, true)
    })

    it('Defeats Path/URL Parsing ReDoS', () => {
      const pathRegex = '^(/[^/]+)+$'
      const maliciousPath = `${'/a'.repeat(60)}/`
      assertLinearTime(pathRegex, maliciousPath, false)
    })

    it('Defeats classic nested repetition ReDoS inside Lookbehinds (Failing Match): (?<=(?:a+)+)b', () => {
      // Lookbehinds evaluate right-to-left in standard engines, but a complex nested
      // quantifier will still trigger exponential explosion. RE2JS evaluates this in linear time.
      const regexStr = '(?<=(?:a+)+)b'
      const maliciousInput = `${'a'.repeat(60)}!b` // The '!' causes the prefix match to fail
      assertLinearTime(regexStr, maliciousInput, false, RE2JS.LOOKBEHINDS)
    })

    it('Defeats overlapping alternation ReDoS inside Lookbehinds (Failing Match): (?<=(?:a|aa)+)b', () => {
      const regexStr = '(?<=(?:a|aa)+)b'
      const maliciousInput = `${'a'.repeat(60)}!b`
      assertLinearTime(regexStr, maliciousInput, false, RE2JS.LOOKBEHINDS)
    })

    it('Defeats classic nested repetition ReDoS inside Lookbehinds (Successful Match): (?<=(?:a+)+)b', () => {
      const regexStr = '(?<=(?:a+)+)b'
      const maliciousInput = `${'a'.repeat(60)}b` // The prefix perfectly matches
      assertLinearTime(regexStr, maliciousInput, true, RE2JS.LOOKBEHINDS)
    })

    it('Defeats overlapping alternation ReDoS inside Lookbehinds (Successful Match): (?<=(?:a|aa)+)b', () => {
      const regexStr = '(?<=(?:a|aa)+)b'
      const maliciousInput = `${'a'.repeat(60)}b` // The prefix perfectly matches
      assertLinearTime(regexStr, maliciousInput, true, RE2JS.LOOKBEHINDS)
    })
  })

  describe('Repeated matching with lookbehinds (quadratic-time regression)', () => {
    // Every find() used to re-run the lookbehind automata from the beginning of the input,
    // so iterating over all matches was quadratic: 16,000 characters took tens of seconds.
    // The lookbehind state is now carried from one match to the next (see LookbehindState).
    const input = 'ab'.repeat(8000)
    const re = RE2JS.compile('(?<=a)b', RE2JS.LOOKBEHINDS)

    const assertFast = (fn) => {
      const start = Date.now()
      const result = fn()
      const elapsed = Date.now() - start
      // Takes a few milliseconds; the quadratic version needed ~30 seconds for this input.
      // Lookbehind.test.js checks the same loops deterministically by counting NFA steps.
      expect(elapsed).toBeLessThan(5000)
      return result
    }

    it('matcher().find() loop', () => {
      const count = assertFast(() => {
        const m = re.matcher(input)
        let found = 0
        while (m.find()) {
          found++
        }
        return found
      })
      expect(count).toBe(8000)
    })

    it('matchAll()', () => {
      const matches = assertFast(() => Array.from(re.matchAll(input)))
      expect(matches).toHaveLength(8000)
      expect(matches[7999].index).toBe(input.length - 1)
    })

    it('split()', () => {
      const parts = assertFast(() => re.split(input))
      expect(parts.length).toBeGreaterThanOrEqual(8000)
      expect(parts[0]).toBe('a')
    })

    it('matcher().replaceAll()', () => {
      const replaced = assertFast(() => re.matcher(input).replaceAll('X'))
      expect(replaced).toBe('aX'.repeat(8000))
    })
  })

  describe('Lazy DFA state explosion stays linear', () => {
    // [ab]*a[ab]{19} needs 2^20 DFA states. The DFA fills its cache, resets it, then gives up
    // when resets come too often and the NFA finishes the search (RE2's policy), so a search
    // costs a bounded DFA attempt plus a linear NFA scan. Assertions are handled by the DFA
    // too and must not change that. 4x the input must cost well under 16x the time.
    const random = (n, seed) => {
      let state = seed
      let s = ''
      for (let i = 0; i < n; i++) {
        state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff
        s += (state >>> 16) & 1 ? 'a' : 'b'
      }
      return `${s} !`
    }
    const testTime = (pattern, text) => {
      const re = RE2JS.compile(pattern) // a fresh, empty DFA cache
      const start = performance.now()
      const result = re.test(text)
      return [performance.now() - start, result]
    }

    it.each(['[ab]*a[ab]{19}!', '\\b[ab]*a[ab]{19}\\b!', '(?i)\\B[ab]*a[ab]{19}\\B!'])(
      '%s on random text that never matches',
      (pattern) => {
        const small = random(50000, 1)
        const large = random(200000, 2)
        testTime(pattern, small) // warm up
        const [tSmall, rSmall] = testTime(pattern, small)
        const [tLarge, rLarge] = testTime(pattern, large)
        expect([rSmall, rLarge]).toEqual([false, false])
        expect(tLarge).toBeLessThan(8 * tSmall + 100)
      }
    )
  })

  describe('Parsing large patterns stays linear', () => {
    // These used to be quadratic: the parse stack was copied on every '|' or ')', literal runes
    // were copied on every appended rune, and classes merged across '|' were copied per branch.
    // Measure scaling rather than absolute time so the check holds on slow CI machines: parsing
    // 4x the pattern must cost well under 16x the time (the quadratic code gave 16-22x).
    const parseTime = (pattern) => {
      const start = performance.now()
      Parser.parse(pattern, RE2Flags.PERL)
      return performance.now() - start
    }
    const assertLinearParse = (makePattern, n) => {
      const small = makePattern(n)
      const large = makePattern(4 * n)
      Parser.parse(small, RE2Flags.PERL) // warm up
      const tSmall = parseTime(small)
      const tLarge = parseTime(large)
      expect(tLarge).toBeLessThan(8 * tSmall + 100)
    }

    it('alternatives', () => {
      assertLinearParse((n) => Array.from({ length: n }, (_, i) => `w${i}x`).join('|'), 10000)
    })

    it('nested non-capturing groups and parentheses', () => {
      assertLinearParse((n) => `${'(?:'.repeat(n)}a${')'.repeat(n)}`, 10000)
    })

    it('a long literal', () => {
      assertLinearParse((n) => 'a'.repeat(n), 50000)
    })

    it('single-rune classes merged across an alternation', () => {
      assertLinearParse(
        (n) => Array.from({ length: n }, (_, i) => String.fromCodePoint(0x4e00 + 2 * i)).join('|'),
        2500
      )
    })

    it('large patterns still compile and match correctly', () => {
      const alternatives = RE2JS.compile(
        Array.from({ length: 20000 }, (_, i) => `w${i}x`).join('|')
      )
      expect(alternatives.test('zz w19999x')).toBe(true)
      expect(alternatives.test('zz w20000x')).toBe(false)

      const literal = 'a'.repeat(100000)
      expect(RE2JS.compile(literal).test(`x${literal}`)).toBe(true)
      expect(RE2JS.compile(literal).test('a'.repeat(99999))).toBe(false)

      const classes = RE2JS.compile(
        Array.from({ length: 5000 }, (_, i) => String.fromCodePoint(0x4e00 + 2 * i)).join('|')
      )
      expect(classes.test(String.fromCodePoint(0x4e00 + 2 * 4999))).toBe(true)
      expect(classes.test(String.fromCodePoint(0x4e00 + 2 * 4999 + 1))).toBe(false)
    })
  })

  describe('Compile-time walks are not limited by the JS stack', () => {
    // The parser bounds nesting at 1000 levels, but Simplify expands x{n,m} into one nesting
    // level per optional copy, so a pattern that passes every parser check can be ~3000 levels
    // deep. Simplify, the compiler and the prefilter builder walk it without recursion.
    it('deeply nested groups around a wide counted repetition', () => {
      const re = RE2JS.compile(`${'('.repeat(998)}x{1,1000}${')'.repeat(998)}`)
      const m = re.matcher('x'.repeat(1000))
      expect(m.matches()).toBe(true)
      expect(m.group(998)).toBe('x'.repeat(1000))
      expect(re.matcher('x'.repeat(1001)).matches()).toBe(false)
      expect(re.matcher('').matches()).toBe(false)
    })

    it('a counted repetition with an optional body at full width', () => {
      const re = RE2JS.compile(`${'('.repeat(998)}x{0,1000}${')'.repeat(998)}`)
      expect(re.matcher('').matches()).toBe(true)
      expect(re.matcher('x'.repeat(1000)).matches()).toBe(true)
      expect(re.matcher('x'.repeat(1001)).matches()).toBe(false)
    })

    it('deeply nested alternations around a counted repetition', () => {
      // (?:a|b(?:a|b(?:...(?:a|bx{1,1000})...))): each level matches 'a' or 'b' then the next
      const re = RE2JS.compile(`${'(?:a|b'.repeat(499)}x{1,1000}${')'.repeat(499)}`)
      expect(re.test('a')).toBe(true)
      expect(re.test('ba')).toBe(true)
      expect(re.test(`${'b'.repeat(499)}xxx`)).toBe(true)
      expect(re.test('c')).toBe(false)
      expect(re.matcher(`${'b'.repeat(499)}xxx`).matches()).toBe(true)
      expect(re.matcher('b'.repeat(499)).matches()).toBe(false)
    })

    it('deeply nested lookbehinds around a counted repetition', () => {
      const re = RE2JS.compile(
        `${'(?<='.repeat(500)}x{1,1000}${')'.repeat(500)}y`,
        RE2JS.LOOKBEHINDS
      )
      expect(re.test('xy')).toBe(true)
      expect(re.test('zy')).toBe(false)
    })

    it('deeply nested literal alternations build their prefilter', () => {
      // Two parse levels per repetition, so 450 stays within the 1000-level limit
      const re = RE2JS.compile(`${'(?:foo|bar'.repeat(450)}baz${')'.repeat(450)}`)
      expect(re.test('foo')).toBe(true)
      expect(re.test(`${'bar'.repeat(450)}baz`)).toBe(true)
      expect(re.test('zzz')).toBe(false)
    })
  })

  describe('Infinite Loop & Memory Explosion Protections', () => {
    it('Safely matches massive strings without exceeding Call Stack Size', () => {
      const re = RE2JS.compile('a*b')
      // 1 million characters
      const hugeString = `${'a'.repeat(1000000)}b`

      // Because RE2JS manages threads using heap-based arrays rather than recursive function calls,
      // this will parse massive strings flawlessly without throwing JS Call Stack errors.
      expect(re.matches(hugeString)).toBe(true)
    })

    it('Gracefully handles empty strings without crashing', () => {
      const re1 = RE2JS.compile('.*')
      expect(re1.matches('')).toBe(true)

      const re2 = RE2JS.compile('a+')
      expect(re2.matches('')).toBe(false)
    })

    it('Prevents infinite loops on 0-width progressions (replaceAll)', () => {
      // If the engine doesn't advance the cursor on a 0-width match, this hangs forever.
      const re = RE2JS.compile('a?')
      const result = re.matcher('bbb').replaceAll('x')
      // Matches 0-width before b, between b's, and after b.
      // Replaces 'a' if it existed, but here it just inserts 'x' at every empty boundary.
      expect(result).toBe('xbxbxbx')
    })

    it('Properly scales multi-byte surrogate pairs (Emojis) in execution', () => {
      // Emojis are surrogate pairs (2 separate characters in JS UTF-16 length)
      const re = RE2JS.compile('^.$')

      // The engine must process the surrogate pair as exactly ONE code point.
      expect(re.matches('😊')).toBe(true)

      // Extended Unicode property blocks (So = Symbol, Other category which contains Emojis)
      const reEmoji = RE2JS.compile('^\\p{So}+$')
      // Use standard single-codepoint emojis to avoid Zero-Width Joiners (\p{C})
      expect(reEmoji.matches('😊🚀👽')).toBe(true)
    })

    it('DFA State Explosion limits are enforced (OOM Protection)', () => {
      // A tiny DFA memory budget: the cache is reset repeatedly and the search either
      // completes on the DFA or is handed to the NFA for that call.
      const re = RE2JS.compile('.*a.*b.*c')
      re.re2Input.dfa.stateBudget = 1200
      re.re2Input.dfa.memBudget = 1200

      // The DFA will run out of states and bailout gracefully, routing the rest
      // of the string to the NFA fallback without crashing or throwing OOM errors.
      expect(re.test('zzzaaazzzbbbzzzccczzz')).toBe(true)
    })
  })
})
