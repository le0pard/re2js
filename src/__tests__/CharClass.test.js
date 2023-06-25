import { expect, describe, test } from '@jest/globals'
import { RE2Flags } from '../RE2Flags'
import { PERL_GROUPS } from '../CharGroup'
import { CharClass } from '../CharClass'
import { Unicode } from '../Unicode'
import { Utils } from '../Utils'
import { codePoint } from '../__utils__/chars'

describe('.cleanClass', () => {
  const cases = [
    [[], []],
    [
      [10, 20, 10, 20, 10, 20],
      [10, 20]
    ],
    [
      [10, 20],
      [10, 20]
    ],
    [
      [10, 20, 20, 30],
      [10, 30]
    ],
    [
      [10, 20, 30, 40, 20, 30],
      [10, 40]
    ],
    [
      [0, 50, 20, 30],
      [0, 50]
    ],
    [
      [10, 11, 13, 14, 16, 17, 19, 20, 22, 23],
      [10, 11, 13, 14, 16, 17, 19, 20, 22, 23]
    ],
    [
      [13, 14, 10, 11, 22, 23, 19, 20, 16, 17],
      [10, 11, 13, 14, 16, 17, 19, 20, 22, 23]
    ],
    [
      [13, 14, 10, 11, 22, 23, 19, 20, 16, 17],
      [10, 11, 13, 14, 16, 17, 19, 20, 22, 23]
    ],
    [
      [13, 14, 10, 11, 22, 23, 19, 20, 16, 17, 5, 25],
      [5, 25]
    ],
    [
      [13, 14, 10, 11, 22, 23, 19, 20, 16, 17, 12, 21],
      [10, 23]
    ],
    [
      [0, Unicode.MAX_RUNE],
      [0, Unicode.MAX_RUNE]
    ],
    [
      [0, 50],
      [0, 50]
    ],
    [
      [50, Unicode.MAX_RUNE],
      [50, Unicode.MAX_RUNE]
    ]
  ]

  test.each(cases)('input %p, returns %p', (input, expected) => {
    expect(new CharClass(input).cleanClass().toArray()).toEqual(expected)
  })
})

describe('.appendLiteral', () => {
  const cases = [
    [[], 'a', 0, ['a', 'a']],
    [['a', 'f'], 'a', 0, ['a', 'f']],
    [['b', 'f'], 'a', 0, ['a', 'f']],
    [['a', 'f'], 'g', 0, ['a', 'g']],
    [['a', 'f'], 'A', 0, ['a', 'f', 'A', 'A']],
    [[], 'a', RE2Flags.FOLD_CASE, ['a', 'a', 'A', 'A']],
    [['a', 'f'], 'a', RE2Flags.FOLD_CASE, ['a', 'f', 'A', 'A']],
    [['b', 'f'], 'a', RE2Flags.FOLD_CASE, ['a', 'f', 'A', 'A']],
    [['a', 'f'], 'g', RE2Flags.FOLD_CASE, ['a', 'g', 'G', 'G']],
    [['a', 'f'], 'A', RE2Flags.FOLD_CASE, ['a', 'f', 'A', 'A']],
    // ' ' is beneath the MIN-MAX_FOLD range.
    [['a', 'f'], ' ', 0, ['a', 'f', ' ', ' ']],
    [['a', 'f'], ' ', RE2Flags.FOLD_CASE, ['a', 'f', ' ', ' ']]
  ]

  test.each(cases)(
    'input %p, literal %p, flags %p, returns %p',
    (input, literal, flags, expected) => {
      expect(
        new CharClass(input.map(codePoint)).appendLiteral(codePoint(literal), flags).toArray()
      ).toEqual(expected.map(codePoint))
    }
  )
})

describe('.appendFoldedRange', () => {
  const cases = [
    // Range is full: folding can't add more.
    [10, 0x10ff0, [10, 0x10ff0]],
    // Range is outside folding possibilities.
    [codePoint(' '), codePoint('&'), [' ', '&'].map(codePoint)],
    // [lo, MIN_FOLD - 1] needs no folding.  Only [...abc] suffix is folded.
    [codePoint(' '), codePoint('C'), [' ', 'C', 'a', 'c'].map(codePoint)]
    // // [MAX_FOLD...] needs no folding
    // [
    //   0x10400,
    //   0x104f0,
    //   [
    //     0x10450,
    //     0x104f0,
    //     0x10400,
    //     0x10426, // lowercase Deseret
    //     0x10426,
    //     0x1044f // uppercase Deseret, abutting.
    //   ]
    // ]
  ]

  test.each(cases)('lo %p, hi %p, returns %p', (lo, hi, expected) => {
    expect(new CharClass([]).appendFoldedRange(lo, hi).toArray()).toEqual(expected)
  })
})

describe('.appendClass', () => {
  const cases = [
    [[], ['a', 'z'].map(codePoint), ['a', 'z'].map(codePoint)],
    [['a', 'f'].map(codePoint), ['c', 't'].map(codePoint), ['a', 't'].map(codePoint)],
    [['c', 't'].map(codePoint), ['a', 'f'].map(codePoint), ['a', 't'].map(codePoint)]
  ]

  test.each(cases)('input %p, append %p, returns %p', (input, append, expected) => {
    expect(new CharClass(input).appendClass(append).toArray()).toEqual(expected)
  })
})

describe('.appendNegatedClass', () => {
  test('return expected runes', () => {
    expect(
      new CharClass(['d', 'e'].map(codePoint))
        .appendNegatedClass(['b', 'f'].map(codePoint))
        .toArray()
    ).toEqual([codePoint('d'), codePoint('e'), 0, codePoint('a'), codePoint('g'), Unicode.MAX_RUNE])
  })
})

describe('.appendFoldedClass', () => {
  // 0x17F is an old English long s (looks like an f) and folds to s.
  const s = String.fromCharCode(0x17f)
  // 0x212A is the Kelvin symbol and folds to k.
  const k = String.fromCharCode(0x212a)
  const cases = [
    [[], ['a', 'z'].map(codePoint), Utils.stringToRunes(`akAK${k}${k}lsLS${s}${s}tzTZ`)],
    [
      ['a', 'f'].map(codePoint),
      ['c', 't'].map(codePoint),
      Utils.stringToRunes(`akCK${k}${k}lsLS${s}${s}ttTT`)
    ],
    [
      ['c', 't'].map(codePoint),
      ['a', 'f'].map(codePoint),
      ['c', 't', 'a', 'f', 'A', 'F'].map(codePoint)
    ]
  ]

  test.each(cases)('input %p, append %p, returns %p', (input, append, expected) => {
    expect(new CharClass(input).appendFoldedClass(append).toArray()).toEqual(expected)
  })
})

describe('.negateClass', () => {
  const cases = [
    [[], [codePoint('\0'), Unicode.MAX_RUNE]],
    [
      ['A', 'Z'].map(codePoint),
      [codePoint('\0'), codePoint('@'), codePoint('['), Unicode.MAX_RUNE]
    ],
    [
      ['A', 'Z', 'a', 'z'].map(codePoint),
      [
        codePoint('\0'),
        codePoint('@'),
        codePoint('['),
        codePoint('`'),
        codePoint('{'),
        Unicode.MAX_RUNE
      ]
    ]
  ]

  test.each(cases)('input %p, returns %p', (input, expected) => {
    expect(new CharClass(input).negateClass().toArray()).toEqual(expected)
  })
})

describe('.appendTable', () => {
  const cases = [
    [
      [],
      [
        [codePoint('a'), codePoint('z'), 1],
        [codePoint('A'), codePoint('M'), 4]
      ],
      ['a', 'z', 'A', 'A', 'E', 'E', 'I', 'I', 'M', 'M'].map(codePoint)
    ],
    [
      [],
      [[codePoint('Ā'), codePoint('Į'), 2]],
      Utils.stringToRunes('ĀĀĂĂĄĄĆĆĈĈĊĊČČĎĎĐĐĒĒĔĔĖĖĘĘĚĚĜĜĞĞĠĠĢĢĤĤĦĦĨĨĪĪĬĬĮĮ')
    ],
    [
      [],
      [[codePoint('Ā') + 1, codePoint('Į') + 1, 2]],
      Utils.stringToRunes('āāăăąąććĉĉċċččďďđđēēĕĕėėęęěěĝĝğğġġģģĥĥħħĩĩīīĭĭįį')
    ]
  ]

  test.each(cases)('input %p, table %p, returns %p', (input, table, expected) => {
    expect(new CharClass(input).appendTable(table).toArray()).toEqual(expected)
  })
})

describe('.appendNegatedTable', () => {
  test('return expected runes', () => {
    expect(
      new CharClass([]).appendNegatedTable([[codePoint('b'), codePoint('f'), 1]]).toArray()
    ).toEqual([0, codePoint('a'), codePoint('g'), Unicode.MAX_RUNE])
  })
})

describe('.appendGroup', () => {
  const cases = [
    [[], PERL_GROUPS.get('\\d'), ['0', '9'].map(codePoint)],
    [[], PERL_GROUPS.get('\\D'), [0, codePoint('/'), codePoint(':'), Unicode.MAX_RUNE]]
  ]

  test.each(cases)('input %p, group %p, returns %p', (input, group, expected) => {
    expect(new CharClass(input).appendGroup(group, false).toArray()).toEqual(expected)
  })
})

describe('.toString', () => {
  test('return correct string', () => {
    expect(new CharClass([10, 10, 12, 20]).toString()).toEqual('[0xa 0xc-0x14]')
    expect(new CharClass([10, 20, 30, 40]).toString()).toEqual('[0xa-0x14 0x1e-0x28]')
  })
})
