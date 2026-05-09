import { expect, describe, it } from 'vitest'
import { MachineInput } from '../MachineInput.js'

describe('MachineUTF16Input Boundary Checks', () => {
  it('does not report literal prefix matches that exceed the bounded substring', () => {
    // We are searching the string "abcdef", but bounded to end at index 3 ("abc")
    const input = MachineInput.fromUTF16('abcdef', 0, 3)

    // Dummy RE2 instance looking for the prefix "cde"
    const mockRE2 = { prefix: 'cde' }

    // "cde" starts at index 2 (within bounds), but ends at index 5 (out of bounds).
    // The engine must safely reject it and return -1.
    expect(input.index(mockRE2, 0)).toBe(-1)
  })
})

it('MachineUTF8Input.indexOf fallback works without native .indexOf', () => {
  // UTF-8 representation of "hello world"
  const buffer = new Uint8Array([104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100])
  // UTF-8 representation of "world"
  const target = new Uint8Array([119, 111, 114, 108, 100])

  // Mask the native indexOf to force the manual fallback
  const originalIndexOf = buffer.indexOf
  buffer.indexOf = null

  try {
    const input = MachineInput.fromUTF8(buffer)
    const index = input.indexOf(buffer, target, 0)

    expect(index).toBe(6)

    // Test not found condition
    const notFoundTarget = new Uint8Array([122, 122]) // "zz"
    expect(input.indexOf(buffer, notFoundTarget, 0)).toBe(-1)
  } finally {
    // Restore the native function so we don't pollute the Vitest environment
    buffer.indexOf = originalIndexOf
  }
})
