/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
/**
 * A compiled representation of an RE2 regular expression, mimicking the
 * {@code java.util.regex.Pattern} API.
 *
 * <p>
 * The matching functions take {@code String} arguments instead of the more general Java
 * {@code CharSequence} since the latter doesn't provide UTF-16 decoding.
 *
 * <p>
 * See the <a href='package.html'>package-level documentation</a> for an overview of how to use this
 * API.
 * </p>
 *
 * @author rsc@google.com (Russ Cox)
 * @class
 */
import { MatcherInput } from './MatcherInput'
import { Matcher } from './Matcher'
import { RE2 } from './RE2'

export class Pattern {
  constructor(pattern, flags, re2) {
    if (this.__pattern === undefined) {
      this.__pattern = null
    }
    if (this.__flags === undefined) {
      this.__flags = 0
    }
    if (this.__re2 === undefined) {
      this.__re2 = null
    }
    if (pattern == null) {
      throw Object.defineProperty(new Error('pattern is null'), '__classes', {
        configurable: true,
        value: [
          'java.lang.Throwable',
          'java.lang.Object',
          'java.lang.RuntimeException',
          'java.lang.NullPointerException',
          'java.lang.Exception'
        ]
      })
    }
    if (re2 == null) {
      throw Object.defineProperty(new Error('re2 is null'), '__classes', {
        configurable: true,
        value: [
          'java.lang.Throwable',
          'java.lang.Object',
          'java.lang.RuntimeException',
          'java.lang.NullPointerException',
          'java.lang.Exception'
        ]
      })
    }
    this.__pattern = pattern
    this.__flags = flags
    this.__re2 = re2
  }
  /**
   * Releases memory used by internal caches associated with this pattern. Does not change the
   * observable behaviour. Useful for tests that detect memory leaks via allocation tracking.
   */
  reset() {
    this.__re2.reset()
  }
  /**
   * Returns the flags used in the constructor.
   * @return {number}
   */
  flags() {
    return this.__flags
  }
  /**
   * Returns the pattern used in the constructor.
   * @return {string}
   */
  pattern() {
    return this.__pattern
  }
  re2() {
    return this.__re2
  }
  static compile$java_lang_String(regex) {
    return Pattern.compile$java_lang_String$java_lang_String$int(regex, regex, 0)
  }
  static compile$java_lang_String$int(regex, flags) {
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
    if (
      (flags &
        ~(
          Pattern.MULTILINE |
          Pattern.DOTALL |
          Pattern.CASE_INSENSITIVE |
          Pattern.DISABLE_UNICODE_GROUPS |
          Pattern.LONGEST_MATCH
        )) !==
      0
    ) {
      throw Object.defineProperty(
        new Error(
          'Flags should only be a combination of MULTILINE, DOTALL, CASE_INSENSITIVE, DISABLE_UNICODE_GROUPS, LONGEST_MATCH'
        ),
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
    return Pattern.compile$java_lang_String$java_lang_String$int(flregex, regex, flags)
  }
  static compile$java_lang_String$java_lang_String$int(flregex, regex, flags) {
    let re2Flags = RE2.PERL_$LI$()
    if ((flags & Pattern.DISABLE_UNICODE_GROUPS) !== 0) {
      re2Flags &= ~RE2.UNICODE_GROUPS
    }
    return new Pattern(
      regex,
      flags,
      RE2.compileImpl(flregex, re2Flags, (flags & Pattern.LONGEST_MATCH) !== 0)
    )
  }
  /**
   * Helper: create new Pattern with given regex and flags. Flregex is the regex with flags applied.
   * @param {string} flregex
   * @param {string} regex
   * @param {number} flags
   * @return {Pattern}
   * @private
   */
  static compile(flregex, regex, flags) {
    if (
      (typeof flregex === 'string' || flregex === null) &&
      (typeof regex === 'string' || regex === null) &&
      (typeof flags === 'number' || flags === null)
    ) {
      return Pattern.compile$java_lang_String$java_lang_String$int(flregex, regex, flags)
    } else if (
      (typeof flregex === 'string' || flregex === null) &&
      (typeof regex === 'number' || regex === null) &&
      flags === undefined
    ) {
      return Pattern.compile$java_lang_String$int(flregex, regex)
    } else if (
      (typeof flregex === 'string' || flregex === null) &&
      regex === undefined &&
      flags === undefined
    ) {
      return Pattern.compile$java_lang_String(flregex)
    } else {
      throw new Error('invalid overload')
    }
  }
  static matches$java_lang_String$java_lang_CharSequence(regex, input) {
    return Pattern.compile$java_lang_String(regex).matcher$java_lang_CharSequence(input).matches()
  }
  /**
   * Matches a string against a regular expression.
   *
   * @param {string} regex the regular expression
   * @param {*} input the input
   * @return {boolean} true if the regular expression matches the entire input
   * @throws PatternSyntaxException if the regular expression is malformed
   */
  static matches(regex, input) {
    if (
      (typeof regex === 'string' || regex === null) &&
      ((input != null &&
        ((input.constructor != null &&
          input.constructor['__interfaces'] != null &&
          input.constructor['__interfaces'].indexOf('java.lang.CharSequence') >= 0) ||
          typeof input === 'string')) ||
        input === null)
    ) {
      return Pattern.matches$java_lang_String$java_lang_CharSequence(regex, input)
    } else if (
      (typeof regex === 'string' || regex === null) &&
      ((input != null &&
        input instanceof Array &&
        (input.length == 0 || input[0] == null || typeof input[0] === 'number')) ||
        input === null)
    ) {
      return Pattern.matches$java_lang_String$byte_A(regex, input)
    } else {
      throw new Error('invalid overload')
    }
  }
  static matches$java_lang_String$byte_A(regex, input) {
    return Pattern.compile$java_lang_String(regex).matcher$byte_A(input).matches()
  }
  matches$java_lang_String(input) {
    return this.matcher$java_lang_CharSequence(input).matches()
  }
  matches(input) {
    if (typeof input === 'string' || input === null) {
      return this.matches$java_lang_String(input)
    } else if (
      (input != null &&
        input instanceof Array &&
        (input.length == 0 || input[0] == null || typeof input[0] === 'number')) ||
      input === null
    ) {
      return this.matches$byte_A(input)
    } else {
      throw new Error('invalid overload')
    }
  }
  matches$byte_A(input) {
    return this.matcher$byte_A(input).matches()
  }
  matcher$java_lang_CharSequence(input) {
    return new Matcher(this, input)
  }
  /**
   * Creates a new {@code Matcher} matching the pattern against the input.
   *
   * @param {*} input the input string
   * @return {Matcher}
   */
  matcher(input) {
    if (
      (input != null &&
        ((input.constructor != null &&
          input.constructor['__interfaces'] != null &&
          input.constructor['__interfaces'].indexOf('java.lang.CharSequence') >= 0) ||
          typeof input === 'string')) ||
      input === null
    ) {
      return this.matcher$java_lang_CharSequence(input)
    } else if (
      (input != null &&
        input instanceof Array &&
        (input.length == 0 || input[0] == null || typeof input[0] === 'number')) ||
      input === null
    ) {
      return this.matcher$byte_A(input)
    } else if ((input != null && input instanceof MatcherInput) || input === null) {
      return this.matcher$quickstart_MatcherInput(input)
    } else {
      throw new Error('invalid overload')
    }
  }
  matcher$byte_A(input) {
    return new Matcher(this, MatcherInput.utf8$byte_A(input))
  }
  matcher$quickstart_MatcherInput(input) {
    return new Matcher(this, input)
  }
  split$java_lang_String(input) {
    return this.split$java_lang_String$int(input, 0)
  }
  split$java_lang_String$int(input, limit) {
    return this.split$quickstart_Matcher$int(new Matcher(this, input), limit)
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
  split(input, limit) {
    if (
      (typeof input === 'string' || input === null) &&
      (typeof limit === 'number' || limit === null)
    ) {
      return this.split$java_lang_String$int(input, limit)
    } else if (
      ((input != null && input instanceof Matcher) || input === null) &&
      (typeof limit === 'number' || limit === null)
    ) {
      return this.split$quickstart_Matcher$int(input, limit)
    } else if ((typeof input === 'string' || input === null) && limit === undefined) {
      return this.split$java_lang_String(input)
    } else {
      throw new Error('invalid overload')
    }
  }
  /*private*/ split$quickstart_Matcher$int(m, limit) {
    const result = []
    let emptiesSkipped = 0
    let last = 0
    while (m.find$()) {
      {
        if (last === 0 && m.end$() === 0) {
          last = m.end$()
          continue
        }
        if (limit > 0 && /* size */ result.length === limit - 1) {
          break
        }
        if (last === m.start$()) {
          if (limit === 0) {
            emptiesSkipped++
            last = m.end$()
            continue
          }
        } else {
          while (emptiesSkipped > 0) {
            {
              /* add */ result.push('') > 0
              emptiesSkipped--
            }
          }
        }
        /* add */ result.push(m.substring(last, m.start$())) > 0
        last = m.end$()
      }
    }

    if (limit === 0 && last !== m.inputLength()) {
      while (emptiesSkipped > 0) {
        {
          /* add */ result.push('') > 0
          emptiesSkipped--
        }
      }

      /* add */ result.push(m.substring(last, m.inputLength())) > 0
    }
    if (limit !== 0 || /* isEmpty */ result.length == 0) {
      /* add */ result.push(m.substring(last, m.inputLength())) > 0
    }
    return /* toArray */ result.slice(0)
  }
  /**
   * Returns a literal pattern string for the specified string.
   *
   * <p>
   * This method produces a string that can be used to create a <code>Pattern</code> that would
   * match the string <code>s</code> as if it were a literal pattern.
   * </p>
   * Metacharacters or escape sequences in the input sequence will be given no special meaning.
   *
   * @param {string} s The string to be literalized
   * @return {string} A literal string replacement
   */
  static quote(s) {
    return RE2.quoteMeta(s)
  }
  /**
   *
   * @return {string}
   */
  toString() {
    return this.__pattern
  }
  /**
   * Returns the number of capturing groups in this matcher's pattern. Group zero denotes the entire
   * pattern and is excluded from this count.
   *
   * @return {number} the number of capturing groups in this pattern
   */
  groupCount() {
    return this.__re2.numberOfCapturingGroups()
  }
  /**
   * Return a map of the capturing groups in this matcher's pattern, where key is the name and value
   * is the index of the group in the pattern.
   * @return {*}
   */
  namedGroups() {
    return Collections.unmodifiableMap(this.__re2.namedGroups)
  }
  readResolve() {
    return Pattern.compile$java_lang_String$int(this.__pattern, this.__flags)
  }
  /**
   *
   * @param {*} o
   * @return {boolean}
   */
  equals(o) {
    if (this === o) {
      return true
    }
    if (o == null || this.constructor !== o.constructor) {
      return false
    }
    const other = o
    return this.__flags === other.__flags && this.__pattern === other.__pattern
  }
  /**
   *
   * @return {number}
   */
  hashCode() {
    let result = ((o) => {
      if (o.hashCode) {
        return o.hashCode()
      } else {
        return o
          .toString()
          .split('')
          .reduce(
            (prevHash, currVal) => ((prevHash << 5) - prevHash + currVal.charCodeAt(0)) | 0,
            0
          )
      }
    })(this.__pattern)
    result = 31 * result + this.__flags
    return result
  }
}
/**
 * Flag: case insensitive matching.
 */
Pattern.CASE_INSENSITIVE = 1
/**
 * Flag: dot ({@code .}) matches all characters, including newline.
 */
Pattern.DOTALL = 2
/**
 * Flag: multiline matching: {@code ^} and {@code $} match at beginning and end of line, not just
 * beginning and end of input.
 */
Pattern.MULTILINE = 4
/**
 * Flag: Unicode groups (e.g. {@code \p\ Greek\} ) will be syntax errors.
 */
Pattern.DISABLE_UNICODE_GROUPS = 8
/**
 * Flag: matches longest possible string.
 */
Pattern.LONGEST_MATCH = 16
Pattern.serialVersionUID = 0
Pattern['__class'] = 'quickstart.Pattern'
