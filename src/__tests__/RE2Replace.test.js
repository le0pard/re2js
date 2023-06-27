import { expect, describe, test } from '@jest/globals'
import { RE2 } from '../RE2'

describe('.compile', () => {
  const cases = [
    // Test empty input and/or replacement,
    // with pattern that matches the empty string.
    ['', '', '', '', false],
    ['', '', 'x', 'x', false],
    ['', 'abc', '', 'abc', false],
    ['', 'abc', 'x', 'xaxbxcx', false],

    // Test empty input and/or replacement,
    // with pattern that does not match the empty string.
    ['b', '', '', '', false],
    ['b', '', 'x', '', false],
    ['b', 'abc', '', 'ac', false],
    ['b', 'abc', 'x', 'axc', false],
    ['y', '', '', '', false],
    ['y', '', 'x', '', false],
    ['y', 'abc', '', 'abc', false],
    ['y', 'abc', 'x', 'abc', false],

    // Multibyte characters -- verify that we don't try to match in the middle
    // of a character.
    ['[a-c]*', '\u65e5', 'x', 'x\u65e5x', false],
    ['[^\u65e5]', 'abc\u65e5def', 'x', 'xxx\u65e5xxx', false],

    // Start and end of a string.
    ['^[a-c]*', 'abcdabc', 'x', 'xdabc', false],
    ['[a-c]*$', 'abcdabc', 'x', 'abcdx', false],
    ['^[a-c]*$', 'abcdabc', 'x', 'abcdabc', false],
    ['^[a-c]*', 'abc', 'x', 'x', false],
    ['[a-c]*$', 'abc', 'x', 'x', false],
    ['^[a-c]*$', 'abc', 'x', 'x', false],
    ['^[a-c]*', 'dabce', 'x', 'xdabce', false],
    ['[a-c]*$', 'dabce', 'x', 'dabcex', false],
    ['^[a-c]*$', 'dabce', 'x', 'dabce', false],
    ['^[a-c]*', '', 'x', 'x', false],
    ['[a-c]*$', '', 'x', 'x', false],
    ['^[a-c]*$', '', 'x', 'x', false],
    ['^[a-c]+', 'abcdabc', 'x', 'xdabc', false],
    ['[a-c]+$', 'abcdabc', 'x', 'abcdx', false],
    ['^[a-c]+$', 'abcdabc', 'x', 'abcdabc', false],
    ['^[a-c]+', 'abc', 'x', 'x', false],
    ['[a-c]+$', 'abc', 'x', 'x', false],
    ['^[a-c]+$', 'abc', 'x', 'x', false],
    ['^[a-c]+', 'dabce', 'x', 'dabce', false],
    ['[a-c]+$', 'dabce', 'x', 'dabce', false],
    ['^[a-c]+$', 'dabce', 'x', 'dabce', false],
    ['^[a-c]+', '', 'x', '', false],
    ['[a-c]+$', '', 'x', '', false],
    ['^[a-c]+$', '', 'x', '', false],

    // Other cases.
    ['abc', 'abcdefg', 'def', 'defdefg', false],
    ['bc', 'abcbcdcdedef', 'BC', 'aBCBCdcdedef', false],
    ['abc', 'abcdabc', '', 'd', false],
    ['x', 'xxxXxxx', 'xXx', 'xXxxXxxXxXxXxxXxxXx', false],
    ['abc', '', 'd', '', false],
    ['abc', 'abc', 'd', 'd', false],
    ['.+', 'abc', 'x', 'x', false],
    ['[a-c]*', 'def', 'x', 'xdxexfx', false],
    ['[a-c]+', 'abcbcdcdedef', 'x', 'xdxdedef', false],
    ['[a-c]*', 'abcbcdcdedef', 'x', 'xdxdxexdxexfx', false],

    // Test empty input and/or replacement,
    // with pattern that matches the empty string.
    ['', '', '', '', true],
    ['', '', 'x', 'x', true],
    ['', 'abc', '', 'abc', true],
    ['', 'abc', 'x', 'xabc', true],

    // Test empty input and/or replacement,
    // with pattern that does not match the empty string.
    ['b', '', '', '', true],
    ['b', '', 'x', '', true],
    ['b', 'abc', '', 'ac', true],
    ['b', 'abc', 'x', 'axc', true],
    ['y', '', '', '', true],
    ['y', '', 'x', '', true],
    ['y', 'abc', '', 'abc', true],
    ['y', 'abc', 'x', 'abc', true],

    // Multibyte characters -- verify that we don't try to match in the middle
    // of a character.
    ['[a-c]*', '\u65e5', 'x', 'x\u65e5', true],
    ['[^\u65e5]', 'abc\u65e5def', 'x', 'xbc\u65e5def', true],

    // Start and end of a string.
    ['^[a-c]*', 'abcdabc', 'x', 'xdabc', true],
    ['[a-c]*$', 'abcdabc', 'x', 'abcdx', true],
    ['^[a-c]*$', 'abcdabc', 'x', 'abcdabc', true],
    ['^[a-c]*', 'abc', 'x', 'x', true],
    ['[a-c]*$', 'abc', 'x', 'x', true],
    ['^[a-c]*$', 'abc', 'x', 'x', true],
    ['^[a-c]*', 'dabce', 'x', 'xdabce', true],
    ['[a-c]*$', 'dabce', 'x', 'dabcex', true],
    ['^[a-c]*$', 'dabce', 'x', 'dabce', true],
    ['^[a-c]*', '', 'x', 'x', true],
    ['[a-c]*$', '', 'x', 'x', true],
    ['^[a-c]*$', '', 'x', 'x', true],
    ['^[a-c]+', 'abcdabc', 'x', 'xdabc', true],
    ['[a-c]+$', 'abcdabc', 'x', 'abcdx', true],
    ['^[a-c]+$', 'abcdabc', 'x', 'abcdabc', true],
    ['^[a-c]+', 'abc', 'x', 'x', true],
    ['[a-c]+$', 'abc', 'x', 'x', true],
    ['^[a-c]+$', 'abc', 'x', 'x', true],
    ['^[a-c]+', 'dabce', 'x', 'dabce', true],
    ['[a-c]+$', 'dabce', 'x', 'dabce', true],
    ['^[a-c]+$', 'dabce', 'x', 'dabce', true],
    ['^[a-c]+', '', 'x', '', true],
    ['[a-c]+$', '', 'x', '', true],
    ['^[a-c]+$', '', 'x', '', true],

    // Other cases.
    ['abc', 'abcdefg', 'def', 'defdefg', true],
    ['bc', 'abcbcdcdedef', 'BC', 'aBCbcdcdedef', true],
    ['abc', 'abcdabc', '', 'dabc', true],
    ['x', 'xxxXxxx', 'xXx', 'xXxxxXxxx', true],
    ['abc', '', 'd', '', true],
    ['abc', 'abc', 'd', 'd', true],
    ['.+', 'abc', 'x', 'x', true],
    ['[a-c]*', 'def', 'x', 'xdef', true],
    ['[a-c]+', 'abcbcdcdedef', 'x', 'xdcdedef', true],
    ['[a-c]*', 'abcbcdcdedef', 'x', 'xdcdedef', true]
  ]

  test.concurrent.each(cases)(
    'pattern %p with input %p and replacement %p will return %p (only first: %p)',
    (pattern, input, replacement, expected, replaceFirst) => {
      const re = RE2.compile(pattern)
      expect(
        replaceFirst ? re.replaceFirst(input, replacement) : re.replaceAll(input, replacement)
      ).toEqual(expected)
    }
  )
})
