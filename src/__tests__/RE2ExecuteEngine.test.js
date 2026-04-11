import { RE2 } from '../RE2'
import { DFA } from '../DFA'
import { Backtracker } from '../Backtracker'
import { RE2Flags } from '../RE2Flags'
import { MachineInput } from '../MachineInput'
import { OnePass } from '../OnePass'
import { Prefilter } from '../Prefilter'
import { expect, describe, test, jest } from '@jest/globals'

describe('Literal Fast-Path Routing', () => {
  test('bails out early using literal fast path for strictly literal unanchored regexes', () => {
    const prefilterSpy = jest.spyOn(Prefilter.prototype, 'eval')
    const onePassSpy = jest.spyOn(OnePass, 'execute')
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')
    const nfaSpy = jest.spyOn(RE2.prototype, 'doExecuteNFA')

    const re = RE2.compile('hello')
    const result = re.match('say hello world')

    expect(result).toBe(true)

    // Prove that NO execution engines (not even the prefilter analyzer) were spun up!
    expect(prefilterSpy).not.toHaveBeenCalled()
    expect(onePassSpy).not.toHaveBeenCalled()
    expect(dfaSpy).not.toHaveBeenCalled()
    expect(nfaSpy).not.toHaveBeenCalled()
  })

  test('literal fast path correctly calculates capture boundaries', () => {
    const re = RE2.compile('world')
    const result = re.findSubmatch('hello world!')

    expect(result).not.toBeNull()
    expect(result[0]).toBe('world')
  })

  test('literal fast path skips when captures are requested on non-zero subexp literal', () => {
    const backtrackerSpy = jest.spyOn(Backtracker, 'execute')

    // This is structurally a literal ("world"), but it has a capture group!
    // The literal fast path MUST safely route this to the backtracker so group boundaries are populated.
    const re = RE2.compile('(world)')
    expect(re.prefixComplete).toBe(true)

    const result = re.findSubmatch('hello world!')

    expect(result).not.toBeNull()
    expect(result[1]).toBe('world')

    // It should have safely routed to backtracker because ncap > 0 and numSubexp > 0
    expect(backtrackerSpy).toHaveBeenCalledTimes(1)
  })

  test('literal fast path perfectly handles ANCHOR_BOTH (testExact)', () => {
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')

    const re = RE2.compile('hello')
    // Valid match

    // Test Exact uses ANCHOR_BOTH implicitly
    const matchInput = MachineInput.fromUTF16('hello')
    expect(re.executeEngine(matchInput, 0, RE2Flags.ANCHOR_BOTH, 0)).not.toBeNull()

    // Invalid matches
    const noMatchInput1 = MachineInput.fromUTF16('hello world')
    expect(re.executeEngine(noMatchInput1, 0, RE2Flags.ANCHOR_BOTH, 0)).toBeNull()

    const noMatchInput2 = MachineInput.fromUTF16('say hello')
    expect(re.executeEngine(noMatchInput2, 0, RE2Flags.ANCHOR_BOTH, 0)).toBeNull()

    // DFA was never used, handled strictly by fast-path
    expect(dfaSpy).not.toHaveBeenCalled()
  })
})

describe('Memory Management', () => {
  it('should safely recycle NFA threads without TypedArray zero-length deadlocks', () => {
    const re = RE2.compile('\\b(a+)\\b')

    // Access .prog directly because this is an RE2 instance, not an RE2JS wrapper
    const limit = Backtracker.maxBitStateLen(re.prog)
    const matchString = 'a'.repeat(limit + 10)
    const longString = ` ${matchString} `

    expect(re.match(longString)).toBe(true)

    const match = re.findSubmatch(longString)
    expect(match).not.toBeNull()
    expect(match[1]).toEqual(matchString)
  })
})
