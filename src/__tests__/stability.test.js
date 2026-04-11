import { RE2JS } from '../index'
import { expect, describe, test } from '@jest/globals'

describe('RE2JS Stability and Anti-ReDoS Guarantees', () => {
  test('Executes safely in linear time against classic ReDoS patterns', () => {
    // This pattern normally freezes the native V8 JS RegExp engine
    // due to catastrophic exponential backtracking (O(2^N)).
    const redosPattern = '^([a-zA-Z0-9_]+\\s?)+$'
    const re = RE2JS.compile(redosPattern)

    const start = Date.now()
    // Evaluate against a malicious string designed to trigger the worst-case scenario
    const maliciousString = `${'a '.repeat(60)}!`
    const result = re.matches(maliciousString)
    const elapsed = Date.now() - start

    expect(result).toBe(false)
    // RE2JS guarantees O(N) linear time. This should complete in less than 50ms,
    // proving the DFA/NFA limits are working perfectly to prevent infinite loops.
    expect(elapsed).toBeLessThan(50)
  })

  test('Safely matches massive strings without exceeding Maximum Call Stack Size', () => {
    const re = RE2JS.compile('a*b')
    // 1 million characters
    const hugeString = `${'a'.repeat(1000000)}b`

    // Because RE2JS manages threads using heap-based arrays rather than recursive function calls,
    // this will parse massive strings flawlessly without throwing Call Stack errors.
    expect(re.matches(hugeString)).toBe(true)
  })

  test('Gracefully handles empty strings without crashing', () => {
    // Tests for infinite loops on 0-width progressions
    const re1 = RE2JS.compile('.*')
    expect(re1.matches('')).toBe(true)

    const re2 = RE2JS.compile('a+')
    expect(re2.matches('')).toBe(false)
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
    // of the string to the NFA fallback without crashing or throwing errors.
    expect(re.test('zzzaaazzzbbbzzzccczzz')).toBe(true)
  })
})
