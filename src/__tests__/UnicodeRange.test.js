import { Unicode } from '../Unicode'
import { UnicodeRangeTable } from '../UnicodeRangeTable'
import { expect, describe, test } from '@jest/globals'

describe('Unicode.is Range Lookups', () => {
  const mockTable = new UnicodeRangeTable(
    new Uint32Array([
      0x10,
      0x20,
      1, // Range inside Latin-1
      0x30,
      0x40,
      2, // Strided Range inside Latin-1
      0x200,
      0x300,
      1 // Range outside Latin-1
    ])
  )

  test('linear search handles ranges within the Latin-1 block correctly', () => {
    // Under Latin-1 Max (0xFF)
    expect(Unicode.is(mockTable, 0x05)).toBe(false) // Before range
    expect(Unicode.is(mockTable, 0x15)).toBe(true) // Inside normal range
    expect(Unicode.is(mockTable, 0x25)).toBe(false) // In gap
    expect(Unicode.is(mockTable, 0x30)).toBe(true) // Inside strided range
    expect(Unicode.is(mockTable, 0x31)).toBe(false) // Strided range gap
    expect(Unicode.is(mockTable, 0xff)).toBe(false) // Above range but in Latin-1
  })

  test('binary search handles ranges above the Latin-1 block', () => {
    // Above Latin-1 Max (> 0xFF)
    expect(Unicode.is(mockTable, 0x250)).toBe(true)
    expect(Unicode.is(mockTable, 0x400)).toBe(false)
  })
})
