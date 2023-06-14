import { Characters } from './Characters'
import { UnicodeTables } from './UnicodeTables'
import { Utils } from './Utils'

class Unicode {
  static MAX_RUNE = 0x10FFFF
  static MAX_ASCII = 0x7f
  static MAX_LATIN1 = 0xFF
  static MIN_FOLD = 0x0041
  static MAX_FOLD = 0x1044f

  static is32(ranges, r) {
    for (let lo = 0, hi = ranges.length; lo < hi;) {
      let m = lo + Math.floor((hi - lo) / 2)
      let range = ranges[m]
      if (range[0] <= r && r <= range[1]) {
        return ((r - range[0]) % range[2]) === 0
      }
      if (r < range[0]) {
        hi = m
      } else {
        lo = m + 1
      }
    }
    return false
  }

  static is(ranges, r) {
    if (r <= this.MAX_LATIN1) {
      for (let range of ranges) {
        if (r > range[1]) {
          continue
        }
        if (r < range[0]) {
          return false
        }
        return ((r - range[0]) % range[2]) === 0
      }
      return false
    }
    return ranges.length > 0 && r >= ranges[0][0] && this.is32(ranges, r)
  }

  static isUpper(r) {
    if (r <= this.MAX_LATIN1) {
      return String.fromCodePoint(r).toUpperCase() === String.fromCodePoint(r)
    }
    return this.is(UnicodeTables.Upper, r)
  }

  static isPrint(r) {
    if (r <= this.MAX_LATIN1) {
      return (r >= 0x20 && r < 0x7F) || (r >= 0xA1 && r !== 0xAD)
    }
    return this.is(UnicodeTables.L, r)
      || this.is(UnicodeTables.M, r)
      || this.is(UnicodeTables.N, r)
      || this.is(UnicodeTables.P, r)
      || this.is(UnicodeTables.S, r)
  }

  static simpleFold(r) {
    if (r < UnicodeTables.CASE_ORBIT.length && UnicodeTables.CASE_ORBIT[r] !== 0) {
      return UnicodeTables.CASE_ORBIT[r]
    }

    let l = Characters.toLowerCase(r)
    if (l !== r) {
      return l
    }
    return Characters.toUpperCase(r)
  }

  static equalsIgnoreCase(r1, r2) {
    if (r1 < 0 || r2 < 0 || r1 === r2) {
      return true
    }

    if (r1 <= this.MAX_ASCII && r2 <= this.MAX_ASCII) {
      if (Utils.A_UPPER_CODEPOINT <= r1 && r1 <= Utils.Z_UPPER_CODEPOINT) {
        r1 |= 0x20
      }

      if (Utils.A_UPPER_CODEPOINT <= r2 && r2 <= Utils.Z_UPPER_CODEPOINT) {
        r2 |= 0x20
      }

      return r1 === r2
    }

    for (let r = this.simpleFold(r1); r !== r1; r = this.simpleFold(r)) {
      if (r === r2) {
        return true
      }
    }

    return false
  }
}

export { Unicode }
