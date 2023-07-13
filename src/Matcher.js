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

  find$() {
    let start = 0
    if (this.hasMatch) {
      start = this.groups[1]
      if (this.groups[0] === this.groups[1]) {
        start++
      }
    }
    return this.genMatch(start, RE2Flags.UNANCHORED)
  }
  find$int(start) {
    if (start < 0 || start > this.matcherInputLength) {
      throw Object.defineProperty(new Error('start index out of bounds: ' + start), '__classes', {
        configurable: true,
        value: [
          'java.lang.Throwable',
          'java.lang.IndexOutOfBoundsException',
          'java.lang.Object',
          'java.lang.RuntimeException',
          'java.lang.Exception'
        ]
      })
    }
    this.reset()
    return this.genMatch(start, 0)
  }
  /**
   * Matches the input against the pattern (unanchored), starting at a specified position. If there
   * is a match, {@code find} sets the match state to describe it.
   *
   * @param {number} start the input position where the search begins
   * @return {boolean} true if it finds a match
   * @throws IndexOutOfBoundsException if start is not a valid input position
   */
  find(start) {
    if (typeof start === 'number' || start === null) {
      return this.find$int(start)
    } else if (start === undefined) {
      return this.find$()
    } else {
      throw new Error('invalid overload')
    }
  }
  /**
   * Helper: does match starting at start, with RE2 anchor flag.
   * @param {number} startByte
   * @param {number} anchor
   * @return {boolean}
   * @private
   */
  /*private*/ genMatch(startByte, anchor) {
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
  appendReplacement$java_lang_StringBuffer$java_lang_String(sb, replacement) {
    const result = {
      str: '',
      toString: function () {
        return this.str
      }
    }
    this.appendReplacement$java_lang_StringBuilder$java_lang_String(result, replacement)
    /* append */
    ;((sb) => {
      sb.str += result
      return sb
    })(sb)
    return this
  }
  /**
   * Appends to {@code sb} two strings: the text from the append position up to the beginning of the
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
   * @param {{ str: string, toString: Function }} sb the {@link StringBuffer} to append to
   * @param {string} replacement the replacement string
   * @return {Matcher} the {@code Matcher} itself, for chained method calls
   * @throws IllegalStateException if there was no most recent match
   * @throws IndexOutOfBoundsException if replacement refers to an invalid group
   */
  appendReplacement(sb, replacement) {
    if (
      ((sb != null && sb instanceof Object) || sb === null) &&
      (typeof replacement === 'string' || replacement === null)
    ) {
      return this.appendReplacement$java_lang_StringBuffer$java_lang_String(sb, replacement)
    } else if (
      ((sb != null && sb instanceof Object) || sb === null) &&
      (typeof replacement === 'string' || replacement === null)
    ) {
      return this.appendReplacement$java_lang_StringBuilder$java_lang_String(sb, replacement)
    } else {
      throw new Error('invalid overload')
    }
  }
  appendReplacement$java_lang_StringBuilder$java_lang_String(sb, replacement) {
    const s = this.start()
    const e = this.end()
    if (this.appendPos < s) {
      /* append */ ;((sb) => {
        sb.str += this.substring(this.appendPos, s)
        return sb
      })(sb)
    }
    this.appendPos = e
    this.appendReplacementInternal(sb, replacement)
    return this
  }
  /*private*/ appendReplacementInternal(sb, replacement) {
    let last = 0
    let i = 0
    const m = replacement.length
    for (; i < m - 1; i++) {
      {
        if (
          ((c) => (c.codePointAt == null ? c : c.codePointAt(0)))(replacement.charAt(i)) ==
          '\\'.codePointAt(0)
        ) {
          if (last < i) {
            /* append */ ;((sb) => {
              sb.str += replacement.substring(last, i)
              return sb
            })(sb)
          }
          i++
          last = i
          continue
        }
        if (
          ((c) => (c.codePointAt == null ? c : c.codePointAt(0)))(replacement.charAt(i)) ==
          '$'.codePointAt(0)
        ) {
          let c = replacement.charAt(i + 1).codePointAt(0)
          if ('0'.codePointAt(0) <= c && c <= '9'.codePointAt(0)) {
            let n = c - '0'.codePointAt(0)
            if (last < i) {
              /* append */ ;((sb) => {
                sb.str += replacement.substring(last, i)
                return sb
              })(sb)
            }
            for (i += 2; i < m; i++) {
              {
                c = replacement.charAt(i).codePointAt(0)
                if (
                  c < '0'.codePointAt(0) ||
                  c > '9'.codePointAt(0) ||
                  n * 10 + c - '0'.codePointAt(0) > this.patternGroupCount
                ) {
                  break
                }
                n = n * 10 + c - '0'.codePointAt(0)
              }
            }
            if (n > this.patternGroupCount) {
              throw Object.defineProperty(new Error('n > number of groups: ' + n), '__classes', {
                configurable: true,
                value: [
                  'java.lang.Throwable',
                  'java.lang.IndexOutOfBoundsException',
                  'java.lang.Object',
                  'java.lang.RuntimeException',
                  'java.lang.Exception'
                ]
              })
            }
            const group = this.group(n)
            if (group != null) {
              /* append */ ;((sb) => {
                sb.str += group
                return sb
              })(sb)
            }
            last = i
            i--
            continue
          } else if (c == '{'.codePointAt(0)) {
            if (last < i) {
              /* append */ ;((sb) => {
                sb.str += replacement.substring(last, i)
                return sb
              })(sb)
            }
            i++
            let j = i + 1
            while (
              j < replacement.length &&
              ((c) => (c.codePointAt == null ? c : c.codePointAt(0)))(replacement.charAt(j)) !=
                '}'.codePointAt(0) &&
              ((c) => (c.codePointAt == null ? c : c.codePointAt(0)))(replacement.charAt(j)) !=
                ' '.codePointAt(0)
            ) {
              {
                j++
              }
            }

            if (
              j === replacement.length ||
              ((c) => (c.codePointAt == null ? c : c.codePointAt(0)))(replacement.charAt(j)) !=
                '}'.codePointAt(0)
            ) {
              throw Object.defineProperty(
                new Error("named capture group is missing trailing '}'"),
                '__classes',
                {
                  configurable: true,
                  value: [
                    'java.lang.Throwable',
                    'java.lang.Object',
                    'java.lang.RuntimeException',
                    'java.lang.IllegalArgumentException',
                    'java.lang.Exception'
                  ]
                }
              )
            }
            const groupName = replacement.substring(i + 1, j)
            /* append */ ;((sb) => {
              sb.str += this.group(groupName)
              return sb
            })(sb)
            last = j + 1
          }
        }
      }
    }
    if (last < m) {
      /* append */ ;((sb) => {
        sb.str += replacement.substr(last, m)
        return sb
      })(sb)
    }
  }
  appendTail$java_lang_StringBuffer(sb) {
    /* append */ ;((sb) => {
      sb.str += this.substring(this.appendPos, this.matcherInputLength)
      return sb
    })(sb)
    return sb
  }
  /**
   * Appends to {@code sb} the substring of the input from the append position to the end of the
   * input.
   *
   * @param {{ str: string, toString: Function }} sb the {@link StringBuffer} to append to
   * @return {{ str: string, toString: Function }} the argument {@code sb}, for method chaining
   */
  appendTail(sb) {
    if ((sb != null && sb instanceof Object) || sb === null) {
      return this.appendTail$java_lang_StringBuffer(sb)
    } else if ((sb != null && sb instanceof Object) || sb === null) {
      return this.appendTail$java_lang_StringBuilder(sb)
    } else {
      throw new Error('invalid overload')
    }
  }
  appendTail$java_lang_StringBuilder(sb) {
    /* append */ ;((sb) => {
      sb.str += this.substring(this.appendPos, this.matcherInputLength)
      return sb
    })(sb)
    return sb
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
  /*private*/ replace(replacement, all) {
    this.reset()
    const sb = {
      str: '',
      toString: function () {
        return this.str
      }
    }
    while (this.find$()) {
      this.appendReplacement$java_lang_StringBuffer$java_lang_String(sb, replacement)
      if (!all) {
        break
      }
    }

    this.appendTail$java_lang_StringBuffer(sb)
    return /* toString */ sb.str
  }
}

export { Matcher }
