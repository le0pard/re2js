import { Codepoint } from './Codepoint.js'
import { RE2Flags } from './RE2Flags.js'
import { MachineInput } from './MachineInput.js'
import { MatcherInput, MatcherInputBase } from './MatcherInput.js'
import { Utils } from './Utils.js'
import { RE2JSGroupException } from './exceptions.js'

/**
 * A stateful iterator that interprets a regex {@code RE2JS} on a specific input.
 *
 * Conceptually, a Matcher consists of four parts:
 * <ol>
 * <li>A compiled regular expression {@code RE2JS}, set at construction and fixed for the lifetime
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
   * V8 and WebKit have historical hard limits on the number of arguments
   * that can be passed to a function. We cap replacer arguments to prevent
   * Call Stack Overflow (DoS) vulnerabilities on massive ASTs.
   */
  static MAX_REPLACER_ARGS = 65535

  /**
   * Quotes '\' and '$' in {@code s}, so that the returned string could be used in
   * {@link #appendReplacement} as a literal replacement of {@code s}.
   *
   * @param {string} str the string to be quoted
   * @param {boolean} [javaMode=false] whether the replacement will be used in javaMode
   * @returns {string} the quoted string
   */
  static quoteReplacement(str, javaMode = false) {
    if (javaMode) {
      // Java mode escape '\' and '$' with a backslash
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

    // In JS mode, '\' is not a special character, but '$' must be escaped as '$$'
    if (str.indexOf('$') < 0) {
      return str
    }
    return str
      .split('')
      .map((s) => {
        if (s.codePointAt(0) === Codepoint.CODES['$']) {
          return '$$'
        }
        return s
      })
      .join('')
  }
  /**
   *
   * @param {import('./index.js').RE2JS} pattern
   * @param {string|number[]|Uint8Array|MatcherInputBase} input
   */
  constructor(pattern, input) {
    if (pattern === null) {
      throw new Error('pattern is null')
    }
    /**
     * The pattern being matched.
     * @type {import('./index.js').RE2JS}
     */
    this.patternInput = pattern
    const re2 = this.patternInput.re2()
    // The number of submatches (groups) in the pattern.
    /** @type {number} */
    this.patternGroupCount = re2.numberOfCapturingGroups()
    // The group indexes, in [start, end) pairs.  Zeroth pair is overall match.
    /** @type {number[]} */
    this.groups = []
    /** @type {Record<string, number>} */
    this.namedGroups = re2.namedGroups
    /** @type {number} */
    this.numberOfInstructions = re2.numberOfInstructions()
    // Lookbehind automata state carried between successive matches over the current input, so
    // that find()/group() loops stay linear. null when the pattern has no lookbehinds.
    /** @type {import('./Machine.js').LookbehindState|null} */
    this.lookbehindState = null

    if (input instanceof MatcherInputBase) {
      this.resetMatcherInput(input)
    } else if (Utils.isByteArray(input)) {
      this.resetMatcherInput(MatcherInput.utf8(input))
    } else {
      this.resetMatcherInput(MatcherInput.utf16(input))
    }
  }

  /**
   * Returns the {@code RE2JS} associated with this {@code Matcher}.
   * @returns {import('./index.js').RE2JS}
   */
  pattern() {
    return this.patternInput
  }

  /**
   * Resets the {@code Matcher}, rewinding input and discarding any match information.
   *
   * @returns {Matcher} the {@code Matcher} itself, for chained method calls
   */
  reset() {
    // The input length in UTF16 codes.
    /** @type {number} */
    this.matcherInputLength = this.matcherInput.length()
    // The append position: where the next append should start.
    /** @type {number} */
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
   * @param {string|number[]|Uint8Array|MatcherInputBase} input
   * @returns {Matcher} the {@code Matcher} itself, for chained method calls
   */
  resetMatcherInput(input) {
    if (input === null) {
      throw new Error('input is null')
    }

    if (!(input instanceof MatcherInputBase)) {
      if (Utils.isByteArray(input)) {
        input = MatcherInput.utf8(input)
      } else {
        input = MatcherInput.utf16(input)
      }
    }

    this.matcherInput = input
    // The lookbehind state is specific to the input text: a new input must start from scratch.
    if (this.lookbehindState !== null) {
      this.lookbehindState.reset()
    } else {
      this.lookbehindState = this.patternInput.re2().createLookbehindState()
    }
    this.reset()
    return this
  }

  /**
   * Returns the start of the named group of the most recent match, or -1 if the group was not
   * matched.
   * @param {string|number} [group=0]
   * @returns {number}
   */
  start(group = 0) {
    if (typeof group === 'string') {
      const groupInt = this.namedGroups[group]
      if (!Number.isFinite(groupInt)) {
        throw new RE2JSGroupException(`group '${group}' not found`)
      }
      group = groupInt
    }

    this.loadGroup(group)
    return this.groups[2 * group]
  }

  /**
   * Returns the end of the named group of the most recent match, or -1 if the group was not
   * matched.
   * @param {string|number} [group=0]
   * @returns {number}
   */
  end(group = 0) {
    if (typeof group === 'string') {
      const groupInt = this.namedGroups[group]
      if (!Number.isFinite(groupInt)) {
        throw new RE2JSGroupException(`group '${group}' not found`)
      }
      group = groupInt
    }

    this.loadGroup(group)
    return this.groups[2 * group + 1]
  }

  /**
   * Returns the program size of this pattern.
   *
   * <p>
   * Similar to the C++ implementation, the program size is a very approximate measure of a regexp's
   * "cost". Larger numbers are more expensive than smaller numbers.
   * </p>
   *
   * @returns {number} the program size of this pattern
   */
  programSize() {
    return this.numberOfInstructions
  }

  /**
   * Returns the named group of the most recent match, or {@code null} if the group was not matched.
   * @param {string|number} [group=0]
   * @returns {string|null}
   */
  group(group = 0) {
    if (typeof group === 'string') {
      const groupInt = this.namedGroups[group]
      if (!Number.isFinite(groupInt)) {
        throw new RE2JSGroupException(`group '${group}' not found`)
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
   * Returns a dictionary map of all named capturing groups and their matched values.
   * If a group was not matched, its value will be `null`.
   * @returns {Record<string, string|null>}
   */
  getNamedGroups() {
    if (!this.hasMatch) {
      throw new RE2JSGroupException('perhaps no match attempted')
    }

    const result = Object.create(null)
    for (const name of Object.keys(this.namedGroups)) {
      result[name] = this.group(name)
    }
    return result
  }

  /**
   * Returns the number of subgroups in this pattern.
   *
   * @returns {number} the number of subgroups; the overall match (group 0) does not count
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
    // Java's int parameter rules out fractions and NaN, which would index the wrong slot here.
    if (!Number.isInteger(group) || group < 0 || group > this.patternGroupCount) {
      throw new RE2JSGroupException(`Group index out of bounds: ${group}`)
    }

    if (!this.hasMatch) {
      throw new RE2JSGroupException('perhaps no match attempted')
    }

    if (group === 0 || this.hasGroups) {
      return
    }

    const end = this.matcherInputLength

    const res = this.patternInput
      .re2()
      .matchMachineInput(
        this.matcherInput,
        this.groups[0],
        end,
        this.anchorFlag,
        1 + this.patternGroupCount,
        this.lookbehindState
      )

    const ok = res[0]
    if (!ok) {
      throw new RE2JSGroupException('inconsistency in matching group data')
    }
    this.groups = res[1]
    this.hasGroups = true
  }

  /**
   * Matches the entire input against the pattern (anchored start and end). If there is a match,
   * {@code matches} sets the match state to describe it.
   *
   * @returns {boolean} true if the entire input matches the pattern
   */
  matches() {
    return this.genMatch(0, RE2Flags.ANCHOR_BOTH)
  }

  /**
   * Matches the beginning of input against the pattern (anchored start). If there is a match,
   * {@code lookingAt} sets the match state to describe it.
   *
   * @returns {boolean} true if the beginning of the input matches the pattern
   */
  lookingAt() {
    return this.genMatch(0, RE2Flags.ANCHOR_START)
  }

  /**
   * Matches the input against the pattern (unanchored), starting at a specified position. If there
   * is a match, {@code find} sets the match state to describe it.
   *
   * @param {number|null} [start=null] the input position where the search begins
   * @returns {boolean} if it finds a match
   * @throws IndexOutOfBoundsException if start is not a valid input position
   */
  find(start = null) {
    if (start !== null) {
      // Java's int parameter rules out fractions, NaN and strings, which would corrupt positions.
      if (!Number.isInteger(start) || start < 0 || start > this.matcherInputLength) {
        throw new RE2JSGroupException(`start index out of bounds: ${start}`)
      }
      this.reset()
      return this.genMatch(start, 0)
    }
    // no start
    start = 0
    if (this.hasMatch) {
      start = this.groups[1]
      if (this.groups[0] === this.groups[1]) {
        // Safely calculate structural encoding width to avoid sequence corruption
        const machineInput = this.matcherInput.isUTF16Encoding()
          ? MachineInput.fromUTF16(this.matcherInput.asCharSequence(), 0, this.matcherInputLength)
          : MachineInput.fromUTF8(this.matcherInput.asBytes(), 0, this.matcherInputLength)

        const r = machineInput.step(start)
        if (r < 0) {
          // EOF
          start++ // Advance past length to force loop exit
        } else {
          start += r & 7 // Advance by safely decoded width
        }
      }
    }

    return this.genMatch(start, RE2Flags.UNANCHORED)
  }

  /**
   * Helper: does match starting at start, with RE2 anchor flag.
   * @param {number} startByte
   * @param {number} anchor
   * @returns {boolean}
   * @private
   */
  genMatch(startByte, anchor) {
    const res = this.patternInput
      .re2()
      .matchMachineInput(
        this.matcherInput,
        startByte,
        this.matcherInputLength,
        anchor,
        1,
        this.lookbehindState
      )

    const ok = res[0]
    if (!ok) {
      this.hasMatch = false
      return false
    }
    this.groups = res[1]
    this.hasMatch = true
    this.hasGroups = this.patternGroupCount === 0
    this.anchorFlag = anchor
    return true
  }

  /**
   * Helper: return substring for [start, end).
   * @param {number} start
   * @param {number} end
   * @returns {string}
   */
  substring(start, end) {
    if (this.matcherInput.isUTF8Encoding()) {
      return Utils.utf8ByteArrayToString(this.matcherInput.asBytes().slice(start, end))
    }
    return this.matcherInput.asCharSequence().substring(start, end).toString()
  }

  /**
   * Helper for Pattern: return input length.
   * @returns {number}
   */
  inputLength() {
    return this.matcherInputLength
  }

  /**
   * Appends to result two strings: the text from the append position up to the beginning of the
   * most recent match, and then the replacement with submatch groups substituted for references to
   * them. It advances the append position to where the most recent match ended.
   *
   * By default the replacement is expanded as by String.prototype.replace (see
   * appendReplacementInternalJs). In Java mode it follows re2j / java.util.regex: $n takes as
   * many digits as still form a valid group number, ${name} is a named group, and a backslash
   * escapes the next character (so "\\$" in a JS string literal inserts a literal $).
   *
   * @param {string} replacement the replacement string
   * @param {boolean} [javaMode=false] activate java mode (different behaviour for capture groups and special characters)
   * @returns {string}
   * @throws IllegalStateException if there was no most recent match
   * @throws IndexOutOfBoundsException in Java mode, if replacement refers to an invalid group
   * @private
   */
  appendReplacement(replacement, javaMode = false) {
    let res = ''
    const s = this.start()
    const e = this.end()
    if (this.appendPos < s) {
      res += this.substring(this.appendPos, s)
    }
    this.appendPos = e
    res += javaMode
      ? this.appendReplacementInternalJava(replacement)
      : this.appendReplacementInternalJs(replacement)
    return res
  }

  /**
   * @param {string} replacement - the replacement string
   * @returns {string}
   * @private
   */
  appendReplacementInternalJava(replacement) {
    let res = ''
    let last = 0
    const m = replacement.length
    let i = 0

    while (i < m) {
      const cCode = replacement.codePointAt(i)

      if (cCode === Codepoint.CODES['\\']) {
        if (last < i) {
          res += replacement.substring(last, i)
        }
        i++
        if (i >= m) {
          throw new RE2JSGroupException('character to be escaped is missing')
        }
        last = i
        i++
        continue
      }

      if (cCode === Codepoint.CODES['$']) {
        if (last < i) {
          res += replacement.substring(last, i)
        }
        if (i + 1 >= m) {
          throw new RE2JSGroupException('Illegal group reference: group index is missing')
        }

        const nextCode = replacement.codePointAt(i + 1)

        if (Codepoint.CODES['0'] <= nextCode && nextCode <= Codepoint.CODES['9']) {
          // The group number is the longest run of digits that is still a valid group
          // (re2j / java.util.regex): with one group, "$10" is group 1 followed by "0".
          let n = nextCode - Codepoint.CODES['0']
          let j = i + 2
          for (; j < m; j++) {
            const digit = replacement.codePointAt(j)
            if (
              digit < Codepoint.CODES['0'] ||
              digit > Codepoint.CODES['9'] ||
              n * 10 + digit - Codepoint.CODES['0'] > this.patternGroupCount
            ) {
              break
            }
            n = n * 10 + digit - Codepoint.CODES['0']
          }

          if (n > this.patternGroupCount) {
            throw new RE2JSGroupException(`n > number of groups: ${n}`)
          }

          const group = this.group(n)
          if (group !== null) {
            res += group
          }
          i = j
          last = i
        } else if (nextCode === Codepoint.CODES['{']) {
          let j = i + 2
          while (j < m && replacement.codePointAt(j) !== Codepoint.CODES['}']) {
            j++
          }
          if (j >= m) {
            throw new RE2JSGroupException("named capture group is missing trailing '}'")
          }
          const groupName = replacement.substring(i + 2, j)
          const groupVal = this.group(groupName)
          if (groupVal !== null) {
            res += groupVal
          }
          i = j + 1
          last = i
        } else {
          throw new RE2JSGroupException('Illegal group reference')
        }
        continue
      }
      i++
    }

    if (last < m) {
      res += replacement.substring(last, m)
    }

    return res
  }

  /**
   * Expands |replacement| for the current match by the rules of String.prototype.replace
   * (ECMAScript GetSubstitution): $$ is "$", $& the match, $` the text before it, $' the text
   * after it, $n and $nn a group (two digits only when they form a valid group number, so with
   * one group "$10" is group 1 then "0"; an unmatched group is empty), and $<name> a named group
   * (empty when no such group), only when the pattern has named groups. Anything else, such as
   * "$0" or "$<" without a closing ">", is kept as is.
   * @param {string} replacement - the replacement string
   * @returns {string}
   * @private
   */
  appendReplacementInternalJs(replacement) {
    const isDigit = (c) => c >= 0x30 && c <= 0x39 // '0'-'9'
    const groupCount = this.patternGroupCount
    let res = ''
    let i = 0
    while (i < replacement.length) {
      const dollar = replacement.indexOf('$', i)
      if (dollar < 0) {
        break
      }
      res += replacement.substring(i, dollar)
      i = dollar
      const c = replacement.charCodeAt(i + 1)

      if (c === Codepoint.CODES['$']) {
        res += '$'
        i += 2
      } else if (c === Codepoint.CODES['&']) {
        res += this.group(0)
        i += 2
      } else if (c === Codepoint.CODES['`']) {
        res += this.substring(0, this.start(0))
        i += 2
      } else if (c === Codepoint.CODES["'"]) {
        res += this.substring(this.end(0), this.matcherInputLength)
        i += 2
      } else if (isDigit(c)) {
        let digits = 1
        let index = c - 0x30
        const c2 = replacement.charCodeAt(i + 2)
        if (isDigit(c2) && index * 10 + c2 - 0x30 <= groupCount) {
          digits = 2
          index = index * 10 + c2 - 0x30
        }
        if (index >= 1 && index <= groupCount) {
          const group = this.group(index)
          if (group !== null) {
            res += group
          }
        } else {
          res += replacement.substring(i, i + 1 + digits)
        }
        i += 1 + digits
      } else if (c === Codepoint.CODES['<'] && Object.keys(this.namedGroups).length > 0) {
        const gt = replacement.indexOf('>', i + 2)
        if (gt < 0) {
          res += '$<'
          i += 2
        } else {
          const name = replacement.substring(i + 2, gt)
          if (Object.prototype.hasOwnProperty.call(this.namedGroups, name)) {
            const group = this.group(name)
            if (group !== null) {
              res += group
            }
          }
          i = gt + 1
        }
      } else {
        res += '$'
        i += 1
      }
    }
    return res + replacement.substring(i)
  }

  /**
   * Return the substring of the input from the append position to the end of the
   * input.
   * @returns {string}
   */
  appendTail() {
    return this.substring(this.appendPos, this.matcherInputLength)
  }

  /**
   * Returns the input with all matches replaced by {@code replacement}, interpreted as for
   * {@code appendReplacement}.
   *
   * @param {string|((...args: any[]) => string)} replacement - the replacement string or a replacer function
   * @param {boolean} [javaMode=false] - activate java mode (different behaviour for capture groups and special characters)
   * @returns {string} the input string with the matches replaced
   * @throws IndexOutOfBoundsException if replacement refers to an invalid group and javaMode is true
   */
  replaceAll(replacement, javaMode = false) {
    return this.replace(replacement, true, javaMode)
  }

  /**
   * Returns the input with the first match replaced by {@code replacement}, interpreted as for
   * {@code appendReplacement}.
   *
   * @param {string|((...args: any[]) => string)} replacement - the replacement string or a replacer function
   * @param {boolean} [javaMode=false] - activate java mode (different behaviour for capture groups and special characters)
   * @returns {string} the input string with the first match replaced
   * @throws IndexOutOfBoundsException if replacement refers to an invalid group and javaMode is true
   */
  replaceFirst(replacement, javaMode = false) {
    return this.replace(replacement, false, javaMode)
  }

  /**
   * Helper: replaceAll/replaceFirst hybrid.
   * @param {string|((...args: any[]) => string)} replacement - the replacement string or a replacer function
   * @param {boolean} [all=true] - replace all matches
   * @param {boolean} [javaMode=false] - activate java mode (different behaviour for capture groups and special characters)
   * @returns {string}
   * @private
   */
  replace(replacement, all = true, javaMode = false) {
    let res = ''

    this.reset()

    const isFunc = typeof replacement === 'function'

    // Cache named groups check to avoid GC thrashing on every match
    const hasNamedGroups = Object.keys(this.namedGroups).length > 0

    let originalInput = null

    if (isFunc) {
      // Prevent V8 Call Stack Overflow (DoS vector) on massive capture group counts
      if (this.groupCount() >= Matcher.MAX_REPLACER_ARGS) {
        throw new RE2JSGroupException('Too many capture groups to safely invoke replacer function')
      }
      // Resolve the original input reference exactly once outside the hot loop
      originalInput = this.matcherInput.isUTF8Encoding()
        ? this.matcherInput.asBytes()
        : this.matcherInput.asCharSequence()
    }

    while (this.find()) {
      res += isFunc
        ? this.appendReplacementFunc(replacement, hasNamedGroups, originalInput)
        : this.appendReplacement(replacement, javaMode)

      if (!all) {
        break
      }
    }

    res += this.appendTail()
    return res
  }

  /**
   * Evaluates a replacer function for the current match and appends the result,
   * along with any un-matched preceding text, advancing the append position.
   * @param {Function} replacer - the replacer function
   * @param {boolean} hasNamedGroups - cached flag if pattern has named groups
   * @param {string|Uint8Array|number[]} originalInput - the cached original input reference
   * @returns {string} the evaluated string to append
   * @private
   */
  appendReplacementFunc(replacer, hasNamedGroups, originalInput) {
    let res = ''
    const s = this.start()
    const e = this.end()

    if (this.appendPos < s) {
      res += this.substring(this.appendPos, s)
    }
    this.appendPos = e

    const args = this.buildReplacerArgs(s, hasNamedGroups, originalInput)

    res += String(replacer(...args))
    return res
  }

  /**
   * Builds the argument array for the replacer function matching the standard
   * JS String.prototype.replace(regex, replacer) signature.
   * @param {number} matchStart - the start index of the match
   * @param {boolean} hasNamedGroups - cached flag if pattern has named groups
   * @param {string|Uint8Array|number[]} originalInput - the cached original input reference
   * @returns {Array} array of arguments
   * @private
   */
  buildReplacerArgs(matchStart, hasNamedGroups, originalInput) {
    const args = [this.group(0)] // match

    const numGroups = this.groupCount()
    // Fast-path capture group extraction
    for (let i = 1; i <= numGroups; i++) {
      const start = this.start(i)
      if (start < 0) {
        args.push(void 0)
      } else {
        args.push(this.substring(start, this.end(i)))
      }
    }

    args.push(matchStart) // offset
    args.push(originalInput) // original string (cached)

    // Append named groups object if pattern contains them
    if (hasNamedGroups) {
      const parsedGroups = this.getNamedGroups()
      for (const key in parsedGroups) {
        if (parsedGroups[key] === null) {
          parsedGroups[key] = void 0
        }
      }
      args.push(parsedGroups)
    }

    return args
  }
}

export { Matcher }
