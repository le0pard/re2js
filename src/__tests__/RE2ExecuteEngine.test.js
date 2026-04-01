import { RE2 } from '../RE2'
import { DFA } from '../DFA'
import { expect, describe, test, jest, afterEach } from '@jest/globals'

describe('RE2 executeEngine Routing', () => {
  test('routes to DFA for simple boolean match (ncap === 0)', () => {
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')
    const nfaSpy = jest.spyOn(RE2.prototype, 'doExecuteNFA')

    const re = RE2.compile('a+b+')

    // RE2.match passes ncap=0 because it doesn't need to extract capture groups
    const result = re.match('aaabbb')

    expect(result).toBe(true)
    expect(dfaSpy).toHaveBeenCalledTimes(1)
    expect(nfaSpy).not.toHaveBeenCalled()
  })

  test('routes directly to NFA when captures are required (ncap > 0)', () => {
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')
    const nfaSpy = jest.spyOn(RE2.prototype, 'doExecuteNFA')

    const re = RE2.compile('(a+)(b+)')

    // findSubmatch passes ncap > 0 to extract the capture groups
    const result = re.findSubmatch('aaabbb')

    expect(result).not.toBeNull()
    expect(result[1]).toEqual('aaa')
    expect(result[2]).toEqual('bbb')

    // DFA mathematically cannot handle captures, so it shouldn't even be invoked
    expect(dfaSpy).not.toHaveBeenCalled()
    expect(nfaSpy).toHaveBeenCalledTimes(1)
  })

  test('falls back to NFA when DFA bails out (e.g. \\b boundary)', () => {
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')
    const nfaSpy = jest.spyOn(RE2.prototype, 'doExecuteNFA')

    const re = RE2.compile('\\bword\\b')
    const result = re.match('word')

    expect(result).toBe(true)
    expect(dfaSpy).toHaveBeenCalledTimes(1)

    // DFA encounters EMPTY_WIDTH (\b) and returns null (bailout), triggering NFA fallback
    expect(nfaSpy).toHaveBeenCalledTimes(1)
  })

  test('falls back to NFA and flushes cache on DFA OOM', () => {
    const dfaSpy = jest.spyOn(DFA.prototype, 'match')
    const nfaSpy = jest.spyOn(RE2.prototype, 'doExecuteNFA')

    const re = RE2.compile('(a+)+b')

    // Out Of Memory exception
    re.dfa.stateLimit = 1

    const result = re.match('aaaaaab')

    expect(result).toBe(true)
    expect(dfaSpy).toHaveBeenCalledTimes(1)

    expect(nfaSpy).toHaveBeenCalledTimes(1)
  })
})
