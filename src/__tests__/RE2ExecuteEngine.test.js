import { RE2 } from '../RE2'
import { DFA } from '../DFA'
import { Backtracker } from '../Backtracker'
import { RE2Flags } from '../RE2Flags'
import { MachineInput } from '../MachineInput'
import { OnePass } from '../OnePass'
import { expect, describe, test, jest } from '@jest/globals'

describe('RE2 executeEngine Routing', () => {
  test('bails out early without invoking any engines if prefilter fails', () => {
    const onePassSpy = jest.spyOn(OnePass, 'execute')
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')
    const backtrackerSpy = jest.spyOn(Backtracker, 'execute')
    const nfaSpy = jest.spyOn(RE2.prototype, 'doExecuteNFA')

    // Prefilter will extract AND(EXACT("error"), EXACT("critical"))
    const re = RE2.compile('error.*critical')

    // Missing "critical", prefilter should instantly reject it using indexOf
    const result = re.match('There was an error but it was minor')

    expect(result).toBe(false)

    // Prove that NO execution engines were ever spun up!
    expect(onePassSpy).not.toHaveBeenCalled()
    expect(dfaSpy).not.toHaveBeenCalled()
    expect(backtrackerSpy).not.toHaveBeenCalled()
    expect(nfaSpy).not.toHaveBeenCalled()
  })

  test('proceeds to execution engines if prefilter succeeds', () => {
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')

    const re = RE2.compile('error.*critical')
    // Both required strings are present
    const result = re.match('There was an error that was critical')

    expect(result).toBe(true)

    // The prefilter approved it, so it correctly handed execution off to the DFA
    expect(dfaSpy).toHaveBeenCalledTimes(1)
  })

  test('bypasses prefilter completely for strictly anchored matches', () => {
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')

    const re = RE2.compile('^error.*critical$')

    // Test exact anchored routing directly on the RE2 engine
    const input = MachineInput.fromUTF16('error')
    const result = re.executeEngine(input, 0, RE2Flags.ANCHOR_BOTH, 0)

    expect(result).toBeNull() // execution returns null because it failed the match

    // Because it was anchored, the prefilter skipped evaluation and the DFA handled the rejection
    expect(dfaSpy).toHaveBeenCalledTimes(1)
  })

  test('routes directly to OnePass when regex is 1-unambiguous', () => {
    const onePassSpy = jest.spyOn(OnePass, 'execute')
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')
    const backtrackerSpy = jest.spyOn(Backtracker, 'execute')
    const nfaSpy = jest.spyOn(RE2.prototype, 'doExecuteNFA')

    const re = RE2.compile('^a(b|c)d$')
    const result = re.findSubmatch('abd')

    expect(result).not.toBeNull()
    expect(result[1]).toEqual('b')

    // OnePass perfectly supports capture groups and is mathematically guaranteed
    // to be the fastest engine, so it intercepts execution entirely!
    expect(onePassSpy).toHaveBeenCalledTimes(1)
    expect(dfaSpy).not.toHaveBeenCalled()
    expect(backtrackerSpy).not.toHaveBeenCalled()
    expect(nfaSpy).not.toHaveBeenCalled()
  })

  test('routes to DFA for simple boolean match (ncap === 0)', () => {
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')
    const backtrackerSpy = jest.spyOn(Backtracker, 'execute')
    const nfaSpy = jest.spyOn(RE2.prototype, 'doExecuteNFA')

    const re = RE2.compile('a+b+')
    const result = re.match('aaabbb')

    expect(result).toBe(true)
    expect(dfaSpy).toHaveBeenCalledTimes(1)
    expect(backtrackerSpy).not.toHaveBeenCalled()
    expect(nfaSpy).not.toHaveBeenCalled()
  })

  test('routes directly to Backtracker when captures are required and text is short', () => {
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')
    const backtrackerSpy = jest.spyOn(Backtracker, 'execute')
    const nfaSpy = jest.spyOn(RE2.prototype, 'doExecuteNFA')

    const re = RE2.compile('(a+)(b+)')
    const result = re.findSubmatch('aaabbb')

    expect(result).not.toBeNull()
    expect(result[1]).toEqual('aaa')
    expect(result[2]).toEqual('bbb')

    // DFA mathematically cannot handle captures, so it skips to the next fast path (Backtracker)
    expect(dfaSpy).not.toHaveBeenCalled()
    expect(backtrackerSpy).toHaveBeenCalledTimes(1)
    expect(nfaSpy).not.toHaveBeenCalled()
  })

  test('falls back to Backtracker when DFA bails out (e.g. \\b boundary)', () => {
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')
    const backtrackerSpy = jest.spyOn(Backtracker, 'execute')
    const nfaSpy = jest.spyOn(RE2.prototype, 'doExecuteNFA')

    const re = RE2.compile('\\bword\\b')
    const result = re.match('word')

    expect(result).toBe(true)
    expect(dfaSpy).toHaveBeenCalledTimes(1)
    // DFA encouters EMPTY_WIDTH (\b) and bails out -> intercepts safely at Backtracker
    expect(backtrackerSpy).toHaveBeenCalledTimes(1)
    expect(nfaSpy).not.toHaveBeenCalled()
  })

  test('falls back to NFA when text exceeds maxBitStateLen', () => {
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')
    const backtrackerSpy = jest.spyOn(Backtracker, 'execute')
    const nfaSpy = jest.spyOn(RE2.prototype, 'doExecuteNFA')

    const re = RE2.compile('(a+)+b')
    re.dfa.stateLimit = 1

    // FIX: Access .prog directly because this is an RE2 instance, not an RE2JS wrapper
    const limit = Backtracker.maxBitStateLen(re.prog)
    const longString = `${'a'.repeat(limit + 10)}b`

    const result = re.match(longString)

    expect(result).toBe(true)
    expect(dfaSpy).toHaveBeenCalledTimes(1)
    // Exceeded bounds -> Skips Backtracker
    expect(backtrackerSpy).not.toHaveBeenCalled()
    // Ultimately executes successfully on NFA fallback
    expect(nfaSpy).toHaveBeenCalledTimes(1)
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
