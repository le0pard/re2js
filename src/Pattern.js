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

  static compile(flregex, regex = null, flags = null) {
    if (regex === null && flags === null) {
      return this.compile(regex, regex, 0)
    }

    if (flags === null) {
      let newFlregex = regex
      if ((flags & RE2Flags.CASE_INSENSITIVE) !== 0) {
        newFlregex = '(?i)' + newFlregex
      }
      if ((flags & RE2Flags.DOTALL) !== 0) {
        newFlregex = '(?s)' + newFlregex
      }
      if ((flags & RE2Flags.MULTILINE) !== 0) {
        newFlregex = '(?m)' + newFlregex
      }
      if ((flags & ~(RE2Flags.MULTILINE | RE2Flags.DOTALL | RE2Flags.CASE_INSENSITIVE | RE2Flags.DISABLE_UNICODE_GROUPS | RE2Flags.LONGEST_MATCH)) !== 0) {
        throw new Error(
          'Flags should only be a combination '
          + 'of MULTILINE, DOTALL, CASE_INSENSITIVE, DISABLE_UNICODE_GROUPS, LONGEST_MATCH'
        )
      }
      return this.compile(newFlregex, regex, flags)
    }

    let re2Flags = RE2Flags.PERL
    if ((flags & RE2Flags.DISABLE_UNICODE_GROUPS) !== 0) {
      re2Flags &= ~RE2Flags.UNICODE_GROUPS
    }
    return new Pattern(
      regex, flags, RE2.compileImpl(flregex, re2Flags, (flags & RE2Flags.LONGEST_MATCH) !== 0)
    )
  }

  static matches(regex, input) {
    return this.compile(regex).matcher(input).matches()
  }

  matches(input) {
    return this.matcher(input).matches()
  }

  matcher(input) {
    if (input instanceof Uint8Array) {
      return new Matcher(this, MatcherInput.utf8(input))
    } else if (typeof input === 'string' || input instanceof String) {
      return new Matcher(this, input)
    } else {
      throw new Error('Invalid input type. Expected string or byte array.')
    }
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
