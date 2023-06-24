/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
import { RE2Flags } from './RE2Flags'
import { Parser } from './Parser'
import { Regexp } from './Regexp'

export class Simplify {
  static simplify(re) {
    if (re == null) {
      return null
    }
    switch (re.op) {
      case Regexp.Op.CAPTURE:
      case Regexp.Op.CONCAT:
      case Regexp.Op.ALTERNATE: {
        let nre = re
        for (let i = 0; i < re.subs.length; ++i) {
          {
            const sub = re.subs[i]
            const nsub = Simplify.simplify(sub)
            if (nre === re && nsub !== sub) {
              nre = new Regexp(re)
              nre.runes = null
              nre.subs = Parser.subarray(re.subs, 0, re.subs.length)
            }
            if (nre !== re) {
              nre.subs[i] = nsub
            }
          }
        }
        return nre
      }

      case Regexp.Op.STAR:
      case Regexp.Op.PLUS:
      case Regexp.Op.QUEST: {
        const sub = Simplify.simplify(re.subs[0])
        return Simplify.simplify1(re.op, re.flags, sub, re)
      }

      case Regexp.Op.REPEAT: {
        if (re.min === 0 && re.max === 0) {
          return new Regexp(Regexp.Op.EMPTY_MATCH)
        }
        const sub = Simplify.simplify(re.subs[0])
        if (re.max === -1) {
          if (re.min === 0) {
            return Simplify.simplify1(Regexp.Op.STAR, re.flags, sub, null)
          }
          if (re.min === 1) {
            return Simplify.simplify1(Regexp.Op.PLUS, re.flags, sub, null)
          }
          const nre = new Regexp(Regexp.Op.CONCAT)
          const subs = []
          for (let i = 0; i < re.min - 1; i++) {
            {
              /* add */ subs.push(sub) > 0
            }
          }
          /* add */ subs.push(Simplify.simplify1(Regexp.Op.PLUS, re.flags, sub, null)) > 0
          nre.subs = /* toArray */ subs.slice(0)
          return nre
        }
        if (re.min === 1 && re.max === 1) {
          return sub
        }
        let prefixSubs = null
        if (re.min > 0) {
          prefixSubs = []
          for (let i = 0; i < re.min; i++) {
            {
              /* add */ prefixSubs.push(sub) > 0
            }
          }
        }
        if (re.max > re.min) {
          let suffix = Simplify.simplify1(Regexp.Op.QUEST, re.flags, sub, null)
          for (let i = re.min + 1; i < re.max; i++) {
            {
              const nre2 = new Regexp(Regexp.Op.CONCAT)
              nre2.subs = [sub, suffix]
              suffix = Simplify.simplify1(Regexp.Op.QUEST, re.flags, nre2, null)
            }
          }
          if (prefixSubs == null) {
            return suffix
          }
          /* add */ prefixSubs.push(suffix) > 0
        }
        if (prefixSubs != null) {
          const prefix = new Regexp(Regexp.Op.CONCAT)
          prefix.subs = /* toArray */ prefixSubs.slice(0)
          return prefix
        }
        return new Regexp(Regexp.Op.NO_MATCH)
      }
    }
    return re
  }
  /*private*/ static simplify1(op, flags, sub, re) {
    if (sub.op === Regexp.Op.EMPTY_MATCH) {
      return sub
    }
    if (op === sub.op && (flags & RE2Flags.NON_GREEDY) === (sub.flags & RE2Flags.NON_GREEDY)) {
      return sub
    }
    if (
      re != null &&
      re.op === op &&
      (re.flags & RE2Flags.NON_GREEDY) === (flags & RE2Flags.NON_GREEDY) &&
      sub === re.subs[0]
    ) {
      return re
    }
    re = new Regexp(op)
    re.flags = flags
    re.subs = [sub]
    return re
  }
  constructor() {}
}
Simplify['__class'] = 'quickstart.Simplify'
