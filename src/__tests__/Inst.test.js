import { Inst } from '../Inst'
import { RE2Flags } from '../RE2Flags'

describe('Inst', () => {
  it('formats lookbehind instructions correctly', () => {
    const writeInst = new Inst(Inst.LB_WRITE)
    writeInst.lb = 1
    writeInst.out = 10
    expect(writeInst.toString()).toBe('lbwrite 1 -> 10')

    const checkInst = new Inst(Inst.LB_CHECK)
    checkInst.lb = -2 // Negative lookbehind
    checkInst.out = 15
    checkInst.arg = 20
    expect(checkInst.toString()).toBe('lbcheck -2 -> 15, 20')
  })
})

describe('Inst.matchRune Array Search Logic', () => {
  it('correctly matches using the linear search fast-path (length 4)', () => {
    const inst = new Inst(Inst.RUNE)
    // [10, 20, 30, 40] represents the ranges 10-20 and 30-40
    inst.runes = [10, 20, 30, 40]
    inst.arg = 0 // No case folding

    // Test boundaries
    expect(inst.matchRune(9)).toBe(false)
    expect(inst.matchRune(10)).toBe(true) // Start of range 1
    expect(inst.matchRune(15)).toBe(true)
    expect(inst.matchRune(20)).toBe(true) // End of range 1

    expect(inst.matchRune(25)).toBe(false) // Gap

    expect(inst.matchRune(30)).toBe(true) // Start of range 2
    expect(inst.matchRune(35)).toBe(true)
    expect(inst.matchRune(41)).toBe(false)
  })

  it('correctly matches using binary search for large arrays (length > 8)', () => {
    const inst = new Inst(Inst.RUNE)
    // Length 10 (falls through to binary search)
    inst.runes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    inst.arg = 0

    // Test first, middle, and last ranges
    expect(inst.matchRune(9)).toBe(false)

    expect(inst.matchRune(15)).toBe(true) // In first range
    expect(inst.matchRune(45)).toBe(false) // In gap
    expect(inst.matchRune(55)).toBe(true) // In middle range
    expect(inst.matchRune(85)).toBe(false) // In gap
    expect(inst.matchRune(95)).toBe(true) // In last range

    expect(inst.matchRune(101)).toBe(false)
  })

  it('correctly handles case-folding single runes', () => {
    const inst = new Inst(Inst.RUNE)
    inst.runes = ['a'.codePointAt(0)]
    inst.arg = RE2Flags.FOLD_CASE // Enable case insensitivity

    // Should match both lowercase and uppercase 'a'
    expect(inst.matchRune('a'.codePointAt(0))).toBe(true)
    expect(inst.matchRune('A'.codePointAt(0))).toBe(true)
    expect(inst.matchRune('b'.codePointAt(0))).toBe(false)
  })

  it('safely handles empty rune arrays without undefined mathematical checks', () => {
    const inst = new Inst(Inst.RUNE)
    inst.runes = [] // Explicitly empty

    expect(inst.matchRune(97)).toBe(false)
    expect(inst.matchRunePos(97)).toBe(-1)
  })
})

describe('Inst.matchRunePos Branchless Binary Search', () => {
  it('correctly finds target indices for large rune arrays (length > 8)', () => {
    const inst = new Inst(Inst.RUNE)
    // 5 ranges (length 10 array) forces the branchless cmov algorithm
    inst.runes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

    // Out of bounds
    expect(inst.matchRunePos(9)).toBe(-1)
    expect(inst.matchRunePos(101)).toBe(-1)

    // Matches inside the ranges (returns the logical pair index, not the array index)
    expect(inst.matchRunePos(15)).toBe(0) // 1st range
    expect(inst.matchRunePos(35)).toBe(1) // 2nd range
    expect(inst.matchRunePos(55)).toBe(2) // 3rd range
    expect(inst.matchRunePos(75)).toBe(3) // 4th range
    expect(inst.matchRunePos(95)).toBe(4) // 5th range

    // Gaps between ranges
    expect(inst.matchRunePos(25)).toBe(-1)
    expect(inst.matchRunePos(45)).toBe(-1)
  })
})

describe('Inst.toString Formatting', () => {
  it('formats MATCH correctly for standard execution (arg === 0)', () => {
    const inst = new Inst(Inst.MATCH)
    inst.arg = 0 // Default behavior
    expect(inst.toString()).toBe('match')
  })

  it('formats MATCH correctly for Multi-Pattern Sets (arg > 0)', () => {
    const inst = new Inst(Inst.MATCH)
    inst.arg = 5 // Simulates the 6th regex added to an RE2Set
    expect(inst.toString()).toBe('match 5')
  })
})
