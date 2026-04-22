import { Machine } from '../Machine'
import { RE2 } from '../RE2'
import { Inst } from '../Inst'
import { expect, describe, test } from '@jest/globals'

describe('Machine Thread Pooling', () => {
  test('allocates threads in chunks of 128 to improve V8 GC locality', () => {
    const re = RE2.compile('a')
    const machine = Machine.fromRE2(re)

    // Initialize the machine with 0 capture groups
    machine.init(0)

    // Verify initial state
    expect(machine.poolSize).toBe(0)
    expect(machine.pool.length).toBe(0)

    const inst = new Inst(Inst.MATCH)
    const thread1 = machine.alloc(inst)

    // Because poolSize was 0, it should have chunk-allocated 128 threads,
    // popped 1 for thread1, leaving exactly 127 in the pool.
    expect(machine.poolSize).toBe(127)
    expect(machine.pool.length).toBe(128)

    expect(thread1.inst).toBe(inst)
    expect(thread1.cap).toBeDefined()

    // Allocating again should just pop from the existing chunk without expanding the array
    machine.alloc(inst)
    expect(machine.poolSize).toBe(126)
    expect(machine.pool.length).toBe(128)
  })
})
