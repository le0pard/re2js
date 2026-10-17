import { expect, describe, it } from 'vitest'
import { RE2JS } from '../index.js'
import { Parser } from '../Parser.js'
import { RE2Flags } from '../RE2Flags.js'

describe('RE2JS Stability and Anti-ReDoS Guarantees', () => {
  describe('Catastrophic Backtracking Immunity (ReDoS)', () => {
    // A helper to assert that an execution finishes in under 50ms,
    // whereas native RegExp would hang the main thread indefinitely.
    const assertLinearTime = (regexStr, inputStr, expectedMatch, flags = 0) => {
      const re = RE2JS.compile(regexStr, flags)
      const start = Date.now()
      // Use .test() instead of .matches() so unanchored zero-width
      // lookbehinds can correctly scan the string rather than forcing a full-string match.
      const result = re.test(inputStr)
      const elapsed = Date.now() - start

      expect(result).toBe(expectedMatch)
      // Mathematical O(N) guarantee means even massive strings on complex regexes
      // evaluate nearly instantly. 50ms is highly generous for V8.
      expect(elapsed).toBeLessThan(50)
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
      // Takes a few milliseconds; the quadratic version needs ~30 seconds for this input.
      expect(elapsed).toBeLessThan(500)
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
      const re = RE2JS.compile('.*a.*b.*c')

      // Artificially restrict the DFA state cache limit
      re.re2Input.dfa.stateLimit = 5

      // The DFA will run out of states and bailout gracefully, routing the rest
      // of the string to the NFA fallback without crashing or throwing OOM errors.
      expect(re.test('zzzaaazzzbbbzzzccczzz')).toBe(true)
    })
  })
})
