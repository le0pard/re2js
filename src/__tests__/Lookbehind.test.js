import { RE2JS } from '../index'
import { expect, describe, test } from '@jest/globals'

describe('Lookbehinds (Linear Time EPFL Algorithm)', () => {
  test('Positive Lookbehind', () => {
    const re = RE2JS.compile('(?<=foo)bar', RE2JS.LOOKBEHINDS)
    expect(re.test('foobar')).toBe(true)
    expect(re.test('bazbar')).toBe(false)

    const match = re.matcher('foobar')
    expect(match.find()).toBe(true)
    expect(match.group(0)).toBe('bar') // Group 0 correctly ignores the zero-width assertion!
  })

  test('Negative Lookbehind', () => {
    const re = RE2JS.compile('(?<!foo)bar', RE2JS.LOOKBEHINDS)
    expect(re.test('bazbar')).toBe(true)
    expect(re.test('foobar')).toBe(false)
  })

  test('Multiple lookbehinds', () => {
    const re = RE2JS.compile('(?<=a)(?<!b)c', RE2JS.LOOKBEHINDS)
    expect(re.test('ac')).toBe(true)
    expect(re.test('bc')).toBe(false)
    expect(re.test('xc')).toBe(false)
  })

  test('Lookbehinds are strictly opt-in', () => {
    // Will throw a syntax exception if the flag isn't provided
    expect(() => RE2JS.compile('(?<=foo)bar')).toThrow()
  })

  test('Does not capture groups inside lookbehinds (captureless algorithm)', () => {
    const re = RE2JS.compile('(?<=(foo))bar', RE2JS.LOOKBEHINDS)
    const match = re.matcher('foobar')
    expect(match.find()).toBe(true)
    expect(match.group(1)).toBeNull() // Group 1 should be safely ignored
  })
})
