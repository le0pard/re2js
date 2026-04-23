import { RE2Flags } from './RE2Flags'
import { Regexp } from './Regexp'
import { Unicode } from './Unicode'
import { Codepoint } from './Codepoint'

class Simplify {
  // Simplify returns a regexp equivalent to re but without counted
  // repetitions and with various other simplifications, such as
  // rewriting /(?:a+)+/ to /a+/.  The resulting regexp will execute
  // correctly but its string representation will not produce the same
  // parse tree, because capturing parentheses may have been duplicated
  // or removed.  For example, the simplified form for /(x){1,2}/ is
  // /(x)(x)?/ but both parentheses capture as $1.  The returned regexp
  // may share structure with or be the original.
  static simplify(re) {
    if (re === null) {
      return null
    }

    switch (re.op) {
      case Regexp.Op.PLB:
      case Regexp.Op.NLB:
      case Regexp.Op.CAPTURE: {
        const sub = Simplify.simplify(re.subs[0])
        if (sub !== re.subs[0]) {
          const nre = Regexp.fromRegexp(re)
          nre.runes = []
          nre.subs = [sub]
          return nre
        }
        return re
      }

      case Regexp.Op.CONCAT:
      case Regexp.Op.ALTERNATE: {
        const newSubs = []
        let changed = false

        for (let i = 0; i < re.subs.length; i++) {
          const sub = re.subs[i]
          const nsub = Simplify.simplify(sub)
          if (nsub !== sub) {
            changed = true
          }

          if (re.op === Regexp.Op.CONCAT) {
            // If any part of a CONCAT is mathematically impossible,
            // the entire CONCAT sequence becomes impossible.
            if (nsub.op === Regexp.Op.NO_MATCH) {
              return new Regexp(Regexp.Op.NO_MATCH)
            }
            // Drop empty 0-width match nodes entirely from sequences
            if (nsub.op === Regexp.Op.EMPTY_MATCH) {
              changed = true
              continue
            }
            // Flatten nested concatenations
            if (nsub.op === Regexp.Op.CONCAT) {
              changed = true
              for (let j = 0; j < nsub.subs.length; j++) {
                newSubs.push(nsub.subs[j])
              }
              continue
            }
          } else if (re.op === Regexp.Op.ALTERNATE) {
            // Drop impossible branches from alternations
            if (nsub.op === Regexp.Op.NO_MATCH) {
              changed = true
              continue
            }
            // Flatten nested alternations
            if (nsub.op === Regexp.Op.ALTERNATE) {
              changed = true
              newSubs.push(...nsub.subs)
              continue
            }
          }

          newSubs.push(nsub)
        }

        if (changed) {
          // If we filtered out all nodes, return the mathematically correct fallback
          if (newSubs.length === 0) {
            return new Regexp(
              re.op === Regexp.Op.CONCAT ? Regexp.Op.EMPTY_MATCH : Regexp.Op.NO_MATCH
            )
          }
          // If only 1 node remains, we don't need a CONCAT/ALT container at all
          if (newSubs.length === 1) {
            return newSubs[0]
          }

          const nre = Regexp.fromRegexp(re)
          nre.runes = []
          nre.subs = newSubs
          return nre
        }

        return re
      }

      case Regexp.Op.CHAR_CLASS: {
        if (re.runes === null) return re

        // Empty character classes match nothing.
        if (re.runes.length === 0) {
          return new Regexp(Regexp.Op.NO_MATCH)
        }
        // Full character classes match everything.
        if (re.runes.length === 2 && re.runes[0] === 0 && re.runes[1] === Unicode.MAX_RUNE) {
          return new Regexp(Regexp.Op.ANY_CHAR)
        }
        // Standard catch-all except newline
        if (
          re.runes.length === 4 &&
          re.runes[0] === 0 &&
          re.runes[1] === Codepoint.CODES.get('\n') - 1 &&
          re.runes[2] === Codepoint.CODES.get('\n') + 1 &&
          re.runes[3] === Unicode.MAX_RUNE
        ) {
          return new Regexp(Regexp.Op.ANY_CHAR_NOT_NL)
        }
        return re
      }

      case Regexp.Op.STAR:
      case Regexp.Op.PLUS:
      case Regexp.Op.QUEST: {
        const sub = Simplify.simplify(re.subs[0])
        return Simplify.simplify1(re.op, re.flags, sub, re)
      }

      case Regexp.Op.REPEAT: {
        // Special special case: x{0} matches the empty string
        // and doesn't even need to consider x.
        if (re.min === 0 && re.max === 0) {
          return new Regexp(Regexp.Op.EMPTY_MATCH)
        }
        // The fun begins.
        const sub = Simplify.simplify(re.subs[0])

        // x{n,} means at least n matches of x.
        if (re.max === -1) {
          // Special case: x{0,} is x*.
          if (re.min === 0) {
            return Simplify.simplify1(Regexp.Op.STAR, re.flags, sub, null)
          }
          // Special case: x{1,} is x+.
          if (re.min === 1) {
            return Simplify.simplify1(Regexp.Op.PLUS, re.flags, sub, null)
          }
          // General case: x{4,} is xxxx+.
          const nre = new Regexp(Regexp.Op.CONCAT)
          const subs = []
          for (let i = 0; i < re.min - 1; i++) {
            subs.push(sub)
          }
          subs.push(Simplify.simplify1(Regexp.Op.PLUS, re.flags, sub, null))
          nre.subs = subs.slice(0)

          // Ensure newly created CONCAT is properly flattened
          return Simplify.simplify(nre)
        }
        // Special case x{0} handled above.

        // Special case: x{1} is just x.
        if (re.min === 1 && re.max === 1) {
          return sub
        }

        // General case: x{n,m} means n copies of x and m copies of x?
        // The machine will do less work if we nest the final m copies,
        // so that x{2,5} = xx(x(x(x)?)?)?

        // Build leading prefix: xx.
        let prefixSubs = null
        if (re.min > 0) {
          prefixSubs = []
          for (let i = 0; i < re.min; i++) {
            prefixSubs.push(sub)
          }
        }

        // Build and attach suffix: (x(x(x)?)?)?
        if (re.max > re.min) {
          let suffix = Simplify.simplify1(Regexp.Op.QUEST, re.flags, sub, null)
          for (let i = re.min + 1; i < re.max; i++) {
            const nre2 = new Regexp(Regexp.Op.CONCAT)
            nre2.subs = [sub, suffix]
            suffix = Simplify.simplify1(Regexp.Op.QUEST, re.flags, nre2, null)
          }

          if (prefixSubs === null) {
            return suffix
          }
          prefixSubs.push(suffix)
        }

        if (prefixSubs !== null) {
          const prefix = new Regexp(Regexp.Op.CONCAT)
          prefix.subs = prefixSubs.slice(0)
          // Ensure newly created CONCAT is properly flattened
          return Simplify.simplify(prefix)
        }

        // Some degenerate case like min > max or min < max < 0.
        // Handle as impossible match.
        return new Regexp(Regexp.Op.NO_MATCH)
      }
    }
    return re
  }

  // simplify1 implements Simplify for the unary OpStar,
  // OpPlus, and OpQuest operators.  It returns the simple regexp
  // equivalent to
  //
  //      Regexp{Op: op, Flags: flags, Sub: {sub}}
  //
  // under the assumption that sub is already simple, and
  // without first allocating that structure.  If the regexp
  // to be returned turns out to be equivalent to re, simplify1
  // returns re instead.
  //
  // simplify1 is factored out of Simplify because the implementation
  // for other operators generates these unary expressions.
  // Letting them call simplify1 makes sure the expressions they
  // generate are simple.
  static simplify1(op, flags, sub, re) {
    // Special case: repeat the empty string as much as
    // you want, but it's still the empty string.
    if (sub.op === Regexp.Op.EMPTY_MATCH) {
      return sub
    }

    // Handle impossible targets gracefully.
    // e.g. Trying to match "NO_MATCH" 0 or 1 times (QUEST/STAR) evaluates to EMPTY_MATCH.
    if (sub.op === Regexp.Op.NO_MATCH) {
      if (op === Regexp.Op.PLUS) return sub // 1+ times is impossible
      return new Regexp(Regexp.Op.EMPTY_MATCH)
    }

    // The operators are idempotent if the flags match.
    if (op === sub.op && (flags & RE2Flags.NON_GREEDY) === (sub.flags & RE2Flags.NON_GREEDY)) {
      return sub
    }

    if (
      re !== null &&
      re.op === op &&
      (re.flags & RE2Flags.NON_GREEDY) === (flags & RE2Flags.NON_GREEDY) &&
      sub === re.subs[0]
    ) {
      return re
    }

    const nre = new Regexp(op)
    nre.flags = flags
    nre.subs = [sub]
    return nre
  }
}

export { Simplify }
