import { MachineInput } from '../MachineInput'
import { expect, describe, test } from '@jest/globals'

describe('MachineUTF16Input Boundary Checks', () => {
  test('does not report literal prefix matches that exceed the bounded substring', () => {
    // We are searching the string "abcdef", but bounded to end at index 3 ("abc")
    const input = MachineInput.fromUTF16('abcdef', 0, 3)

    // Dummy RE2 instance looking for the prefix "cde"
    const mockRE2 = { prefix: 'cde' }

    // "cde" starts at index 2 (within bounds), but ends at index 5 (out of bounds).
    // The engine must safely reject it and return -1.
    expect(input.index(mockRE2, 0)).toBe(-1)
  })
})
