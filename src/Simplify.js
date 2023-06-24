import { RE2Flags } from './RE2Flags'
import { Regexp } from './Regexp'

class Simplify {
  static simplify(re) {
    if (re === null) {
      return null
    }
    switch (re.op) {
      case Regexp.Op.CAPTURE:
      case Regexp.Op.CONCAT:
      case Regexp.Op.ALTERNATE:
        {
          let nre = re
          for (let i = 0; i < re.subs.length; ++i) {
            let sub = re.subs[i]
            let nsub = this.simplify(sub)
            if (nre.equals(re) && !nsub.equals(sub)) {
              nre = Object.assign({}, re)
              nre.runes = null
              nre.subs = Array.from(re.subs)
            }
            if (!nre.equals(re)) {
              nre.subs[i] = nsub
            }
          }
          return nre
        }
      case Regexp.Op.STAR:
      case Regexp.Op.PLUS:
      case Regexp.Op.QUEST:
        {
          let sub = this.simplify(re.subs[0])
          return this.simplify1(re.op, re.flags, sub, re)
        }
      case Regexp.Op.REPEAT:
        {
          if (re.min === 0 && re.max === 0) {
            return new Regexp(Regexp.Op.EMPTY_MATCH)
          }

          let sub = this.simplify(re.subs[0])

          if (re.max === -1) {
            if (re.min === 0) {
              return this.simplify1(Regexp.Op.STAR, re.flags, sub, null)
            }

            if (re.min === 1) {
              return this.simplify1(Regexp.Op.PLUS, re.flags, sub, null)
            }

            let nre = new Regexp(Regexp.Op.CONCAT)
            let subs = []
            for (let i = 0; i < re.min - 1; i++) {
              subs.push(sub)
            }
            subs.push(this.simplify1(Regexp.Op.PLUS, re.flags, sub, null))
            nre.subs = subs
            return nre
          }

          if (re.min === 1 && re.max === 1) {
            return sub
          }

          let prefixSubs = null
          if (re.min > 0) {
            prefixSubs = []
            for (let i = 0; i < re.min; i++) {
              prefixSubs.push(sub)
            }
          }

          if (re.max > re.min) {
            let suffix = this.simplify1(Regexp.Op.QUEST, re.flags, sub, null)
            for (let i = re.min + 1; i < re.max; i++) {
              let nre2 = new Regexp(Regexp.Op.CONCAT)
              nre2.subs = [sub, suffix]
              suffix = this.simplify1(Regexp.Op.QUEST, re.flags, nre2, null)
            }
            if (prefixSubs === null) {
              return suffix
            }
            prefixSubs.push(suffix)
          }
          if (prefixSubs !== null) {
            let prefix = new Regexp(Regexp.Op.CONCAT)
            prefix.subs = prefixSubs
            return prefix
          }

          return new Regexp(Regexp.Op.NO_MATCH)
        }
    }

    return re
  }

  static simplify1(op, flags, sub, re) {
    if (sub.op === Regexp.Op.EMPTY_MATCH) {
      return sub
    }
    if (op === sub.op && (flags & RE2Flags.NON_GREEDY) === (sub.flags & RE2Flags.NON_GREEDY)) {
      return sub
    }
    if (re !== null
      && re.op === op
      && (re.flags & RE2Flags.NON_GREEDY) === (flags & RE2Flags.NON_GREEDY)
      && sub.equals(re.subs[0])) {
      return re
    }

    re = new Regexp(op)
    re.flags = flags
    re.subs = [sub]
    return re
  }
}

export { Simplify }
