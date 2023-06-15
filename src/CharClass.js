import { Re2Flags } from './RE2Flags'
import { Unicode } from './Unicode'
import { Utils } from './Utils'

class CharClass {
  constructor(r = Utils.EMPTY_INTS) {
    this.r = r
    this.len = r.length
  }

  // After a call to ensureCapacity(), |r.length| is at least |newLen|.
  ensureCapacity(newLen) {
    // Expand by at least doubling, except when len == 0.
    // TODO(adonovan): opt: perhaps it would be better to allocate exactly
    // newLen, since the number of expansions is typically very small?
    if (this.r.length < newLen) {
      newLen = newLen < this.len * 2 ? this.len * 2 : newLen
      let r2 = new Array(newLen)
      r2 = [...this.r.slice(0, this.len)]
      this.r = r2
    }
  }

  // Returns the character class as an int array.  Subsequent CharClass
  // operations may mutate this array, so typically this is the last operation
  // performed on a given CharClass instance.
  toArray() {
    return this.len === this.r.length ? this.r : this.r.slice(0, this.len)
  }

  // cleanClass() sorts the ranges (pairs of elements) of this CharClass,
  // merges them, and eliminates duplicates.
  cleanClass() {
    if (this.len < 4) {
      return this
    }

    // Sort by lo increasing, hi decreasing to break ties.
    this.qsortIntPair(this.r, 0, this.len - 2)

    // Merge abutting, overlapping.
    let w = 2 // write index
    for (let i = 2; i < this.len; i += 2) {
      let lo = this.r[i]
      let hi = this.r[i + 1]
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
    this.len = w

    return this
  }

  // appendLiteral() appends the literal |x| to this CharClass.
  appendLiteral(x, flags) {
    return ((flags & Re2Flags.FOLD_CASE) !== 0) ? this.appendFoldedRange(x, x) : this.appendRange(x, x)
  }

  // appendRange() appends the range [lo-hi] (inclusive) to this CharClass.
  appendRange(lo, hi) {
    // Expand last range or next to last range if it overlaps or abuts.
    // Checking two ranges helps when appending case-folded
    // alphabets, so that one range can be expanding A-Z and the
    // other expanding a-z.
    if (this.len > 0) {
      for (let i = 2; i <= 4; i += 2) { // twice, using i=2, i=4
        if (this.len >= i) {
          let rlo = this.r[this.len - i]
          let rhi = this.r[this.len - i + 1]
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
    // Can't coalesce; append.   Expand capacity by doubling as needed.
    this.ensureCapacity(this.len + 2)
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
      let lo = x[i]
      let hi = x[i + 1]
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
    for (let triple of table) {
      let lo = triple[0], hi = triple[1], stride = triple[2]
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
    let nextLo = 0 // lo end of next class to add
    for (let triple of table) {
      let lo = triple[0], hi = triple[1], stride = triple[2]
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
      let lo = this.r[i], hi = this.r[i + 1]
      if (nextLo <= lo - 1) {
        this.r[w] = nextLo
        this.r[w + 1] = lo - 1
        w += 2
      }
      nextLo = hi + 1
    }
    this.len = w

    if (nextLo <= Unicode.MAX_RUNE) {
      // It's possible for the negation to have one more
      // range - this one - than the original class, so use append.
      this.ensureCapacity(this.len + 2)
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

  // qsortIntPair() quicksorts pairs of ints in |array| according to lt().
  // Precondition: |left|, |right|, |this.len| must all be even; |this.len > 1|.
  qsortIntPair(left, right) {
    let pivotIndex = ((left + right) / 2) & ~1
    let pivotFrom = this.r[pivotIndex], pivotTo = this.r[pivotIndex + 1]
    let i = left, j = right

    while (i <= j) {
      while (i < right && CharClass.cmp(this.r, i, pivotFrom, pivotTo) < 0) {
        i += 2
      }
      while (j > left && CharClass.cmp(this.r, j, pivotFrom, pivotTo) > 0) {
        j -= 2
      }
      if (i <= j) {
        if (i !== j) {
          let temp = this.r[i]
          this.r[i] = this.r[j]
          this.r[j] = temp
          temp = this.r[i + 1]
          this.r[i + 1] = this.r[j + 1]
          this.r[j + 1] = temp
        }
        i += 2
        j -= 2
      }
    }
    if (left < j) {
      this.qsortIntPair(left, j)
    }
    if (i < right) {
      this.qsortIntPair(i, right)
    }
  }

  // cmp() returns the ordering of the pair (a[i], a[i+1]) relative to
  // (pivotFrom, pivotTo), where the first component of the pair (lo) is
  // ordered naturally and the second component (hi) is in reverse order.
  static cmp(array, i, pivotFrom, pivotTo) {
    let cmp = array[i] - pivotFrom
    return cmp !== 0 ? cmp : pivotTo - array[i + 1]
  }

  // Exposed, since useful for debugging CharGroups too.
  static charClassToString(r, len) {
    let b = '['
    for (let i = 0; i < len; i += 2) {
      if (i > 0) {
        b += ' '
      }
      let lo = r[i], hi = r[i + 1]
      if (lo === hi) {
        b += '0x' + lo.toString(16)
      } else {
        b += '0x' + lo.toString(16) + '-0x' + hi.toString(16)
      }
    }
    b += ']'
    return b
  }

  toString() {
    return CharClass.charClassToString(this.r, this.len)
  }
}

export { CharClass }
