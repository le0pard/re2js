import { expect, describe, it } from 'vitest'
import { Machine } from '../Machine.js'
import { RE2 } from '../RE2.js'

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
