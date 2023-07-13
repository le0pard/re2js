import { Codepoint } from './Codepoint'
import { RE2Flags } from './RE2Flags'
import { MatcherInput, MatcherInputBase } from './MatcherInput'
import { Utils } from './Utils'

/**
 * A stateful iterator that interprets a regex {@code Pattern} on a specific input. Its interface
 * mimics the JDK 1.4.2 {@code java.util.regex.Matcher}.
 *
 * <p>
 * Conceptually, a Matcher consists of four parts:
 * <ol>
 * <li>A compiled regular expression {@code Pattern}, set at construction and fixed for the lifetime
 * of the matcher.</li>
 *
 * <li>The remainder of the input string, set at construction or {@link #reset()} and advanced by
 * each match operation such as {@link #find}, {@link #matches} or {@link #lookingAt}.</li>
 *
 * <li>The current match information, accessible via {@link #start}, {@link #end}, and
 * {@link #group}, and updated by each match operation.</li>
 *
 * <li>The append position, used and advanced by {@link #appendReplacement} and {@link #appendTail}
 * if performing a search and replace from the input to an external {@code StringBuffer}.
 *
 * </ol>
 *
 *
 * @author rsc@google.com (Russ Cox)
 */
class Matcher {
  /**
   * Quotes '\' and '$' in {@code s}, so that the returned string could be used in
   * {@link #appendReplacement} as a literal replacement of {@code s}.
   *
   * @param {string} s the string to be quoted
   * @return {string} the quoted string
   */
  static quoteReplacement(str) {
    if (str.indexOf('\\') < 0 && str.indexOf('$') < 0) {
      return str
    }

    return str
      .split('')
      .map((s) => {
        const c = s.codePointAt(0)
        if (c === Codepoint.CODES['\\'] || c === Codepoint.CODES['$']) {
          return `\\${s}`
        }
        return s
      })
      .join('')
  }

  constructor(pattern, input) {
    if (pattern === null) {
      throw new Error('pattern is null')
    }
    // The pattern being matched.
    this.patternInput = pattern
    const re2 = this.patternInput.re2()
    // The number of submatches (groups) in the pattern.
    this.patternGroupCount = re2.numberOfCapturingGroups()
    // The group indexes, in [start, end) pairs.  Zeroth pair is overall match.
    this.groups = []
    this.namedGroups = re2.namedGroups

    if (input instanceof MatcherInputBase) {
      this.resetMatcherInput(input)
    } else if (Array.isArray(input)) {
      this.resetMatcherInput(MatcherInput.utf8(input))
    } else {
      this.resetMatcherInput(MatcherInput.utf16(input))
    }
  }

  /** Returns the {@code Pattern} associated with this {@code Matcher}. */
  pattern() {
    return this.patternInput
  }

  /**
   * Resets the {@code Matcher}, rewinding input and discarding any match information.
   *
   * @return the {@code Matcher} itself, for chained method calls
   */
  reset() {
    // The input length in UTF16 codes.
    this.matcherInputLength = this.matcherInput.length()
    // The append position: where the next append should start.
    this.appendPos = 0
    // Is there a current match?
    this.hasMatch = false
    // Have we found the submatches (groups) of the current match?
    // group[0], group[1] are set regardless.
    this.hasGroups = false
    // The anchor flag to use when repeating the match to find subgroups.
    this.anchorFlag = 0
    return this
  }

  /**
   * Resets the {@code Matcher} and changes the input.
   *
   */
  resetMatcherInput(input) {
    if (input === null) {
      throw new Error('input is null')
    }
    this.matcherInput = input
    this.reset()
    return this
  }

  /**
   * Returns the start of the named group of the most recent match, or -1 if the group was not
   * matched.
   *
   */
  start(group = 0) {
    if (typeof group === 'string') {
      const groupInt = this.namedGroups[group]
      if (!Number.isFinite(groupInt)) {
        throw new Error(`group '${group}' not found`)
      }
      group = groupInt
    }

    this.loadGroup(group)
    return this.groups[2 * group]
  }
  /**
   * Returns the end of the named group of the most recent match, or -1 if the group was not
   * matched.
   *
   */
  end(group = 0) {
    if (typeof group === 'string') {
      const groupInt = this.namedGroups[group]
      if (!Number.isFinite(groupInt)) {
        throw new Error(`group '${group}' not found`)
      }
      group = groupInt
    }

    this.loadGroup(group)
    return this.groups[2 * group + 1]
  }

  /**
   * Returns the named group of the most recent match, or {@code null} if the group was not matched.
   *
   */
  group(group = 0) {
    if (typeof group === 'string') {
      const groupInt = this.namedGroups[group]
      if (!Number.isFinite(groupInt)) {
        throw new Error(`group '${group}' not found`)
      }
      group = groupInt
    }

    const start = this.start(group)
    const end = this.end(group)
    if (start < 0 && end < 0) {
      return null
    }
    return this.substring(start, end)
  }
  /**
   * Returns the number of subgroups in this pattern.
   *
   * @return {number} the number of subgroups; the overall match (group 0) does not count
   */
  groupCount() {
    return this.patternGroupCount
  }

  /**
   * Helper: finds subgroup information if needed for group.
   * @param {number} group
   * @private
   */
  loadGroup(group) {
    if (group < 0 || group > this.patternGroupCount) {
      throw new Error(`Group index out of bounds: ${group}`)
    }

    if (!this.hasMatch) {
      throw new Error('perhaps no match attempted')
    }

    if (group === 0 || this.hasGroups) {
      return
    }

    let end = this.groups[1] + 1
    if (end > this.matcherInputLength) {
      end = this.matcherInputLength
    }

    const res = this.patternInput
      .re2()
      .matchMachineInput(
        this.matcherInput,
        this.groups[0],
        end,
        this.anchorFlag,
        1 + this.patternGroupCount
      )

    const ok = res[0]
    if (!ok) {
      throw new Error('inconsistency in matching group data')
    }
    this.groups = res[1]
    this.hasGroups = true
  }

  /**
   * Matches the entire input against the pattern (anchored start and end). If there is a match,
   * {@code matches} sets the match state to describe it.
   *
   * @return {boolean} true if the entire input matches the pattern
   */
  matches() {
    return this.genMatch(0, RE2Flags.ANCHOR_BOTH)
  }

  /**
   * Matches the beginning of input against the pattern (anchored start). If there is a match,
   * {@code lookingAt} sets the match state to describe it.
   *
   * @return {boolean} true if the beginning of the input matches the pattern
   */
  lookingAt() {
    return this.genMatch(0, RE2Flags.ANCHOR_START)
  }

  /**
   * Matches the input against the pattern (unanchored), starting at a specified position. If there
   * is a match, {@code find} sets the match state to describe it.
   *
   * @param start the input position where the search begins
   * @return true if it finds a match
   * @throws IndexOutOfBoundsException if start is not a valid input position
   */
  find(start = null) {
    if (start !== null) {
      if (start < 0 || start > this.matcherInputLength) {
        throw new Error(`start index out of bounds: ${start}`)
      }
      this.reset()
      return this.genMatch(start, 0)
    }
    // no start
    start = 0
    if (this.hasMatch) {
      start = this.groups[1]
      if (this.groups[0] === this.groups[1]) {
        start++
      }
    }

    return this.genMatch(start, RE2Flags.UNANCHORED)
  }

  /**
   * Helper: does match starting at start, with RE2 anchor flag.
   * @param {number} startByte
   * @param {number} anchor
   * @return {boolean}
   * @private
   */
  genMatch(startByte, anchor) {
    const res = this.patternInput
      .re2()
      .matchMachineInput(this.matcherInput, startByte, this.matcherInputLength, anchor, 1)

    const ok = res[0]
    if (!ok) {
      return false
    }
    this.groups = res[1]
    this.hasMatch = true
    this.hasGroups = false
    this.anchorFlag = anchor
    return true
  }

  /**
   * Helper: return substring for [start, end).
   * @param {number} start
   * @param {number} end
   * @return {string}
   */
  substring(start, end) {
    if (this.matcherInput.isUTF8Encoding()) {
      return Utils.utf8ByteArrayToString(this.matcherInput.asBytes().slice(start, end))
    }
    return this.matcherInput.asCharSequence().substring(start, end).toString()
  }

  /**
   * Helper for Pattern: return input length.
   * @return {number}
   */
  inputLength() {
    return this.matcherInputLength
  }

  /**
   * Appends to result two strings: the text from the append position up to the beginning of the
   * most recent match, and then the replacement with submatch groups substituted for references of
   * the form {@code $n}, where {@code n} is the group number in decimal. It advances the append
   * position to where the most recent match ended.
   *
   * <p>
   * To embed a literal {@code $}, use \$ (actually {@code "\\$"} with string escapes). The escape
   * is only necessary when {@code $} is followed by a digit, but it is always allowed. Only
   * {@code $} and {@code \} need escaping, but any character can be escaped.
   *
   * <p>
   * The group number {@code n} in {@code $n} is always at least one digit and expands to use more
   * digits as long as the resulting number is a valid group number for this pattern. To cut it off
   * earlier, escape the first digit that should not be used.
   *
   * @param sb the {@link StringBuilder} to append to
   * @param replacement the replacement string
   * @return the {@code Matcher} itself, for chained method calls
   * @throws IllegalStateException if there was no most recent match
   * @throws IndexOutOfBoundsException if replacement refers to an invalid group
   */
  appendReplacement(replacement) {
    let res = ''
    const s = this.start()
    const e = this.end()
    if (this.appendPos < s) {
      res += this.substring(this.appendPos, s)
    }
    this.appendPos = e
    res += this.appendReplacementInternal(replacement)
    return res
  }

  appendReplacementInternal(replacement) {
    let res = ''
    let last = 0
    const m = replacement.length

    for (let i = 0; i < m - 1; i++) {
      if (replacement.codePointAt(i) === Codepoint.CODES.get('\\')) {
        if (last < i) {
          res += replacement.substring(last, i)
        }

        i++
        last = i
        continue
      }

      if (replacement.codePointAt(i) === Codepoint.CODES.get('$')) {
        let c = replacement.codePointAt(i + 1)

        if (Codepoint.CODES.get('0') <= c && c <= Codepoint.CODES.get('9')) {
          let n = c - Codepoint.CODES.get('0')
          if (last < i) {
            res += replacement.substring(last, i)
          }

          for (i += 2; i < m; i++) {
            c = replacement.codePointAt(i)
            if (
              c < Codepoint.CODES.get('0') ||
              c > Codepoint.CODES.get('9') ||
              n * 10 + c - Codepoint.CODES.get('0') > this.patternGroupCount
            ) {
              break
            }
            n = n * 10 + c - Codepoint.CODES.get('0')
          }

          if (n > this.patternGroupCount) {
            throw new Error(`n > number of groups: ${n}`)
          }

          const group = this.group(n)
          if (group != null) {
            res += group
          }

          last = i
          i--
          continue
        } else if (c === Codepoint.CODES.get('{')) {
          if (last < i) {
            res += replacement.substring(last, i)
          }

          i++
          let j = i + 1
          while (
            j < replacement.length &&
            replacement.codePointAt(j) !== Codepoint.CODES.get('}') &&
            replacement.codePointAt(j) !== Codepoint.CODES.get(' ')
          ) {
            j++
          }

          if (j === replacement.length || replacement.codePointAt(j) !== Codepoint.CODES.get('}')) {
            throw new Error("named capture group is missing trailing '}'")
          }

          const groupName = replacement.substring(i + 1, j)
          res += this.group(groupName)
          last = j + 1
        }
      }
    }

    if (last < m) {
      res += replacement.substr(last, m)
    }

    return res
  }

  /**
   * Return the substring of the input from the append position to the end of the
   * input.
   *
   */
  appendTail() {
    return this.substring(this.appendPos, this.matcherInputLength)
  }

  /**
   * Returns the input with all matches replaced by {@code replacement}, interpreted as for
   * {@code appendReplacement}.
   *
   * @param {string} replacement the replacement string
   * @return {string} the input string with the matches replaced
   * @throws IndexOutOfBoundsException if replacement refers to an invalid group
   */
  replaceAll(replacement) {
    return this.replace(replacement, true)
  }

  /**
   * Returns the input with the first match replaced by {@code replacement}, interpreted as for
   * {@code appendReplacement}.
   *
   * @param {string} replacement the replacement string
   * @return {string} the input string with the first match replaced
   * @throws IndexOutOfBoundsException if replacement refers to an invalid group
   */
  replaceFirst(replacement) {
    return this.replace(replacement, false)
  }

  /**
   * Helper: replaceAll/replaceFirst hybrid.
   * @param {string} replacement
   * @param {boolean} all
   * @return {string}
   * @private
   */
  replace(replacement, all) {
    let res = ''

    this.reset()
    while (this.find()) {
      res += this.appendReplacement(replacement)
      if (!all) {
        break
      }
    }

    res += this.appendTail()
    return res
  }
}

export { Matcher }
