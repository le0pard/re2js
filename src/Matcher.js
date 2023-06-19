import { RE2Flags } from './RE2Flags'
import { MatcherInput } from './MatcherInput'

class Matcher {
  constructor(pattern, input) {
    if (pattern === null) {
      throw new Error('pattern is null')
    }
    this.pattern = pattern
    let re2 = pattern.re2()
    this.groupCount = re2.numberOfCapturingGroups()
    this.groups = new Array(2 + 2 * this.groupCount)
    this.namedGroups = re2.namedGroups

    if (input instanceof MatcherInput) {
      this.resetWithMatcherInput(input)
    } else {
      this.resetWithInput(input)
    }
  }

  // Returns the Pattern associated with this Matcher.
  pattern() {
    return this.pattern
  }

  // Resets the Matcher, rewinding input and discarding any match information.
  reset() {
    this.inputLength = this.matcherInput.length()
    this.appendPos = 0
    this.hasMatch = false
    this.hasGroups = false
    return this
  }

  // Resets the Matcher and changes the input.
  resetWithInput(input) {
    return this.resetWithMatcherInput(MatcherInput.utf16(input))
  }

  // Resets the Matcher and changes the input.
  resetWithBytes(bytes) {
    return this.resetWithMatcherInput(MatcherInput.utf8(bytes))
  }

  resetWithMatcherInput(input) {
    if (input === null) {
      throw new Error('input is null')
    }
    this.matcherInput = input
    return this.reset()
  }

  start(group = 0) {
    this.loadGroup(group)
    return this.groups[2 * group]
  }

  /**
   * Returns the start of the named group of the most recent match, or -1 if the group was not
   * matched.
   *
   * @param group the group name
   * @throws IllegalArgumentException if no group with that name exists
   */
  startNamedGroup(group) {
    let g = this.namedGroups.get(group)
    if (!g) {
      throw new Error("group '" + group + "' not found")
    }
    return this.start(g)
  }

  end(group = 0) {
    this.loadGroup(group)
    return this.groups[2 * group]
  }

  endNamedGroup(group) {
    let g = this.namedGroups.get(group)
    if (!g) {
      throw new Error("group '" + group + "' not found")
    }
    return this.end(g)
  }

  group(group = 0) {
    let start = this.start(group)
    let end = this.end(group)
    if (start < 0 && end < 0) {
      // Means the subpattern didn't get matched at all.
      return null
    }
    return this.substring(start, end)
  }

  /**
   * Returns the named group of the most recent match, or null if the group was not matched.
   *
   * @param group the group name
   * @throws Error if no group with that name exists
   */
  groupNamed(group) {
    let g = this.namedGroups.get(group)
    if (!g) {
      throw new Error("group '" + group + "' not found")
    }
    return this.group(g)
  }

  /**
  * Returns the number of subgroups in this pattern.
  *
  * @return the number of subgroups; the overall match (group 0) does not count
  */
  groupCount() {
    return this.groupCount
  }

  /** Helper: finds subgroup information if needed for group. */
  loadGroup(group) {
    if (group < 0 || group > this.groupCount()) {
      throw new RangeError('Group index out of bounds: ' + group)
    }
    if (!this.hasMatch) {
      throw new Error('perhaps no match attempted')
    }
    if (group === 0 || this.hasGroups) {
      return
    }

    // Include the character after the matched text (if there is one).
    // This is necessary in the case of inputSequence abc and pattern
    // (a)(b$)?(b)? . If we do pass in the trailing c,
    // the groups evaluate to new String[] {"ab", "a", null, "b" }
    // If we don't, they evaluate to new String[] {"ab", "a", "b", null}
    // We know it won't affect the total matched because the previous call
    // to match included the extra character, and it was not matched then.
    let end = this.groups[1] + 1
    if (end > this.inputLength) {
      end = this.inputLength
    }

    let ok =
      this.pattern.re2().match(this.matcherInput, this.groups[0], end, this.anchorFlag, this.groups, 1 + this.groupCount())
    // Must match - hasMatch says that the last call with these
    // parameters worked just fine.
    if (!ok) {
      throw new Error('inconsistency in matching group data')
    }
    this.hasGroups = true
  }

  /**
   * Matches the entire input against the pattern (anchored start and end). If there is a match,
   * {@code matches} sets the match state to describe it.
   *
   * @return true if the entire input matches the pattern
   */
  matches() {
    return this.genMatch(0, RE2Flags.ANCHOR_BOTH)
  }

  lookingAt() {
    return this.genMatch(0, RE2Flags.ANCHOR_START)
  }

  find(start = 0) {
    if (start === 0) {
      if (this.hasMatch) {
        start = this.groups[1]
        if (this.groups[0] === this.groups[1]) { // empty match - nudge forward
          start++
        }
      }
      return this.genMatch(start, RE2Flags.UNANCHORED)
    }

    if (start < 0 || start > this.inputLength) {
      throw new Error('start index out of bounds: ' + start)
    }
    this.reset()
    return this.genMatch(this.start, 0)
  }

  genMatch(startByte, anchor) {
    // TODO: Is matches/lookingAt supposed to reset the append or input positions?
    // From the JDK docs, looks like no.
    let ok = this.pattern.re2().match(this.matcherInput, startByte, this.inputLength, anchor, this.groups, 1)
    if (!ok) {
      return false
    }
    this.hasMatch = true
    this.hasGroups = false
    this.anchorFlag = anchor

    return true
  }

  substring(start, end) {
    // UTF_8 is matched in binary mode. So slice the bytes.
    if (this.matcherInput.getEncoding() === 'UTF-8') {
      return this.matcherInput.asBytes().slice(start, end).toString()
    }

    // This is fast for both StringBuilder and String.
    return this.matcherInput.asCharSequence().substring(start, end)
  }

  /** Helper for Pattern: return input length. */
  inputLength() {
    return this.inputLength
  }

  static quoteReplacement(s) {
    if (s.indexOf('\\') < 0 && s.indexOf('$') < 0) {
      return s
    }
    let sb = ''
    for (let i = 0; i < s.length; ++i) {
      let c = s.charAt(i)
      if (c === '\\' || c === '$') {
        sb += '\\'
      }
      sb += c
    }
    return sb
  }

  appendReplacement(sb, replacement) {
    let s = this.start()
    let e = this.end()
    if (this.appendPos < s) {
      sb += this.substring(this.appendPos, s)
    }
    this.appendPos = e
    this.appendReplacementInternal(sb, replacement)
    return this
  }

  appendReplacementInternal(sb, replacement) {
    let last = 0
    let i = 0
    let m = replacement.length
    for (; i < m - 1; i++) {
      if (replacement.charAt(i) === '\\') {
        if (last < i) {
          sb += replacement.substring(last, i)
        }
        i++
        last = i
        continue
      }
      if (replacement.charAt(i) === '$') {
        let c = replacement.charAt(i + 1)
        if ('0'.codePointAt(0) <= c && c <= '9'.codePointAt(0)) {
          let n = c - '0'.codePointAt(0)
          if (last < i) {
            sb += replacement.substring(last, i)
          }
          for (i += 2; i < m; i++) {
            c = replacement.charAt(i)
            if (c < '0' || c > '9' || n * 10 + c - '0'.codePointAt(0) > this.groupCount) {
              break
            }
            n = n * 10 + c - '0'.codePointAt(0)
          }
          if (n > this.groupCount) {
            throw new RangeError('n > number of groups: ' + n)
          }
          let group = this.group(n)
          if (group !== null) {
            sb += group
          }
          last = i
          i--
          continue
        } else if (c === '{'.codePointAt(0)) {
          if (last < i) {
            sb += replacement.substring(last, i)
          }
          i++ // skip {
          let j = i + 1
          while (j < replacement.length
            && replacement.charAt(j) !== '}'
            && replacement.charAt(j) !== ' ') {
            j++
          }
          if (j === replacement.length || replacement.charAt(j) !== '}') {
            throw new Error("named capture group is missing trailing '}'")
          }
          let groupName = replacement.substring(i + 1, j)
          sb += this.group(groupName)
          last = j + 1
        }
      }
    }
    if (last < m) {
      sb += replacement.substring(last, m)
    }
  }

  appendTail(sb) {
    sb += this.substring(this.appendPos, this.inputLength)
    return sb
  }

  replaceAll(replacement) {
    return this.replace(replacement, true)
  }

  replaceFirst(replacement) {
    return this.replace(replacement, false)
  }

  replace(replacement, all) {
    this.reset()
    let sb = ''
    while (this.find()) {
      this.appendReplacement(sb, replacement)
      if (!all) {
        break
      }
    }
    this.appendTail(sb)
    return sb
  }
}

export { Matcher }
