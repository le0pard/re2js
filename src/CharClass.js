import { RE2Flags } from './RE2Flags'
import { Unicode } from './Unicode'
import { Utils } from './Utils'
/**
 * A "builder"-style helper class for manipulating character classes represented as an array of
 * pairs of runes [lo, hi], each denoting an inclusive interval.
 *
 * All methods mutate the internal state and return {@code this}, allowing operations to be chained.
 */
export class CharClass {
  constructor(r) {
    if (((r != null && r instanceof Array && (r.length == 0 || r[0] == null || (typeof r[0] === 'number'))) || r === null)) {
      let __args = arguments;
      if (this.r === undefined) {
        this.r = null;
      }
      if (this.len === undefined) {
        this.len = 0;
      }
      this.r = r;
      this.len = r.length;
    }
    else if (r === undefined) {
      let __args = arguments;
      if (this.r === undefined) {
        this.r = null;
      }
      if (this.len === undefined) {
        this.len = 0;
      }
      this.r = Utils.EMPTY_INTS;
      this.len = 0;
    }
    else
      throw new Error('invalid overload');
  }

  static charClassToString(r, len) {
    let result = ['[']
    for (let i = 0; i < len; i += 2) {
      {
        if (i > 0) {
          result = [...result, ' ']
        }
        const lo = r[i]
        const hi = r[i + 1]
        if (lo === hi) {
          result = [...result, `0x${lo.toString(16)}`]
        } else {
          result = [...result, `0x${lo.toString(16)}-0x${hi.toString(16)}`]
        }
      }
    }
    return [...result, ']'].join('')
  }

  static cmp(array, i, pivotFrom, pivotTo) {
    const cmp = array[i] - pivotFrom
    return cmp !== 0 ? cmp : pivotTo - array[i + 1]
  }

  static qsortIntPair(array, left, right) {
    const pivotIndex = (((left + right) / 2) | 0) & ~1
    const pivotFrom = array[pivotIndex]
    const pivotTo = array[pivotIndex + 1]
    let i = left
    let j = right
    while (i <= j) {
      {
        while (i < right && CharClass.cmp(array, i, pivotFrom, pivotTo) < 0) {
          {
            i += 2
          }
        }

        while (j > left && CharClass.cmp(array, j, pivotFrom, pivotTo) > 0) {
          {
            j -= 2
          }
        }

        if (i <= j) {
          if (i !== j) {
            let temp = array[i]
            array[i] = array[j]
            array[j] = temp
            temp = array[i + 1]
            array[i + 1] = array[j + 1]
            array[j + 1] = temp
          }
          i += 2
          j -= 2
        }
      }
    }

    if (left < j) {
      CharClass.qsortIntPair(array, left, j)
    }
    if (i < right) {
      CharClass.qsortIntPair(array, i, right)
    }
  }

  ensureCapacity(newLen) {
    if (this.r.length < newLen) {
      if (newLen < this.len * 2) {
        newLen = this.len * 2
      }
      const r2 = ((s) => {
        let a = []
        while (s-- > 0) {
          a.push(0)
        }
        return a
      })(newLen)
      /* arraycopy */ ;((srcPts, srcOff, dstPts, dstOff, size) => {
        if (srcPts !== dstPts || dstOff >= srcOff + size) {
          while (--size >= 0) {
            dstPts[dstOff++] = srcPts[srcOff++]
          }
        } else {
          let tmp = srcPts.slice(srcOff, srcOff + size)
          for (let i = 0; i < size; i++) {
            dstPts[dstOff++] = tmp[i]
          }
        }
      })(this.r, 0, r2, 0, this.len)
      this.r = r2
    }
  }

  toArray() {
    if (this.len === this.r.length) {
      return this.r
    } else {
      const r2 = ((s) => {
        let a = []
        while (s-- > 0) {
          a.push(0)
        }
        return a
      })(this.len)
      /* arraycopy */ ;((srcPts, srcOff, dstPts, dstOff, size) => {
        if (srcPts !== dstPts || dstOff >= srcOff + size) {
          while (--size >= 0) {
            dstPts[dstOff++] = srcPts[srcOff++]
          }
        } else {
          let tmp = srcPts.slice(srcOff, srcOff + size)
          for (let i = 0; i < size; i++) {
            dstPts[dstOff++] = tmp[i]
          }
        }
      })(this.r, 0, r2, 0, this.len)
      return r2
    }
  }

  cleanClass() {
    if (this.len < 4) {
      return this
    }
    CharClass.qsortIntPair(this.r, 0, this.len - 2)
    let w = 2
    for (let i = 2; i < this.len; i += 2) {
      {
        const lo = this.r[i]
        const hi = this.r[i + 1]
        if (lo <= this.r[w - 1] + 1) {
          if (hi > this.r[w - 1]) {
            this.r[w - 1] = hi
          }
          continue
        }
        this.r[w] = lo
        this.r[w + 1] = hi
        w += 2
      }
    }
    this.len = w
    return this
  }

  appendLiteral(x, flags) {
    return (flags & RE2Flags.FOLD_CASE) !== 0
      ? this.appendFoldedRange(x, x)
      : this.appendRange(x, x)
  }

  appendRange(lo, hi) {
    if (this.len > 0) {
      for (let i = 2; i <= 4; i += 2) {
        {
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
    }
    this.ensureCapacity(this.len + 2)
    this.r[this.len++] = lo
    this.r[this.len++] = hi
    return this
  }

  appendFoldedRange(lo, hi) {
    if (lo <= Unicode.MIN_FOLD && hi >= Unicode.MAX_FOLD) {
      return this.appendRange(lo, hi)
    }
    if (hi < Unicode.MIN_FOLD || lo > Unicode.MAX_FOLD) {
      return this.appendRange(lo, hi)
    }
    if (lo < Unicode.MIN_FOLD) {
      this.appendRange(lo, Unicode.MIN_FOLD - 1)
      lo = Unicode.MIN_FOLD
    }
    if (hi > Unicode.MAX_FOLD) {
      this.appendRange(Unicode.MAX_FOLD + 1, hi)
      hi = Unicode.MAX_FOLD
    }
    for (let c = lo; c <= hi; c++) {
      {
        this.appendRange(c, c)
        for (let f = Unicode.simpleFold(c); f !== c; f = Unicode.simpleFold(f)) {
          {
            this.appendRange(f, f)
          }
        }
      }
    }
    return this
  }

  appendClass(x) {
    for (let i = 0; i < x.length; i += 2) {
      {
        this.appendRange(x[i], x[i + 1])
      }
    }
    return this
  }

  appendFoldedClass(x) {
    for (let i = 0; i < x.length; i += 2) {
      {
        this.appendFoldedRange(x[i], x[i + 1])
      }
    }
    return this
  }

  appendNegatedClass(x) {
    let nextLo = 0
    for (let i = 0; i < x.length; i += 2) {
      {
        const lo = x[i]
        const hi = x[i + 1]
        if (nextLo <= lo - 1) {
          this.appendRange(nextLo, lo - 1)
        }
        nextLo = hi + 1
      }
    }
    if (nextLo <= Unicode.MAX_RUNE) {
      this.appendRange(nextLo, Unicode.MAX_RUNE)
    }
    return this
  }

  appendTable(table) {
    for (let index = 0; index < table.length; index++) {
      let triple = table[index]
      {
        const lo = triple[0]
        const hi = triple[1]
        const stride = triple[2]
        if (stride === 1) {
          this.appendRange(lo, hi)
          continue
        }
        for (let c = lo; c <= hi; c += stride) {
          {
            this.appendRange(c, c)
          }
        }
      }
    }
    return this
  }

  appendNegatedTable(table) {
    let nextLo = 0
    for (let index = 0; index < table.length; index++) {
      let triple = table[index]
      {
        const lo = triple[0]
        const hi = triple[1]
        const stride = triple[2]
        if (stride === 1) {
          if (nextLo <= lo - 1) {
            this.appendRange(nextLo, lo - 1)
          }
          nextLo = hi + 1
          continue
        }
        for (let c = lo; c <= hi; c += stride) {
          {
            if (nextLo <= c - 1) {
              this.appendRange(nextLo, c - 1)
            }
            nextLo = c + 1
          }
        }
      }
    }
    if (nextLo <= Unicode.MAX_RUNE) {
      this.appendRange(nextLo, Unicode.MAX_RUNE)
    }
    return this
  }

  appendTableWithSign(table, sign) {
    return sign < 0 ? this.appendNegatedTable(table) : this.appendTable(table)
  }

  negateClass() {
    let nextLo = 0
    let w = 0
    for (let i = 0; i < this.len; i += 2) {
      {
        const lo = this.r[i]
        const hi = this.r[i + 1]
        if (nextLo <= lo - 1) {
          this.r[w] = nextLo
          this.r[w + 1] = lo - 1
          w += 2
        }
        nextLo = hi + 1
      }
    }
    this.len = w
    if (nextLo <= Unicode.MAX_RUNE) {
      this.ensureCapacity(this.len + 2)
      this.r[this.len++] = nextLo
      this.r[this.len++] = Unicode.MAX_RUNE
    }
    return this
  }

  appendClassWithSign(x, sign) {
    return sign < 0 ? this.appendNegatedClass(x) : this.appendClass(x)
  }

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
