import { RE2Flags } from './RE2Flags'
import { MatcherInput } from './MatcherInput'
import { Matcher } from './Matcher'
import { RE2 } from './RE2'
import { Utils } from './Utils'
import { RE2JSSyntaxException } from './RE2JSSyntaxException'

/**
 * A compiled representation of an RE2 regular expression
 *
 * <p>
 * The matching functions take {@code String} arguments instead of the more general Java
 * {@code CharSequence} since the latter doesn't provide UTF-16 decoding.
 *
 *
 * @author rsc@google.com (Russ Cox)
 * @class
 */
class RE2JS {
  /**
   * Flag: case insensitive matching.
   */
  static CASE_INSENSITIVE = 1
  /**
   * Flag: dot ({@code .}) matches all characters, including newline.
   */
  static DOTALL = 2
  /**
   * Flag: multiline matching: {@code ^} and {@code $} match at beginning and end of line, not just
   * beginning and end of input.
   */
  static MULTILINE = 4
  /**
   * Flag: Unicode groups (e.g. {@code \p\ Greek\} ) will be syntax errors.
   */
  static DISABLE_UNICODE_GROUPS = 8
  /**
   * Flag: matches longest possible string.
   */
  static LONGEST_MATCH = 16

  /**
   * Returns a literal pattern string for the specified string.
   *
   * <p>
   * This method produces a string that can be used to create a <code>RE2JS</code> that would
   * match the string <code>s</code> as if it were a literal pattern.
   * </p>
   * Metacharacters or escape sequences in the input sequence will be given no special meaning.
   *
   * @param {string} str The string to be literalized
   * @return {string} A literal string replacement
   */
  static quote(str) {
    return Utils.quoteMeta(str)
  }

  /**
   * Helper: create new RE2JS with given regex and flags. Flregex is the regex with flags applied.
   * @param {string} regex
   * @param {number} flags
   * @return {RE2JS}
   */
  static compile(regex, flags = 0) {
    let fregex = regex
    if ((flags & RE2JS.CASE_INSENSITIVE) !== 0) {
      fregex = `(?i)${fregex}`
    }
    if ((flags & RE2JS.DOTALL) !== 0) {
      fregex = `(?s)${fregex}`
    }
    if ((flags & RE2JS.MULTILINE) !== 0) {
      fregex = `(?m)${fregex}`
    }
    if (
      (flags &
        ~(
          RE2JS.MULTILINE |
          RE2JS.DOTALL |
          RE2JS.CASE_INSENSITIVE |
          RE2JS.DISABLE_UNICODE_GROUPS |
          RE2JS.LONGEST_MATCH
        )) !==
      0
    ) {
      throw new Error(
        'Flags should only be a combination of MULTILINE, DOTALL, CASE_INSENSITIVE, DISABLE_UNICODE_GROUPS, LONGEST_MATCH'
      )
    }

    let re2Flags = RE2Flags.PERL
    if ((flags & RE2JS.DISABLE_UNICODE_GROUPS) !== 0) {
      re2Flags &= ~RE2Flags.UNICODE_GROUPS
    }

    const p = new RE2JS()
    p.patternInput = regex
    p.flagsInput = flags
    p.re2Input = RE2.compileImpl(fregex, re2Flags, (flags & RE2JS.LONGEST_MATCH) !== 0)
    return p
  }

  /**
   * Matches a string against a regular expression.
   *
   * @param {string} regex the regular expression
   * @param {*} input the input
   * @return {boolean} true if the regular expression matches the entire input
   * @throws RE2JSSyntaxException if the regular expression is malformed
   */
  static matches(regex, input) {
    return RE2JS.compile(regex).matcher(input).matches()
  }

  // This is visible for testing.
  static initTest(pattern, flags, re2) {
    if (pattern == null) {
      throw new Error('pattern is null')
    }
    if (re2 == null) {
      throw new Error('re2 is null')
    }
    const p = new RE2JS()
    p.patternInput = pattern
    p.flagsInput = flags
    p.re2Input = re2
    return p
  }

  /**
   * Releases memory used by internal caches associated with this pattern. Does not change the
   * observable behaviour. Useful for tests that detect memory leaks via allocation tracking.
   */
  reset() {
    this.re2Input.reset()
  }

  /**
   * Returns the flags used in the constructor.
   * @return {number}
   */
  flags() {
    return this.flagsInput
  }

  /**
   * Returns the pattern used in the constructor.
   * @return {string}
   */
  pattern() {
    return this.patternInput
  }

  re2() {
    return this.re2Input
  }

  /**
   * Matches a string against a regular expression.
   *
   * @param {*} input the input
   * @return {boolean} true if the regular expression matches the entire input
   */
  matches(input) {
    return this.matcher(input).matches()
  }

  /**
   * Creates a new {@code Matcher} matching the pattern against the input.
   *
   * @param {*} input the input string
   * @return {Matcher}
   */
  matcher(input) {
    if (Array.isArray(input)) {
      input = MatcherInput.utf8(input)
    }

    return new Matcher(this, input)
  }

  /**
   * Splits input around instances of the regular expression. It returns an array giving the strings
   * that occur before, between, and after instances of the regular expression.
   *
   * <p>
   * If {@code limit <= 0}, there is no limit on the size of the returned array. If
   * {@code limit == 0}, empty strings that would occur at the end of the array are omitted. If
   * {@code limit > 0}, at most limit strings are returned. The final string contains the remainder
   * of the input, possibly including additional matches of the pattern.
   *
   * @param {string} input the input string to be split
   * @param {number} limit the limit
   * @return {java.lang.String[]} the split strings
   */
  split(input, limit = 0) {
    const m = this.matcher(input)

    const result = []
    let emptiesSkipped = 0
    let last = 0

    while (m.find()) {
      if (last === 0 && m.end() === 0) {
        last = m.end()
        continue
      }

      if (limit > 0 && result.length === limit - 1) {
        break
      }

      if (last === m.start()) {
        if (limit === 0) {
          emptiesSkipped += 1
          last = m.end()
          continue
        }
      } else {
        while (emptiesSkipped > 0) {
          result.push('')
          emptiesSkipped -= 1
        }
      }

      result.push(m.substring(last, m.start()))
      last = m.end()
    }

    if (limit === 0 && last !== m.inputLength()) {
      while (emptiesSkipped > 0) {
        result.push('')
        emptiesSkipped -= 1
      }

      result.push(m.substring(last, m.inputLength()))
    }

    if (limit !== 0 || result.length === 0) {
      result.push(m.substring(last, m.inputLength()))
    }

    return result
  }

  toString() {
    return this.patternInput
  }

  /**
   * Returns the number of capturing groups in this matcher's pattern. Group zero denotes the entire
   * pattern and is excluded from this count.
   *
   * @return {number} the number of capturing groups in this pattern
   */
  groupCount() {
    return this.re2Input.numberOfCapturingGroups()
  }

  /**
   * Return a map of the capturing groups in this matcher's pattern, where key is the name and value
   * is the index of the group in the pattern.
   * @return {*}
   */
  namedGroups() {
    return this.re2Input.namedGroups
  }

  equals(other) {
    if (this === other) {
      return true
    }
    if (other === null || this.constructor !== other.constructor) {
      return false
    }

    return this.flagsInput === other.flagsInput && this.patternInput === other.patternInput
  }
}

export { RE2JS, RE2JSSyntaxException }
