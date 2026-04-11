import { Regexp } from './Regexp'
import { Utils } from './Utils'
import { RE2Flags } from './RE2Flags'

class Prefilter {
  static Type = { NONE: 0, EXACT: 1, AND: 2, OR: 3 }

  constructor(type) {
    this.type = type
    this.subs = []
    this.str = ''
    this.bytes = null
  }

  eval(input, pos) {
    switch (this.type) {
      case Prefilter.Type.NONE:
        return true
      case Prefilter.Type.EXACT:
        return input.hasString(this, pos)
      case Prefilter.Type.AND:
        for (let i = 0; i < this.subs.length; i++) {
          if (!this.subs[i].eval(input, pos)) return false
        }
        return true
      case Prefilter.Type.OR:
        for (let i = 0; i < this.subs.length; i++) {
          if (this.subs[i].eval(input, pos)) return true
        }
        return false
      default:
        return true
    }
  }
}

class PrefilterTree {
  static build(re) {
    const pf = PrefilterTree.fromRegexp(re)
    return PrefilterTree.simplify(pf)
  }

  static fromRegexp(re) {
    if (!re) return new Prefilter(Prefilter.Type.NONE)

    switch (re.op) {
      case Regexp.Op.NO_MATCH:
      case Regexp.Op.EMPTY_MATCH:
      case Regexp.Op.BEGIN_LINE:
      case Regexp.Op.END_LINE:
      case Regexp.Op.BEGIN_TEXT:
      case Regexp.Op.END_TEXT:
      case Regexp.Op.WORD_BOUNDARY:
      case Regexp.Op.NO_WORD_BOUNDARY:
      case Regexp.Op.CHAR_CLASS:
      case Regexp.Op.ANY_CHAR_NOT_NL:
      case Regexp.Op.ANY_CHAR:
        return new Prefilter(Prefilter.Type.NONE)

      case Regexp.Op.LITERAL: {
        if (re.runes.length === 0 || (re.flags & RE2Flags.FOLD_CASE) !== 0) {
          // Skip case-folded literals for simplicity
          return new Prefilter(Prefilter.Type.NONE)
        }
        const pf = new Prefilter(Prefilter.Type.EXACT)
        let str = ''
        for (let i = 0; i < re.runes.length; i++) {
          str += String.fromCodePoint(re.runes[i])
        }
        pf.str = str
        pf.bytes = Utils.stringToUtf8ByteArray(pf.str)
        return pf
      }

      case Regexp.Op.CAPTURE:
      case Regexp.Op.PLUS:
        return PrefilterTree.fromRegexp(re.subs[0])

      case Regexp.Op.REPEAT:
        if (re.min >= 1) {
          return PrefilterTree.fromRegexp(re.subs[0])
        }
        return new Prefilter(Prefilter.Type.NONE)

      case Regexp.Op.CONCAT: {
        const pf = new Prefilter(Prefilter.Type.AND)
        for (const sub of re.subs) {
          pf.subs.push(PrefilterTree.fromRegexp(sub))
        }
        return pf
      }

      case Regexp.Op.ALTERNATE: {
        const pf = new Prefilter(Prefilter.Type.OR)
        for (const sub of re.subs) {
          pf.subs.push(PrefilterTree.fromRegexp(sub))
        }
        return pf
      }

      default:
        return new Prefilter(Prefilter.Type.NONE)
    }
  }

  static simplify(pf) {
    if (pf.type === Prefilter.Type.EXACT || pf.type === Prefilter.Type.NONE) {
      return pf
    }

    if (pf.type === Prefilter.Type.AND) {
      const newSubs = []
      for (const sub of pf.subs) {
        const s = PrefilterTree.simplify(sub)
        if (s.type !== Prefilter.Type.NONE) {
          if (s.type === Prefilter.Type.AND) {
            newSubs.push(...s.subs)
          } else {
            newSubs.push(s)
          }
        }
      }

      if (newSubs.length === 0) return new Prefilter(Prefilter.Type.NONE)
      if (newSubs.length === 1) return newSubs[0]
      pf.subs = newSubs
      return pf
    }

    if (pf.type === Prefilter.Type.OR) {
      const newSubs = []
      for (const sub of pf.subs) {
        const s = PrefilterTree.simplify(sub)
        if (s.type === Prefilter.Type.NONE) {
          // If any branch of an OR has no requirements, the whole OR has no requirements
          return new Prefilter(Prefilter.Type.NONE)
        }
        if (s.type === Prefilter.Type.OR) {
          newSubs.push(...s.subs)
        } else {
          newSubs.push(s)
        }
      }
      if (newSubs.length === 0) return new Prefilter(Prefilter.Type.NONE)
      if (newSubs.length === 1) return newSubs[0]

      // De-duplicate EXACT branches
      const seen = new Set()
      const uniqueSubs = []
      for (const sub of newSubs) {
        if (sub.type === Prefilter.Type.EXACT) {
          if (!seen.has(sub.str)) {
            seen.add(sub.str)
            uniqueSubs.push(sub)
          }
        } else {
          uniqueSubs.push(sub)
        }
      }
      pf.subs = uniqueSubs
      return pf
    }

    return pf
  }
}

export { Prefilter, PrefilterTree }
