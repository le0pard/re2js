import { RE2 } from '../RE2'
import { DFA } from '../DFA'
import { Backtracker } from '../Backtracker'
import { OnePass } from '../OnePass'
import { expect, describe, test, jest } from '@jest/globals'

describe('RE2 executeEngine Routing', () => {
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
