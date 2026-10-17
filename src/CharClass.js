import { RE2Flags } from './RE2Flags.js'
import { Unicode } from './Unicode.js'
import { Utils } from './Utils.js'
/**
 * A "builder"-style helper class for manipulating character classes represented as an array of
 * pairs of runes [lo, hi], each denoting an inclusive interval.
 *
 * All methods mutate the internal state and return {@code this}, allowing operations to be chained.
 */
class CharClass {
  // Exposed, since useful for debugging CharGroups too.
  static charClassToString(r, len) {
    let result = '['
    for (let i = 0; i < len; i += 2) {
      if (i > 0) {
        result += ' '
      }
      const lo = r[i]
      const hi = r[i + 1]
      if (lo === hi) {
        result += `0x${lo.toString(16)}`
      } else {
        result += `0x${lo.toString(16)}-0x${hi.toString(16)}`
      }
    }
    result += ']'
    return result
  }

  // sortRanges() sorts the first |len| elements of |array|, taken as [lo, hi] pairs, by lo
  // increasing and hi decreasing to break ties (Go: sort.Sort(ranges{rp})). It relies on the
  // runtime's O(n log n) sort instead of a hand-written recursive quicksort, whose recursion
  // depth and comparison count grew linearly and quadratically with adversarial input.
  // Precondition: |len| is even.
  static sortRanges(array, len) {
    const n = len >> 1
    const order = new Array(n)
    for (let i = 0; i < n; i++) {
      order[i] = i
    }
    order.sort((a, b) => array[2 * a] - array[2 * b] || array[2 * b + 1] - array[2 * a + 1])
    const sorted = array.slice(0, len)
    for (let i = 0; i < n; i++) {
      array[2 * i] = sorted[2 * order[i]]
      array[2 * i + 1] = sorted[2 * order[i] + 1]
    }
  }

  constructor(r = Utils.emptyInts()) {
    this.r = r // inclusive ranges, pairs of [lo,hi].  r.length is even.
    this.len = r.length // prefix of |r| that is defined.  Even.
  }

  // Returns the character class as an int array.  Subsequent CharClass
  // operations may mutate this array, so typically this is the last operation
  // performed on a given CharClass instance.
  toArray() {
    if (this.r instanceof Int32Array) {
      return this.len === this.r.length ? this.r : this.r.subarray(0, this.len)
    }

    return new Int32Array(this.len === this.r.length ? this.r : this.r.slice(0, this.len))
  }

  // Returns the character class as a plain array that further CharClass operations can keep
  // appending to, without copying when the class is already backed by one. Used by the parser
  // while a class is being accumulated; toArray() produces the final form.
  toGrowableArray() {
    if (Array.isArray(this.r)) {
      this.r.length = this.len
      return this.r
    }
    return Array.from(this.r.subarray(0, this.len))
  }

  // cleanClass() sorts the ranges (pairs of elements) of this CharClass,
  // merges them, and eliminates duplicates.
  cleanClass() {
    if (this.len < 4) {
      return this
    }
    // Sort by lo increasing, hi decreasing to break ties.
    CharClass.sortRanges(this.r, this.len)
    // Merge abutting, overlapping.
    let w = 2 // write index
    for (let i = 2; i < this.len; i += 2) {
      {
        const lo = this.r[i]
        const hi = this.r[i + 1]
        if (lo <= this.r[w - 1] + 1) {
          // merge with previous range
          if (hi > this.r[w - 1]) {
            this.r[w - 1] = hi
          }
          continue
        }
        // new disjoint range
        this.r[w] = lo
        this.r[w + 1] = hi
        w += 2
      }
    }
    this.len = w
    return this
  }

  // appendLiteral() appends the literal |x| to this CharClass.
  appendLiteral(x, flags) {
    return (flags & RE2Flags.FOLD_CASE) !== 0
      ? this.appendFoldedRange(x, x)
      : this.appendRange(x, x)
  }

  // appendRange() appends the range [lo-hi] (inclusive) to this CharClass.
  appendRange(lo, hi) {
    // Expand last range or next to last range if it overlaps or abuts.
    // Checking two ranges helps when appending case-folded
    // alphabets, so that one range can be expanding A-Z and the
    // other expanding a-z.
    if (this.len > 0) {
      for (let i = 2; i <= 4; i += 2) {
        // twice, using i=2, i=4
        if (this.len >= i) {
          const rlo = this.r[this.len - i]
          const rhi = this.r[this.len - i + 1]
          if (lo <= rhi + 1 && rlo <= hi + 1) {
            if (lo < rlo) {
              this.r[this.len - i] = lo
            }
            if (hi > rhi) {
              this.r[this.len - i + 1] = hi
            }
            return this
          }
        }
      }
    }

    this.r[this.len++] = lo
    this.r[this.len++] = hi
    return this
  }

  // appendFoldedRange() appends the range [lo-hi] and its case
  // folding-equivalent runes to this CharClass.
  appendFoldedRange(lo, hi) {
    // Optimizations.
    if (lo <= Unicode.MIN_FOLD && hi >= Unicode.MAX_FOLD) {
      // Range is full: folding can't add more.
      return this.appendRange(lo, hi)
    }
    if (hi < Unicode.MIN_FOLD || lo > Unicode.MAX_FOLD) {
      // Range is outside folding possibilities.
      return this.appendRange(lo, hi)
    }
    if (lo < Unicode.MIN_FOLD) {
      // [lo, minFold-1] needs no folding.
      this.appendRange(lo, Unicode.MIN_FOLD - 1)
      lo = Unicode.MIN_FOLD
    }
    if (hi > Unicode.MAX_FOLD) {
      // [maxFold+1, hi] needs no folding.
      this.appendRange(Unicode.MAX_FOLD + 1, hi)
      hi = Unicode.MAX_FOLD
    }

    // Brute force.  Depend on appendRange to coalesce ranges on the fly.
    for (let c = lo; c <= hi; c++) {
      this.appendRange(c, c)

      for (let f = Unicode.simpleFold(c); f !== c; f = Unicode.simpleFold(f)) {
        this.appendRange(f, f)
      }
    }
    return this
  }

  // appendClass() appends the class |x| to this CharClass.
  // It assumes |x| is clean.  Does not mutate |x|.
  appendClass(x) {
    for (let i = 0; i < x.length; i += 2) {
      this.appendRange(x[i], x[i + 1])
    }
    return this
  }

  // appendFoldedClass() appends the case folding of the class |x| to this
  // CharClass.  Does not mutate |x|.
  appendFoldedClass(x) {
    for (let i = 0; i < x.length; i += 2) {
      this.appendFoldedRange(x[i], x[i + 1])
    }
    return this
  }

  // appendNegatedClass() append the negation of the class |x| to this
  // CharClass.  It assumes |x| is clean.  Does not mutate |x|.
  appendNegatedClass(x) {
    let nextLo = 0
    for (let i = 0; i < x.length; i += 2) {
      const lo = x[i]
      const hi = x[i + 1]
      if (nextLo <= lo - 1) {
        this.appendRange(nextLo, lo - 1)
      }
      nextLo = hi + 1
    }
    if (nextLo <= Unicode.MAX_RUNE) {
      this.appendRange(nextLo, Unicode.MAX_RUNE)
    }
    return this
  }

  // appendTable() appends the Unicode range table |table| to this CharClass.
  // Does not mutate |table|.
  appendTable(table) {
    for (let i = 0; i < table.length; ++i) {
      const lo = table.getLo(i)
      const hi = table.getHi(i)
      const stride = table.getStride(i)
      if (stride === 1) {
        this.appendRange(lo, hi)
        continue
      }
      for (let c = lo; c <= hi; c += stride) {
        this.appendRange(c, c)
      }
    }
    return this
  }

  // appendNegatedTable() returns the result of appending the negation of range
  // table |table| to this CharClass.  Does not mutate |table|.
  appendNegatedTable(table) {
    let nextLo = 0
    for (let i = 0; i < table.length; ++i) {
      const lo = table.getLo(i)
      const hi = table.getHi(i)
      const stride = table.getStride(i)
      if (stride === 1) {
        if (nextLo <= lo - 1) {
          this.appendRange(nextLo, lo - 1)
        }
        nextLo = hi + 1
        continue
      }
      for (let c = lo; c <= hi; c += stride) {
        if (nextLo <= c - 1) {
          this.appendRange(nextLo, c - 1)
        }
        nextLo = c + 1
      }
    }
    if (nextLo <= Unicode.MAX_RUNE) {
      this.appendRange(nextLo, Unicode.MAX_RUNE)
    }
    return this
  }

  // appendTableWithSign() calls append{,Negated}Table depending on sign.
  // Does not mutate |table|.
  appendTableWithSign(table, sign) {
    return sign < 0 ? this.appendNegatedTable(table) : this.appendTable(table)
  }

  // negateClass() negates this CharClass, which must already be clean.
  negateClass() {
    let nextLo = 0 // lo end of next class to add
    let w = 0 // write index
    for (let i = 0; i < this.len; i += 2) {
      const lo = this.r[i]
      const hi = this.r[i + 1]
      if (nextLo <= lo - 1) {
        this.r[w] = nextLo
        this.r[w + 1] = lo - 1
        w += 2
      }
      nextLo = hi + 1
    }
    this.len = w
    if (nextLo <= Unicode.MAX_RUNE) {
      this.r[this.len++] = nextLo
      this.r[this.len++] = Unicode.MAX_RUNE
    }
    return this
  }

  // appendClassWithSign() calls appendClass() if sign is +1 or
  // appendNegatedClass if sign is -1.  Does not mutate |x|.
  appendClassWithSign(x, sign) {
    return sign < 0 ? this.appendNegatedClass(x) : this.appendClass(x)
  }

  // appendGroup() appends CharGroup |g| to this CharClass, folding iff
  // |foldCase|.  Does not mutate |g|.
  appendGroup(g, foldCase) {
    let cls = g.cls
    if (foldCase) {
      cls = new CharClass().appendFoldedClass(cls).cleanClass().toArray()
    }
    return this.appendClassWithSign(cls, g.sign)
  }

  toString() {
    return CharClass.charClassToString(this.r, this.len)
  }
}

export { CharClass }
