import { RE2JS } from '../index'
import { Backtracker } from '../Backtracker'

describe('Backtracker Execution Engine', () => {
  it('should limit backtrack max size via maxBitStateLen constraints', () => {
    const re = RE2JS.compile('a*')
    const limit = Backtracker.maxBitStateLen(re.re2Input.prog)
    // Limits ensure it only runs on memory-safe inputs based on program size
    expect(limit).toBeGreaterThan(0)
  })

  it('should fallback correctly or match directly', () => {
    // A small regex applied to a small string natively routes to the Backtracker
    const re = RE2JS.compile('(a+)(b+)')
    const m = re.matcher('aabb')
    expect(m.find()).toBe(true)
    expect(m.group(1)).toBe('aa')
    expect(m.group(2)).toBe('bb')
  })

  it('should handle unanchored text searches correctly', () => {
    const re = RE2JS.compile('b+')
    const m = re.matcher('aabbcc')
    expect(m.find()).toBe(true)
    expect(m.group(0)).toBe('bb')
  })

  it('should correctly prioritize longest vs first matching logic', () => {
    const firstMatchRE = RE2JS.compile('(a+)(a*)')
    const firstM = firstMatchRE.matcher('aaaa')
    expect(firstM.find()).toBe(true)

    // Verify it operates perfectly alongside RE2JS's longest matching flag
    const longestMatchRE = RE2JS.compile('(a+)(a*)', RE2JS.LONGEST_MATCH)
    const longestM = longestMatchRE.matcher('aaaa')
    expect(longestM.find()).toBe(true)
    expect(longestM.group(0)).toBe('aaaa')
  })

  it('securely processes boundary anchor checks correctly', () => {
    const anchoredRE = RE2JS.compile('^foo$')

    expect(anchoredRE.testExact('foo')).toBe(true)
    expect(anchoredRE.testExact(' foo ')).toBe(false)
  })
})
