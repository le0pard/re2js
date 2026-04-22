import { DFA } from '../DFA'
import { Compiler } from '../Compiler'
import { Parser } from '../Parser'
import { RE2Flags } from '../RE2Flags'
import { MachineInput } from '../MachineInput'
import { expect, describe, test } from '@jest/globals'

const createDFA = (pattern, flags = RE2Flags.PERL) => {
  const re = Parser.parse(pattern, flags)
  const prog = Compiler.compileRegexp(re)
  return new DFA(prog)
}

const runDFA = (dfa, text, anchor = RE2Flags.UNANCHORED) => {
  const input = MachineInput.fromUTF16(text)
  return dfa.match(input, 0, anchor)
}

describe('DFA', () => {
  describe('Basic Matching', () => {
    const cases = [
      ['a', 'a', true],
      ['a', 'b', false],
      ['abc', 'abc', true],
      ['abc', 'xabcy', true],
      ['a+b+', 'aaabbb', true],
      ['a+b+', 'ab', true],
      ['a+b+', 'bbaa', false],
      ['[0-9]+', 'abc123def', true],
      ['[0-9]+', 'abcdef', false],
      ['a.*b', 'axyzb', true]
    ]

    test.concurrent.each(cases)(
      'pattern %p with input %p returns %p',
      (pattern, text, expected) => {
        const dfa = createDFA(pattern)
        expect(runDFA(dfa, text)).toEqual(expected)
      }
    )
  })

  describe('Anchored Matching', () => {
    const cases = [
      ['abc', 'abc', RE2Flags.ANCHOR_BOTH, true],
      ['abc', 'xabcy', RE2Flags.ANCHOR_BOTH, false],
      ['abc', 'abcxyz', RE2Flags.ANCHOR_START, true],
      ['abc', 'xyzabc', RE2Flags.ANCHOR_START, false],
      ['abc', 'xyzabc', RE2Flags.UNANCHORED, true]
    ]

    test.concurrent.each(cases)(
      'pattern %p with input %p (anchor %p) returns %p',
      (pattern, text, anchor, expected) => {
        const dfa = createDFA(pattern)
        expect(runDFA(dfa, text, anchor)).toEqual(expected)
      }
    )
  })

  describe('Case Insensitivity', () => {
    const cases = [
      ['abc', 'ABC', true],
      ['[a-z]+', 'HELLO', true],
      ['a+', 'AaA', true]
    ]

    test.concurrent.each(cases)(
      'pattern %p with input %p returns %p',
      (pattern, text, expected) => {
        const dfa = createDFA(pattern, RE2Flags.PERL | RE2Flags.FOLD_CASE)
        expect(runDFA(dfa, text)).toEqual(expected)
      }
    )
  })
})

describe('Bailout / Unsupported Features', () => {
  test('Bails out on lookaround or complex empty width assertions', () => {
    const dfa = createDFA('\\bword\\b')
    expect(runDFA(dfa, 'word')).toBeNull()
  })
})

describe('Memory Limit (ReDoS Protection)', () => {
  test('granular eviction allows completion for simple patterns despite low limits', () => {
    const dfa = createDFA('(a+)+b')
    // An NFA state combination for a simple query like (a+)+b is highly optimized
    // and will recycle very few unique DFA states. Setting the limit to 1 guarantees
    // it leverages granular eviction to complete successfully without permanently disabling.
    dfa.stateLimit = 1

    expect(runDFA(dfa, 'aaaaaab')).toBe(true)
  })

  test('flushes cache and falls back, permanently disabling after thrashing', () => {
    // A pattern and string that creates a continuously growing NFA state set,
    // guaranteeing a unique DFA state for every character.
    const dfa = createDFA('a.*b.*c.*d.*e.*f')
    dfa.stateLimit = 1

    // 1st to 5th attempt will flush the cache, increment cacheClears, and return null
    for (let i = 0; i < DFA.MAX_CACHE_CLEARS; i++) {
      expect(runDFA(dfa, 'abcdef')).toBeNull()
    }

    // After 5 clears, it officially sets failed = true
    expect(dfa.failed).toBe(true)

    // 6th attempt should return immediately with null
    expect(runDFA(dfa, 'abcdef')).toBeNull()
  })
})

describe('DFA Cache Transitions (Latin-1 & Dense Arrays)', () => {
  test('uses nextLatin1 array for ASCII and Latin-1 characters (<= 255)', () => {
    // 'a' is code 97, 'é' is code 233 (both fit in the 256-length Latin-1 flat array)
    const dfa = createDFA('aé')
    runDFA(dfa, 'aé')

    const startState = dfa.startState
    expect(startState).not.toBeNull()

    // 'a' transitions should be populated in the flat array
    const stateAfterA = startState.nextLatin1[97]
    expect(stateAfterA).not.toBeNull()

    // 'é' transitions should also be populated in the flat array
    const stateAfterE = stateAfterA.nextLatin1[233]
    expect(stateAfterE).not.toBeNull()

    // Ensure the dense arrays were never touched because everything fit in Latin-1
    expect(startState.transKeys.length).toBe(0)
    expect(stateAfterA.transKeys.length).toBe(0)
  })

  test('uses parallel transKeys and transVals arrays for Runes > 255', () => {
    // '€' is code 8364, which heavily exceeds the 255 limit
    const dfa = createDFA('€')
    runDFA(dfa, '€')

    const startState = dfa.startState
    expect(startState).not.toBeNull()

    // Should not be in Latin1 array (which only has 256 slots, so accessing 8364 is undefined)
    expect(startState.nextLatin1[8364]).toBeUndefined()

    // Should be pushed into the parallel dense arrays
    expect(startState.transKeys.length).toBeGreaterThan(0)
    expect(startState.transKeys[0]).toBe(8364) // Unanchored key is exactly the rune code
    expect(startState.transVals[0]).not.toBeNull() // Target state is saved
  })

  test('eviction properly clears Latin-1 flat arrays and resets dense array lengths to 0', () => {
    const dfa = createDFA('a.*b.*c.*d.*e.*f')

    // Run normally to parse successfully, generating and caching states
    runDFA(dfa, 'abcdef')

    // Verify the cache has populated transitions before we test eviction
    let preEvictionHasTransitions = false
    for (const bucket of dfa.stateCache.values()) {
      for (const state of bucket) {
        if (state.nextLatin1.some((x) => x !== null)) {
          preEvictionHasTransitions = true
        }
      }
    }
    expect(preEvictionHasTransitions).toBe(true)

    // Lower the limit and trigger the eviction sweep manually
    dfa.stateLimit = 4
    dfa.evictCache()

    // Inspect the remaining survivors in the cache to ensure all transition ties were fully severed
    let survivorCount = 0
    for (const bucket of dfa.stateCache.values()) {
      for (const state of bucket) {
        survivorCount++

        // Verify Latin-1 flat arrays were fully zeroed out using .fill(null)
        expect(state.nextLatin1.every((x) => x === null)).toBe(true)
        expect(state.nextLatin1Anchored.every((x) => x === null)).toBe(true)

        // Verify the GC-friendly zero-allocation truncation worked perfectly
        expect(state.transKeys.length).toBe(0)
        expect(state.transVals.length).toBe(0)
      }
    }

    // Ensure we actually checked some surviving states and didn't permanently bailout
    expect(survivorCount).toBeGreaterThan(0)
  })

  test('uses nextLatin1Anchored array when anchor is strictly enforced', () => {
    const dfa = createDFA('a')

    // Process input to populate cache
    runDFA(dfa, 'a', RE2Flags.ANCHOR_START)

    const startState = dfa.startState
    expect(startState).not.toBeNull()

    // The anchored array should be populated for 'a' (code 97)
    const stateAfterA = startState.nextLatin1Anchored[97]
    expect(stateAfterA).not.toBeNull()

    // The unanchored array should remain null because the engine explicitly evaluated anchored
    expect(startState.nextLatin1[97]).toBeNull()
  })

  test('dense arrays do not accumulate duplicates for the same transition', () => {
    // Append 'x' to prevent the DFA from early-exiting on the first Euro sign
    const dfa = createDFA('€+x')

    // Match a string with multiple Euro signs to trigger the same transition repeatedly
    runDFA(dfa, '€€€x')

    const startState = dfa.startState
    expect(startState).not.toBeNull()

    // Should only have pushed the key exactly once, reusing it for subsequent '€' runes
    expect(startState.transKeys.length).toBe(1)
    expect(startState.transKeys[0]).toBe(8364) // Euro sign is Rune 8364

    // The state it transitions to should also only have 1 key (looping back to itself)
    const nextState = startState.transVals[0]
    expect(nextState.transKeys.length).toBe(1)
    expect(nextState.transKeys[0]).toBe(8364)
  })
})
