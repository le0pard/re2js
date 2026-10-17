import { expect, describe, it } from 'vitest'
import { Machine } from '../Machine.js'
import { RE2 } from '../RE2.js'
import { RE2JS, RE2Set } from '../index.js'

describe('Machine Sparse Array Queue', () => {
  it('avoids allocating objects per thread, tracking paths by indices instead', () => {
    // Compile a regex large enough to give us plenty of instructions/PCs to test
    const re = RE2.compile('a{1,50}')
    const machine = Machine.fromRE2(re)
    machine.init(0)

    // Queues should be instantiated as TypedArrays instead of Object Lists
    expect(machine.q0).toBeDefined()
    expect(machine.q0.sparse).toBeInstanceOf(Int32Array)
    expect(machine.q0.densePcs).toBeInstanceOf(Int32Array)

    // Add a PC (simulate NFA branch state)
    const slot = machine.q0.add(5)
    expect(slot).toBe(0)
    expect(machine.q0.size).toBe(1)
    expect(machine.q0.contains(5)).toBe(true)

    // Add another PC
    const slot2 = machine.q0.add(10)
    expect(slot2).toBe(1)
    expect(machine.q0.size).toBe(2)
    expect(machine.q0.contains(10)).toBe(true)

    // Clearing just resets the size boundary in O(1) time
    machine.q0.clear()
    expect(machine.q0.size).toBe(0)
    expect(machine.q0.contains(5)).toBe(false)

    // Prove GC Optimization: The array wasn't zeroed out, preventing V8 memory churn!
    expect(machine.q0.densePcs[0]).toBe(5)
  })

  it('safely handles stale integers inside the sparse array mapping', () => {
    // Compile a regex large enough to cover PC index 42
    const re = RE2.compile('a{1,50}')
    const machine = Machine.fromRE2(re)
    machine.init(0)

    machine.q0.add(42)
    expect(machine.q0.contains(42)).toBe(true)

    machine.q0.clear()

    // The stale index pointer `0` still lives in sparse[42], but because
    // size is now 0, the boundary check inside `contains()` natively rejects it.
    expect(machine.q0.sparse[42]).toBe(0)
    expect(machine.q0.contains(42)).toBe(false)
  })
})

describe('Machine Memory Isolation', () => {
  it('Machine submatches() returns isolated memory', () => {
    const re = RE2.compile('(a)')

    // findAllIndex internally reuses the exact same Machine and matchcap TypedArray
    const results = re.findAllIndex('a a', -1)

    expect(results).not.toBeNull()
    expect(results.length).toBe(2)

    const firstMatch = results[0]
    const secondMatch = results[1]

    // If submatches() incorrectly uses a view (like .subarray), they will share underlying memory.
    expect(firstMatch).not.toEqual(secondMatch)

    // Double-check memory references: mutating one array should NOT mutate the other.
    const originalVal = secondMatch[0]
    firstMatch[0] = 999

    expect(secondMatch[0]).toBe(originalVal)
  })
})

it('Machine submatches() returns isolated memory', () => {
  const re = RE2.compile('(a)')

  // findAllIndex reuses the exact same Machine and matchcap array internally
  const results = re.findAllIndex('a a', -1)

  expect(results).not.toBeNull()
  expect(results.length).toBe(2)

  const firstMatch = results[0]
  const secondMatch = results[1]

  // If submatches() incorrectly uses a view (like .subarray), they will have identical values.
  expect(firstMatch).not.toEqual(secondMatch)

  // Double-check memory references: mutating one should NOT mutate the other
  const originalVal = secondMatch[0]
  firstMatch[0] = 999

  expect(secondMatch[0]).toBe(originalVal)
})

describe('Machine Typed Array Bounds (Structure of Arrays)', () => {
  it('handles massive capture group counts without memory corruption', () => {
    // Generate 50 capture groups: (a)(b)(c)...
    const pattern = Array.from({ length: 50 })
      .map(() => '(a)')
      .join('')
    const re = RE2.compile(pattern)
    const input = 'a'.repeat(50)

    const match = re.findSubmatch(input)

    expect(match).not.toBeNull()
    expect(match.length).toBe(51) // 1 full match + 50 capture groups

    // Verify the 50th capture group safely extracted its boundary
    expect(match[50]).toBe('a')
  })
})

describe('Sparse Queue Priority', () => {
  it('maintains leftmost-first priority (Greedy vs Lazy) when dropping duplicate PCs', () => {
    // Greedy: The first (a*) should consume everything
    const reGreedy = RE2.compile('(a*)(a*)')
    const match1 = reGreedy.findSubmatch('aaaa')
    expect(match1[1]).toBe('aaaa')
    expect(match1[2]).toBe('')

    // Lazy: The first (a*?) should consume nothing, leaving it for the second
    const reLazy = RE2.compile('(a*?)(a*)')
    const match2 = reLazy.findSubmatch('aaaa')
    expect(match2[1]).toBe('')
    expect(match2[2]).toBe('aaaa')
  })
})

describe('Machine.add() uses an explicit stack (no recursion depth limit)', () => {
  // An alternation of n branches compiles to a chain of n ALT instructions and n nested groups to
  // n CAPTURE instructions. The recursive add() overflowed the JS stack at a few thousand of
  // either when the search ran on the NFA (inputs beyond the bit-state backtracker's limit).
  const alternatives = (n) =>
    Array.from({ length: n }, (_, i) => String.fromCodePoint(0x1000 + i) + 'x')
  // The bit-state backtracker handles inputs up to 256 Ki bits / numInst characters, so a few
  // dozen characters already send these large programs to the NFA; small programs need more.
  const nfaInput = (tail, zs = 50) => 'z'.repeat(zs) + tail

  it('finds a match among 20,000 alternatives through the NFA', () => {
    const re = RE2JS.compile(alternatives(20000).join('|'))
    const m = re.matcher(nfaInput(String.fromCodePoint(0x1000 + 19999) + 'x'))
    expect(m.find()).toBe(true)
    expect(m.start()).toBe(50)
    expect(m.group()).toBe(String.fromCodePoint(0x1000 + 19999) + 'x')
    expect(m.find()).toBe(false)
  })

  it('keeps leftmost-first priority across a wide alternation', () => {
    // 'ab' is listed before 'abc', so it wins even though 'abc' is longer
    const re = RE2JS.compile(['ab', ...alternatives(5000), 'abc'].join('|'))
    const m = re.matcher(nfaInput('abc'))
    expect(m.find()).toBe(true)
    expect(m.group()).toBe('ab')
    const longestFirst = RE2JS.compile(['abc', ...alternatives(5000), 'ab'].join('|'))
    const m2 = longestFirst.matcher(nfaInput('abc'))
    expect(m2.find()).toBe(true)
    expect(m2.group()).toBe('abc')
  })

  it('evaluates a wide alternation inside an RE2Set that falls back to the NFA', () => {
    const set = new RE2Set()
    // \\b makes the DFA decline the program; the ASCII 'k' prefix gives the boundary something
    // to hold against (RE2's \\b is ASCII-only).
    set.add(`\\bk(?:${alternatives(20000).join('|')})`)
    set.add('never')
    set.compile()
    expect(set.match(`z z k${String.fromCodePoint(0x1000 + 19999)}x`)).toEqual([0])
    expect(set.match(`zk${String.fromCodePoint(0x1000 + 19999)}x`)).toEqual([])
  })

  it('extracts thousands of optional capture groups (each one is on the closure path)', () => {
    // Every CAPTURE of (a?)(a?)... is reached while following empty arrows from the start, so
    // the recursive add() went one frame deeper per group and overflowed at about 3,000.
    expect(RE2JS.compile('(a?)'.repeat(3000)).exec('aaa')).toHaveLength(3001)
    const m = RE2JS.compile('(a?)'.repeat(5000)).matcher('a')
    expect(m.find()).toBe(true)
    expect(m.group(1)).toBe('a')
    expect(m.group(2)).toBe('')
    expect(m.group(5000)).toBe('')
  })

  it('restores capture slots in the right order for nested groups through the NFA', () => {
    const re = RE2JS.compile('('.repeat(999) + 'a' + ')'.repeat(999))
    const m = re.matcher(nfaInput('a', 1000))
    expect(m.find()).toBe(true)
    expect(m.start()).toBe(1000)
    expect(m.group(1)).toBe('a')
    expect(m.group(999)).toBe('a')
    // a sibling group after a failed nested branch must not keep a stale position
    const re2 = RE2JS.compile('(?:(b)|(a))(c)?')
    const m2 = re2.matcher(nfaInput('a', 100000))
    expect(m2.find()).toBe(true)
    expect(m2.group(1)).toBeNull()
    expect(m2.group(2)).toBe('a')
    expect(m2.group(3)).toBeNull()
  })

  it('handles lookbehind instructions in the same loop', () => {
    const re = RE2JS.compile(`(?<=q)(?:${alternatives(5000).join('|')})`, RE2JS.LOOKBEHINDS)
    const m = re.matcher(nfaInput(`q${String.fromCodePoint(0x1000)}x`))
    expect(m.find()).toBe(true)
    expect(m.start()).toBe(51)
  })
})

describe('Machine capture slots grow with the threads actually queued', () => {
  it('does not allocate numInst x ncap integers up front', () => {
    const re = RE2JS.compile(`^${'(a)'.repeat(3000)}`)
    const m = re.matcher('a'.repeat(3000))
    expect(m.find()).toBe(true)
    expect(m.group(3000)).toBe('a')
    const re2 = re.re2()
    const machine = re2.machinePool[0]
    expect(machine).toBeDefined()
    const ncap = 2 * (1 + re2.numberOfCapturingGroups())
    const eager = re2.numberOfInstructions() * ncap // what used to be allocated per queue
    // One live thread per position for this program: a few slots suffice
    expect(machine.q0.denseCaps.length).toBeLessThan(eager / 10)
    expect(machine.q1.denseCaps.length).toBeLessThan(eager / 10)
  })

  it('grows when many threads are queued at once and keeps every capture', () => {
    const re = RE2JS.compile('(a?)'.repeat(300))
    const m = re.matcher('a'.repeat(5000))
    expect(m.find()).toBe(true)
    expect(m.group(1)).toBe('a')
    expect(m.group(300)).toBe('a')
    const machine = re.re2().machinePool[0]
    const ncap = 2 * 301
    expect(machine.q0.denseCaps.length % ncap).toBe(0)
    expect(machine.q0.denseCaps.length).toBeLessThanOrEqual(re.re2().numberOfInstructions() * ncap)
  })
})
