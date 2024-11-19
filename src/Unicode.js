import { Codepoint } from './Codepoint'
import { UnicodeTables } from './UnicodeTables'
/**
 * Utilities for dealing with Unicode better than JS does.
 */
class Unicode {
  // The highest legal rune value.
  static MAX_RUNE = 0x10ffff
  // The highest legal ASCII value.
  static MAX_ASCII = 0x7f
  // The highest legal Latin-1 value.
  static MAX_LATIN1 = 0xff
  // The highest legal Basic Multilingual Plane (BMP) value.
  static MAX_BMP = 0xffff
  // Minimum and maximum runes involved in folding.
  // Checked during test.
  static MIN_FOLD = 0x0041
  static MAX_FOLD = 0x1e943

  // is32 uses binary search to test whether rune is in the specified
  // slice of 32-bit ranges.
  static is32(ranges, r) {
    // binary search over ranges
    let lo = 0
    let hi = ranges.length
    while (lo < hi) {
      let m = lo + Math.floor((hi - lo) / 2)
      let range = ranges[m]
      if (range[0] <= r && r <= range[1]) {
        return (r - range[0]) % range[2] === 0
      }
      if (r < range[0]) {
        hi = m
      } else {
        lo = m + 1
      }
    }
    return false
  }

  // is tests whether rune is in the specified table of ranges.
  static is(ranges, r) {
    // common case: rune is ASCII or Latin-1, so use linear search.
    if (r <= this.MAX_LATIN1) {
      for (let range of ranges) {
        // range = [lo, hi, stride]
        if (r > range[1]) {
          continue
        }
        if (r < range[0]) {
          return false
        }
        return (r - range[0]) % range[2] === 0
      }
      return false
    }
    return ranges.length > 0 && r >= ranges[0][0] && this.is32(ranges, r)
  }

  // isUpper reports whether the rune is an upper case letter.
  static isUpper(r) {
    if (r <= this.MAX_LATIN1) {
      const s = String.fromCodePoint(r)
      return s.toUpperCase() === s && s.toLowerCase() !== s
    }
    return this.is(UnicodeTables.Upper, r)
  }

  // isPrint reports whether the rune is printable (Unicode L/M/N/P/S or ' ').
  static isPrint(r) {
    if (r <= this.MAX_LATIN1) {
      return (r >= 0x20 && r < 0x7f) || (r >= 0xa1 && r !== 0xad)
    }
    return (
      this.is(UnicodeTables.L, r) ||
      this.is(UnicodeTables.M, r) ||
      this.is(UnicodeTables.N, r) ||
      this.is(UnicodeTables.P, r) ||
      this.is(UnicodeTables.S, r)
    )
  }

  // simpleFold iterates over Unicode code points equivalent under
  // the Unicode-defined simple case folding.  Among the code points
  // equivalent to rune (including rune itself), SimpleFold returns the
  // smallest r >= rune if one exists, or else the smallest r >= 0.
  //
  // For example:
  //      SimpleFold('A') = 'a'
  //      SimpleFold('a') = 'A'
  //
  //      SimpleFold('K') = 'k'
  //      SimpleFold('k') = '\u212A' (Kelvin symbol, K)
  //      SimpleFold('\u212A') = 'K'
  //
  //      SimpleFold('1') = '1'
  //
  // Derived from Go's unicode.SimpleFold.
  //
  static simpleFold(r) {
    // Consult caseOrbit table for special cases.
    if (UnicodeTables.CASE_ORBIT.has(r)) {
      return UnicodeTables.CASE_ORBIT.get(r)
    }

    // No folding specified.  This is a one- or two-element
    // equivalence class containing rune and toLower(rune)
    // and toUpper(rune) if they are different from rune.
    const l = Codepoint.toLowerCase(r)
    if (l !== r) {
      return l
    }
    return Codepoint.toUpperCase(r)
  }

  // equalsIgnoreCase performs case-insensitive equality comparison
  // on the given runes |r1| and |r2|, with special consideration
  // for the likely scenario where both runes are ASCII characters.
  // If non-ASCII, Unicode case folding will be performed on |r1|
  // to compare it to |r2|.
  // -1 is interpreted as the end-of-file mark.
  static equalsIgnoreCase(r1, r2) {
    // Runes already match, or one of them is EOF
    if (r1 < 0 || r2 < 0 || r1 === r2) {
      return true
    }

    // Fast path for the common case where both runes are ASCII characters.
    // Coerces both runes to lowercase if applicable.
    if (r1 <= this.MAX_ASCII && r2 <= this.MAX_ASCII) {
      if (Codepoint.CODES.get('A') <= r1 && r1 <= Codepoint.CODES.get('Z')) {
        r1 |= 0x20
      }

      if (Codepoint.CODES.get('A') <= r2 && r2 <= Codepoint.CODES.get('Z')) {
        r2 |= 0x20
      }

      return r1 === r2
    }

    // Fall back to full Unicode case folding otherwise.
    // Invariant: r1 must be non-negative
    for (let r = this.simpleFold(r1); r !== r1; r = this.simpleFold(r)) {
      if (r === r2) {
        return true
      }
    }

    return false
  }
}

export { Unicode }
