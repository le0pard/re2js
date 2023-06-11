import { Characters } from './Characters'

class Unicode {
  static MAX_RUNE = 0x10FFFF;
  static MAX_ASCII = 0x7f;
  static MAX_LATIN1 = 0xFF;
  static MIN_FOLD = 0x0041;
  static MAX_FOLD = 0x1044f;

  static is32(ranges, r) {
    for (let lo = 0, hi = ranges.length; lo < hi; ) {
      let m = lo + Math.floor((hi - lo) / 2);
      let range = ranges[m];
      if (range[0] <= r && r <= range[1]) {
        return ((r - range[0]) % range[2]) == 0;
      }
      if (r < range[0]) {
        hi = m;
      } else {
        lo = m + 1;
      }
    }
    return false;
  }

  static is(ranges, r) {
    if (r <= Unicode.MAX_LATIN1) {
      for (let range of ranges) {
        if (r > range[1]) {
          continue;
        }
        if (r < range[0]) {
          return false;
        }
        return ((r - range[0]) % range[2]) == 0;
      }
      return false;
    }
    return ranges.length > 0 && r >= ranges[0][0] && Unicode.is32(ranges, r);
  }

  static isUpper(r) {
    if (r <= Unicode.MAX_LATIN1) {
      return String.fromCodePoint(r).toUpperCase() === String.fromCodePoint(r);
    }
    return Unicode.is(UnicodeTables.Upper, r);
  }

  static isPrint(r) {
    if (r <= Unicode.MAX_LATIN1) {
      return (r >= 0x20 && r < 0x7F) || (r >= 0xA1 && r != 0xAD);
    }
    return Unicode.is(UnicodeTables.L, r)
        || Unicode.is(UnicodeTables.M, r)
        || Unicode.is(UnicodeTables.N, r)
        || Unicode.is(UnicodeTables.P, r)
        || Unicode.is(UnicodeTables.S, r);
  }

  static simpleFold(r) {
    if (r < UnicodeTables.CASE_ORBIT.length && UnicodeTables.CASE_ORBIT[r] !== 0) {
      return UnicodeTables.CASE_ORBIT[r];
    }

    let l = Characters.toLowerCase(r);
    if (l != r) {
      return l;
    }
    return Characters.toUpperCase(r);
  }

  static equalsIgnoreCase(r1, r2) {
    if (r1 < 0 || r2 < 0 || r1 === r2) {
      return true;
    }

    if (r1 <= Unicode.MAX_ASCII && r2 <= Unicode.MAX_ASCII) {
      if ('A'.codePointAt(0) <= r1 && r1 <= 'Z'.codePointAt(0)) {
        r1 |= 0x20;
      }

      if ('A'.codePointAt(0) <= r2 && r2 <= 'Z'.codePointAt(0)) {
        r2 |= 0x20;
      }

      return r1 === r2;
    }

    for (let r = Unicode.simpleFold(r1); r !== r1; r = Unicode.simpleFold(r)) {
      if (r === r2) {
        return true;
      }
    }

    return false;
  }
}

export { Unicode }
