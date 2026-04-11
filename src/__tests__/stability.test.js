import { RE2JS } from '../index'
import { expect, describe, test } from '@jest/globals'

describe('RE2JS Stability and Anti-ReDoS Guarantees', () => {
  describe('Catastrophic Backtracking Immunity (ReDoS)', () => {
    // A helper to assert that an execution finishes in under 50ms,
    // whereas native RegExp would hang the main thread indefinitely.
    const assertLinearTime = (regexStr, inputStr, expectedMatch) => {
      const re = RE2JS.compile(regexStr)
      const start = Date.now()
      const result = re.matches(inputStr)
      const elapsed = Date.now() - start

      expect(result).toBe(expectedMatch)
      // Mathematical O(N) guarantee means even massive strings on complex regexes
      // evaluate nearly instantly. 50ms is highly generous for V8.
      expect(elapsed).toBeLessThan(50)
    }

    test('Defeats classic nested repetition ReDoS: (a+)+b', () => {
      assertLinearTime('^(a+)+b$', `${'a'.repeat(60)}!`, false)
    })

    test('Defeats overlapping alternation ReDoS: (a|a?)+', () => {
      assertLinearTime('^(a|a?)+$', `${'a'.repeat(60)}!`, false)
    })

    test('Defeats OWASP Email Validation ReDoS', () => {
      const emailRegex = '^([a-zA-Z0-9_.-])+@(([a-zA-Z0-9-])+.)+([a-zA-Z0-9]{2,4})+$'
      const maliciousEmail = `${'a'.repeat(60)}@${'a'.repeat(60)}.`
      assertLinearTime(emailRegex, maliciousEmail, false)
    })

    test('Defeats OWASP Whitespace / Content Exhaustion ReDoS', () => {
      const whitespaceRegex = '^.*[ \\t]+.*$'
      const maliciousWhitespace = ` ${'\\t '.repeat(40)} `
      assertLinearTime(whitespaceRegex, maliciousWhitespace, true)
    })

    test('Defeats Path/URL Parsing ReDoS', () => {
      const pathRegex = '^(/[^/]+)+$'
      const maliciousPath = `${'/a'.repeat(60)}/`
      assertLinearTime(pathRegex, maliciousPath, false)
    })
  })

  describe('Infinite Loop & Memory Explosion Protections', () => {
    test('Safely matches massive strings without exceeding Call Stack Size', () => {
      const re = RE2JS.compile('a*b')
      // 1 million characters
      const hugeString = `${'a'.repeat(1000000)}b`

      // Because RE2JS manages threads using heap-based arrays rather than recursive function calls,
      // this will parse massive strings flawlessly without throwing JS Call Stack errors.
      expect(re.matches(hugeString)).toBe(true)
    })

    test('Gracefully handles empty strings without crashing', () => {
      const re1 = RE2JS.compile('.*')
      expect(re1.matches('')).toBe(true)

      const re2 = RE2JS.compile('a+')
      expect(re2.matches('')).toBe(false)
    })

    test('Prevents infinite loops on 0-width progressions (replaceAll)', () => {
      // If the engine doesn't advance the cursor on a 0-width match, this hangs forever.
      const re = RE2JS.compile('a?')
      const result = re.matcher('bbb').replaceAll('x')
      // Matches 0-width before b, between b's, and after b.
      // Replaces 'a' if it existed, but here it just inserts 'x' at every empty boundary.
      expect(result).toBe('xbxbxbx')
    })

    test('Properly scales multi-byte surrogate pairs (Emojis) in execution', () => {
      // Emojis are surrogate pairs (2 separate characters in JS UTF-16 length)
      const re = RE2JS.compile('^.$')

      // The engine must process the surrogate pair as exactly ONE code point.
      expect(re.matches('😊')).toBe(true)

      // Extended Unicode property blocks (So = Symbol, Other category which contains Emojis)
      const reEmoji = RE2JS.compile('^\\p{So}+$')
      // Use standard single-codepoint emojis to avoid Zero-Width Joiners (\p{C})
      expect(reEmoji.matches('😊🚀👽')).toBe(true)
    })

    test('DFA State Explosion limits are enforced (OOM Protection)', () => {
      const re = RE2JS.compile('.*a.*b.*c')

      // Artificially restrict the DFA state cache limit
      re.re2Input.dfa.stateLimit = 5

      // The DFA will run out of states and bailout gracefully, routing the rest
      // of the string to the NFA fallback without crashing or throwing OOM errors.
      expect(re.test('zzzaaazzzbbbzzzccczzz')).toBe(true)
    })
  })
})
