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

  describe('Bailout / Unsupported Features', () => {
    test('Bails out on lookaround or complex empty width assertions', () => {
      const dfa = createDFA('\\bword\\b')
      expect(runDFA(dfa, 'word')).toBeNull()
    })
  })

  describe('Memory Limit (ReDoS Protection)', () => {
    test('return null', () => {
      // Force a complex nested repetition that generates massive states
      const dfa = createDFA('(a+)+b')
      // An NFA state combination for a simple query like (a+)+b is highly optimized
      // and will recycle very few unique DFA states. Setting the limit to 1 guarantees
      // it throws the memory limit exception gracefully on the very first character transition.
      dfa.stateLimit = 1

      expect(runDFA(dfa, 'aaaaaab')).toBeNull()
    })
  })
})
