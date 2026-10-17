import { expect, describe, it } from 'vitest'
import { RE2Flags } from '../RE2Flags.js'
import { PERL_GROUPS } from '../CharGroup.js'
import { CharClass } from '../CharClass.js'
import { Unicode } from '../Unicode.js'
import { UnicodeRangeTable } from '../UnicodeRangeTable.js'
import { Utils } from '../Utils.js'
import { codePoint } from '../__utils__/chars.js'
import { RE2JS } from '../index.js'

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

  it.each(cases)('input %p, returns %p', (input, expected) => {
    expect(new CharClass(input).cleanClass().toArray()).toEqual(new Int32Array(expected))
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

  it.each(cases)(
    'input %p, literal %p, flags %p, returns %p',
    (input, literal, flags, expected) => {
      expect(
        new CharClass(input.map(codePoint)).appendLiteral(codePoint(literal), flags).toArray()
      ).toEqual(new Int32Array(expected.map(codePoint)))
    }
  )
})

describe('.appendFoldedRange', () => {
  const cases = [
    // Range is full: folding can't add more.
    [10, Unicode.MAX_FOLD + 20, [10, Unicode.MAX_FOLD + 20]],
    // Range is outside folding possibilities.
    [codePoint(' '), codePoint('&'), [' ', '&'].map(codePoint)],
    // [lo, MIN_FOLD - 1] needs no folding.  Only [...abc] suffix is folded.
    [codePoint(' '), codePoint('C'), [' ', 'C', 'a', 'c'].map(codePoint)],
    // [MAX_FOLD...] needs no folding
    [
      0x1e853,
      0x1e9e4,
      [
        0x1e944,
        0x1e9e4,
        0x1e853,
        0x1e920, // Adlam Capital Letter
        0x1e920,
        0x1e943 // Adlam Small Letter
      ]
    ]
  ]

  it.each(cases)('lo %p, hi %p, returns %p', (lo, hi, expected) => {
    expect(new CharClass([]).appendFoldedRange(lo, hi).toArray()).toEqual(new Int32Array(expected))
  })
})

describe('.appendClass', () => {
  const cases = [
    [[], ['a', 'z'].map(codePoint), ['a', 'z'].map(codePoint)],
    [['a', 'f'].map(codePoint), ['c', 't'].map(codePoint), ['a', 't'].map(codePoint)],
    [['c', 't'].map(codePoint), ['a', 'f'].map(codePoint), ['a', 't'].map(codePoint)]
  ]

  it.each(cases)('input %p, append %p, returns %p', (input, append, expected) => {
    expect(new CharClass(input).appendClass(append).toArray()).toEqual(new Int32Array(expected))
  })
})

describe('.appendNegatedClass', () => {
  it('return expected runes', () => {
    expect(
      new CharClass(['d', 'e'].map(codePoint))
        .appendNegatedClass(['b', 'f'].map(codePoint))
        .toArray()
    ).toEqual(
      new Int32Array([
        codePoint('d'),
        codePoint('e'),
        0,
        codePoint('a'),
        codePoint('g'),
        Unicode.MAX_RUNE
      ])
    )
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

  it.each(cases)('input %p, append %p, returns %p', (input, append, expected) => {
    expect(new CharClass(input).appendFoldedClass(append).toArray()).toEqual(
      new Int32Array(expected)
    )
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

  it.each(cases)('input %p, returns %p', (input, expected) => {
    expect(new CharClass(input).negateClass().toArray()).toEqual(new Int32Array(expected))
  })
})

describe('.appendTable', () => {
  const cases = [
    [
      [],
      new UnicodeRangeTable(
        new Uint32Array([codePoint('a'), codePoint('z'), 1, codePoint('A'), codePoint('M'), 4])
      ),
      ['a', 'z', 'A', 'A', 'E', 'E', 'I', 'I', 'M', 'M'].map(codePoint)
    ],
    [
      [],
      new UnicodeRangeTable(new Uint32Array([codePoint('Ā'), codePoint('Į'), 2])),
      Utils.stringToRunes('ĀĀĂĂĄĄĆĆĈĈĊĊČČĎĎĐĐĒĒĔĔĖĖĘĘĚĚĜĜĞĞĠĠĢĢĤĤĦĦĨĨĪĪĬĬĮĮ')
    ],
    [
      [],
      new UnicodeRangeTable(new Uint32Array([codePoint('Ā') + 1, codePoint('Į') + 1, 2])),
      Utils.stringToRunes('āāăăąąććĉĉċċččďďđđēēĕĕėėęęěěĝĝğğġġģģĥĥħħĩĩīīĭĭįį')
    ]
  ]

  it.each(cases)('input %p, table %p, returns %p', (input, table, expected) => {
    expect(new CharClass(input).appendTable(table).toArray()).toEqual(new Int32Array(expected))
  })
})

describe('.appendNegatedTable', () => {
  it('return expected runes', () => {
    expect(
      new CharClass([])
        .appendNegatedTable(
          new UnicodeRangeTable(new Uint32Array([codePoint('b'), codePoint('f'), 1]))
        )
        .toArray()
    ).toEqual(new Int32Array([0, codePoint('a'), codePoint('g'), Unicode.MAX_RUNE]))
  })
})

describe('.appendGroup', () => {
  const cases = [
    [[], PERL_GROUPS.get('\\d'), ['0', '9'].map(codePoint)],
    [[], PERL_GROUPS.get('\\D'), [0, codePoint('/'), codePoint(':'), Unicode.MAX_RUNE]]
  ]

  it.each(cases)('input %p, group %p, returns %p', (input, group, expected) => {
    expect(new CharClass(input).appendGroup(group, false).toArray()).toEqual(
      new Int32Array(expected)
    )
  })
})

describe('.toString', () => {
  it('return correct string', () => {
    expect(new CharClass([10, 10, 12, 20]).toString()).toEqual('[0xa 0xc-0x14]')
    expect(new CharClass([10, 20, 30, 40]).toString()).toEqual('[0xa-0x14 0x1e-0x28]')
  })
})

describe('CharClass.sortRanges and cleanClass on large or adversarial input', () => {
  it('sorts by lo ascending and hi descending before merging', () => {
    const cc = new CharClass([5, 9, 5, 20, 1, 3, 30, 30, 21, 25])
    expect(Array.from(cc.cleanClass().toArray())).toEqual([1, 3, 5, 25, 30, 30])
  })

  it('cleans a large class given in reverse order', () => {
    const r = []
    for (let i = 20000; i >= 0; i--) {
      r.push(2 * i, 2 * i)
    }
    const out = new CharClass(r).cleanClass().toArray()
    expect(out.length).toBe(2 * 20001)
    expect(out[0]).toBe(0)
    expect(out[1]).toBe(0)
    expect(out[out.length - 2]).toBe(40000)
  })

  it('cleans a large class given in pseudo-random order with duplicates and overlaps', () => {
    let seed = 7
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff)
    const r = []
    for (let i = 0; i < 30000; i++) {
      const lo = next() % 100000
      r.push(lo, lo + (next() % 3))
    }
    const out = new CharClass(r).cleanClass().toArray()
    // Result is sorted, non-overlapping and non-abutting
    for (let i = 2; i < out.length; i += 2) {
      expect(out[i]).toBeGreaterThan(out[i - 1] + 1)
    }
    // and covers exactly the input runes
    const covered = new Set()
    for (let i = 0; i < r.length; i += 2) {
      for (let c = r[i]; c <= r[i + 1]; c++) {
        covered.add(c)
      }
    }
    let total = 0
    for (let i = 0; i < out.length; i += 2) {
      total += out[i + 1] - out[i] + 1
    }
    expect(total).toBe(covered.size)
  })

  it('compiles a 30,000-rune character class written in adversarial order', () => {
    // Every rune distinct and non-adjacent, so nothing coalesces while appending.
    let s = ''
    for (let i = 30000; i > 0; i--) {
      s += String.fromCodePoint(0x4e00 + 2 * ((i * 7919) % 30000))
    }
    const re = RE2JS.compile(`[${s}]`)
    expect(re.test(String.fromCodePoint(0x4e00))).toBe(true)
    expect(re.test(String.fromCodePoint(0x4e01))).toBe(false)
  })

  it('toGrowableArray() returns the backing array without copying and keeps it appendable', () => {
    const backing = [1, 2]
    const cc = new CharClass(backing)
    cc.appendRange(5, 6)
    const grown = cc.toGrowableArray()
    expect(grown).toBe(backing)
    expect(grown).toEqual([1, 2, 5, 6])
    expect(Array.from(new CharClass(grown).appendRange(9, 9).toArray())).toEqual([1, 2, 5, 6, 9, 9])
  })
})
