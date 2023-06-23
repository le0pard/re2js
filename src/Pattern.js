import { RE2 } from './RE2'
import { RE2Flags } from './RE2Flags'
import { Matcher } from './Matcher'
import { MatcherInput } from './MatcherInput'
import { Utils } from './Utils'

class Pattern {
  static CASE_INSENSITIVE = 1
  static DOTALL = 2
  static MULTILINE = 4
  static DISABLE_UNICODE_GROUPS = 8
  static LONGEST_MATCH = 16

  constructor(pattern, flags, re2) {
    if (pattern === null) {
      throw new Error('pattern is null')
    }
    if (re2 === null) {
      throw new Error('re2 is null')
    }

    this.pattern = pattern
    this.flags = flags
    this.re2 = re2
  }

  reset() {
    this.re2.reset()
  }

  flags() {
    return this.flags
  }

  pattern() {
    return this.pattern
  }

  re2() {
    return this.re2
  }

  compile(regex, flags = 0) {
    let flregex = regex
    if ((flags & Pattern.CASE_INSENSITIVE) !== 0) {
      flregex = '(?i)' + flregex
    }
    if ((flags & Pattern.DOTALL) !== 0) {
      flregex = '(?s)' + flregex
    }
    if ((flags & Pattern.MULTILINE) !== 0) {
      flregex = '(?m)' + flregex
    }
    if ((flags & ~(Pattern.MULTILINE | Pattern.DOTALL | Pattern.CASE_INSENSITIVE | Pattern.DISABLE_UNICODE_GROUPS | Pattern.LONGEST_MATCH)) !== 0) {
      throw new Error('Flags should only be a combination of MULTILINE, DOTALL, CASE_INSENSITIVE, DISABLE_UNICODE_GROUPS, LONGEST_MATCH')
    }
    let re2Flags = RE2Flags.PERL
    if ((flags & Pattern.DISABLE_UNICODE_GROUPS) !== 0) {
      re2Flags &= ~RE2Flags.UNICODE_GROUPS
    }
    return new Pattern(regex, flags, RE2.compileImpl(flregex, re2Flags, (flags & Pattern.LONGEST_MATCH) !== 0))
  }

  matches(regex, input) {
    return Pattern.compile(regex).matcher(input).matches()
  }

  matchesInput(input) {
    return this.matcher(input).matches()
  }

  matcher(input) {
    // Assumes Matcher and MatcherInput are defined and available in the current scope.
    if (input instanceof Uint8Array) {
      return new Matcher(this, MatcherInput.utf8(input))
    }

    return new Matcher(this, input)
  }

  split(input, limit = 0) {
    // Assumes Matcher is defined and available in the current scope.
    return this._split(new Matcher(this, input), limit)
  }

  _split(m, limit) {
    let result = []
    let emptiesSkipped = 0
    let last = 0

    while (m.find()) {
      if (last === 0 && m.end() === 0) {
        // Zero-width match at the beginning, skip (JDK8+ behavior).
        last = m.end()
        continue
      }

      if (limit > 0 && result.length === limit - 1) {
        // no more room for matches
        break
      }

      if (last === m.start()) {
        if (limit === 0) {
          // Empty match, may or may not be trailing.
          emptiesSkipped++
          last = m.end()
          continue
        }
      } else {
        // If emptiesSkipped > 0 then limit == 0 and we have non-trailing empty matches to add before
        // this non-empty match.
        while (emptiesSkipped > 0) {
          result.push('')
          emptiesSkipped--
        }
      }

      result.push(m.substring(last, m.start()))
      last = m.end()
    }

    if (limit === 0 && last !== m.inputLength()) {
      // Unlimited match, no more delimiters but we have a non-empty input at the end. Catch up any skipped empty
      // matches, then emit the final match.
      while (emptiesSkipped > 0) {
        result.push('')
        emptiesSkipped--
      }

      result.push(m.substring(last, m.inputLength()))
    }

    if (limit !== 0 || result.length === 0) {
      result.push(m.substring(last, m.inputLength()))
    }

    return result
  }

  quote(s) {
    return Utils.quoteMeta(s)
  }

  toString() {
    return this.pattern
  }

  groupCount() {
    return this.re2.numberOfCapturingGroups()
  }

  namedGroups() {
    return Object.freeze(this.re2.namedGroups)
  }

  equals(o) {
    if (this === o) {
      return true
    }
    if (o === null || this.constructor !== o.constructor) {
      return false
    }
    return this.flags === o.flags && this.pattern === o.pattern
  }

  hashCode() {
    let result = this.pattern.hashCode()
    result = 31 * result + this.flags
    return result
  }
}

export { Pattern }
