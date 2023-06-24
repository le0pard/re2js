/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
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
 * <p>
 * See the <a href="package.html">package-level documentation</a> for an overview of how to use this
 * API.
 * </p>
 *
 * @author rsc@google.com (Russ Cox)
 * @class
 */
import { RE2Flags } from './RE2Flags'
import { MatcherInput } from './MatcherInput'

export class Matcher {
    constructor(pattern, input) {
        if (((pattern != null && pattern.constructor['__class'] === 'quickstart.Pattern') || pattern === null) && ((input != null && (input.constructor != null && input.constructor['__interfaces'] != null && input.constructor['__interfaces'].indexOf('java.lang.CharSequence') >= 0 || typeof input === 'string')) || input === null)) {
            let __args = arguments
            {
                let __args = arguments
                if (this.__pattern === undefined) {
                    this.__pattern = null
                }
                if (this.groups === undefined) {
                    this.groups = null
                }
                if (this.namedGroups === undefined) {
                    this.namedGroups = null
                }
                if (this.__groupCount === undefined) {
                    this.__groupCount = 0
                }
                if (this.matcherInput === undefined) {
                    this.matcherInput = null
                }
                if (this.__inputLength === undefined) {
                    this.__inputLength = 0
                }
                if (this.appendPos === undefined) {
                    this.appendPos = 0
                }
                if (this.hasMatch === undefined) {
                    this.hasMatch = false
                }
                if (this.hasGroups === undefined) {
                    this.hasGroups = false
                }
                if (this.anchorFlag === undefined) {
                    this.anchorFlag = 0
                }
                if (pattern == null) {
                    throw Object.defineProperty(new Error('pattern is null'), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.NullPointerException', 'java.lang.Exception'] })
                }
                this.__pattern = pattern
                const re2 = pattern.re2()
                this.__groupCount = re2.numberOfCapturingGroups()
                this.groups = (s => {
 let a = []; while (s-- > 0) {a.push(0)} return a
})(2 + 2 * this.__groupCount)
                this.namedGroups = re2.namedGroups
            }
            if (this.__pattern === undefined) {
                this.__pattern = null
            }
            if (this.groups === undefined) {
                this.groups = null
            }
            if (this.namedGroups === undefined) {
                this.namedGroups = null
            }
            if (this.__groupCount === undefined) {
                this.__groupCount = 0
            }
            if (this.matcherInput === undefined) {
                this.matcherInput = null
            }
            if (this.__inputLength === undefined) {
                this.__inputLength = 0
            }
            if (this.appendPos === undefined) {
                this.appendPos = 0
            }
            if (this.hasMatch === undefined) {
                this.hasMatch = false
            }
            if (this.hasGroups === undefined) {
                this.hasGroups = false
            }
            if (this.anchorFlag === undefined) {
                this.anchorFlag = 0
            }
            (() => {
                this.reset$java_lang_CharSequence(input)
            })()
        } else if (((pattern != null && pattern.constructor['__class'] === 'quickstart.Pattern') || pattern === null) && ((input != null && input.constructor['__class'] === 'quickstart.MatcherInput') || input === null)) {
            let __args = arguments
            {
                let __args = arguments
                if (this.__pattern === undefined) {
                    this.__pattern = null
                }
                if (this.groups === undefined) {
                    this.groups = null
                }
                if (this.namedGroups === undefined) {
                    this.namedGroups = null
                }
                if (this.__groupCount === undefined) {
                    this.__groupCount = 0
                }
                if (this.matcherInput === undefined) {
                    this.matcherInput = null
                }
                if (this.__inputLength === undefined) {
                    this.__inputLength = 0
                }
                if (this.appendPos === undefined) {
                    this.appendPos = 0
                }
                if (this.hasMatch === undefined) {
                    this.hasMatch = false
                }
                if (this.hasGroups === undefined) {
                    this.hasGroups = false
                }
                if (this.anchorFlag === undefined) {
                    this.anchorFlag = 0
                }
                if (pattern == null) {
                    throw Object.defineProperty(new Error('pattern is null'), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.NullPointerException', 'java.lang.Exception'] })
                }
                this.__pattern = pattern
                const re2 = pattern.re2()
                this.__groupCount = re2.numberOfCapturingGroups()
                this.groups = (s => {
 let a = []; while (s-- > 0) {a.push(0)} return a
})(2 + 2 * this.__groupCount)
                this.namedGroups = re2.namedGroups
            }
            if (this.__pattern === undefined) {
                this.__pattern = null
            }
            if (this.groups === undefined) {
                this.groups = null
            }
            if (this.namedGroups === undefined) {
                this.namedGroups = null
            }
            if (this.__groupCount === undefined) {
                this.__groupCount = 0
            }
            if (this.matcherInput === undefined) {
                this.matcherInput = null
            }
            if (this.__inputLength === undefined) {
                this.__inputLength = 0
            }
            if (this.appendPos === undefined) {
                this.appendPos = 0
            }
            if (this.hasMatch === undefined) {
                this.hasMatch = false
            }
            if (this.hasGroups === undefined) {
                this.hasGroups = false
            }
            if (this.anchorFlag === undefined) {
                this.anchorFlag = 0
            }
            (() => {
                this.reset$quickstart_MatcherInput(input)
            })()
        } else if (((pattern != null && pattern.constructor['__class'] === 'quickstart.Pattern') || pattern === null) && input === undefined) {
            let __args = arguments
            if (this.__pattern === undefined) {
                this.__pattern = null
            }
            if (this.groups === undefined) {
                this.groups = null
            }
            if (this.namedGroups === undefined) {
                this.namedGroups = null
            }
            if (this.__groupCount === undefined) {
                this.__groupCount = 0
            }
            if (this.matcherInput === undefined) {
                this.matcherInput = null
            }
            if (this.__inputLength === undefined) {
                this.__inputLength = 0
            }
            if (this.appendPos === undefined) {
                this.appendPos = 0
            }
            if (this.hasMatch === undefined) {
                this.hasMatch = false
            }
            if (this.hasGroups === undefined) {
                this.hasGroups = false
            }
            if (this.anchorFlag === undefined) {
                this.anchorFlag = 0
            }
            if (pattern == null) {
                throw Object.defineProperty(new Error('pattern is null'), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.NullPointerException', 'java.lang.Exception'] })
            }
            this.__pattern = pattern
            const re2 = pattern.re2()
            this.__groupCount = re2.numberOfCapturingGroups()
            this.groups = (s => {
 let a = []; while (s-- > 0) {a.push(0)} return a
})(2 + 2 * this.__groupCount)
            this.namedGroups = re2.namedGroups
        } else {throw new Error('invalid overload')}
    }
    /**
     * Returns the {@code Pattern} associated with this {@code Matcher}.
     * @return {Pattern}
     */
    pattern() {
        return this.__pattern
    }
    reset$() {
        this.__inputLength = this.matcherInput.length()
        this.appendPos = 0
        this.hasMatch = false
        this.hasGroups = false
        return this
    }
    reset$java_lang_CharSequence(input) {
        return this.reset$quickstart_MatcherInput(MatcherInput.utf16(input))
    }
    /**
     * Resets the {@code Matcher} and changes the input.
     *
     * @param {*} input the new input string
     * @return {Matcher} the {@code Matcher} itself, for chained method calls
     */
    reset(input) {
        if (((input != null && (input.constructor != null && input.constructor['__interfaces'] != null && input.constructor['__interfaces'].indexOf('java.lang.CharSequence') >= 0 || typeof input === 'string')) || input === null)) {
            return this.reset$java_lang_CharSequence(input)
        } else if (((input != null && input instanceof Array && (input.length == 0 || input[0] == null || (typeof input[0] === 'number'))) || input === null)) {
            return this.reset$byte_A(input)
        } else if (((input != null && input instanceof MatcherInput) || input === null)) {
            return this.reset$quickstart_MatcherInput(input)
        } else if (input === undefined) {
            return this.reset$()
        } else {throw new Error('invalid overload')}
    }
    reset$byte_A(bytes) {
        return this.reset$quickstart_MatcherInput(MatcherInput.utf8$byte_A(bytes))
    }
    /*private*/ reset$quickstart_MatcherInput(input) {
        if (input == null) {
            throw Object.defineProperty(new Error('input is null'), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.NullPointerException', 'java.lang.Exception'] })
        }
        this.matcherInput = input
        this.reset$()
        return this
    }
    start$() {
        return this.start$int(0)
    }
    end$() {
        return this.end$int(0)
    }
    start$int(group) {
        this.loadGroup(group)
        return this.groups[2 * group]
    }
    start$java_lang_String(group) {
        const g = ((m, k) => m[k] === undefined ? null : m[k])(this.namedGroups, group)
        if (g == null) {
            throw Object.defineProperty(new Error("group \'" + group + "\' not found"), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.IllegalArgumentException', 'java.lang.Exception'] })
        }
        return this.start$int(g)
    }
    /**
     * Returns the start of the named group of the most recent match, or -1 if the group was not
     * matched.
     *
     * @param {string} group the group name
     * @throws IllegalArgumentException if no group with that name exists
     * @return {number}
     */
    start(group) {
        if (((typeof group === 'string') || group === null)) {
            return this.start$java_lang_String(group)
        } else if (((typeof group === 'number') || group === null)) {
            return this.start$int(group)
        } else if (group === undefined) {
            return this.start$()
        } else {throw new Error('invalid overload')}
    }
    end$int(group) {
        this.loadGroup(group)
        return this.groups[2 * group + 1]
    }
    end$java_lang_String(group) {
        const g = ((m, k) => m[k] === undefined ? null : m[k])(this.namedGroups, group)
        if (g == null) {
            throw Object.defineProperty(new Error("group \'" + group + "\' not found"), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.IllegalArgumentException', 'java.lang.Exception'] })
        }
        return this.end$int(g)
    }
    /**
     * Returns the end of the named group of the most recent match, or -1 if the group was not
     * matched.
     *
     * @param {string} group the group name
     * @throws IllegalArgumentException if no group with that name exists
     * @return {number}
     */
    end(group) {
        if (((typeof group === 'string') || group === null)) {
            return this.end$java_lang_String(group)
        } else if (((typeof group === 'number') || group === null)) {
            return this.end$int(group)
        } else if (group === undefined) {
            return this.end$()
        } else {throw new Error('invalid overload')}
    }
    group$() {
        return this.group$int(0)
    }
    group$int(group) {
        const start = this.start$int(group)
        const end = this.end$int(group)
        if (start < 0 && end < 0) {
            return null
        }
        return this.substring(start, end)
    }
    group$java_lang_String(group) {
        const g = ((m, k) => m[k] === undefined ? null : m[k])(this.namedGroups, group)
        if (g == null) {
            throw Object.defineProperty(new Error("group \'" + group + "\' not found"), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.IllegalArgumentException', 'java.lang.Exception'] })
        }
        return this.group$int(g)
    }
    /**
     * Returns the named group of the most recent match, or {@code null} if the group was not matched.
     *
     * @param {string} group the group name
     * @throws IllegalArgumentException if no group with that name exists
     * @return {string}
     */
    group(group) {
        if (((typeof group === 'string') || group === null)) {
            return this.group$java_lang_String(group)
        } else if (((typeof group === 'number') || group === null)) {
            return this.group$int(group)
        } else if (group === undefined) {
            return this.group$()
        } else {throw new Error('invalid overload')}
    }
    /**
     * Returns the number of subgroups in this pattern.
     *
     * @return {number} the number of subgroups; the overall match (group 0) does not count
     */
    groupCount() {
        return this.__groupCount
    }
    /**
     * Helper: finds subgroup information if needed for group.
     * @param {number} group
     * @private
     */
    /*private*/ loadGroup(group) {
        if (group < 0 || group > this.__groupCount) {
            throw Object.defineProperty(new Error('Group index out of bounds: ' + group), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.IndexOutOfBoundsException', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.Exception'] })
        }
        if (!this.hasMatch) {
            throw Object.defineProperty(new Error('perhaps no match attempted'), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.IllegalStateException', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.Exception'] })
        }
        if (group === 0 || this.hasGroups) {
            return
        }
        let end = this.groups[1] + 1
        if (end > this.__inputLength) {
            end = this.__inputLength
        }
        const ok = this.__pattern.re2().match$quickstart_MatcherInput$int$int$int$int_A$int(this.matcherInput, this.groups[0], end, this.anchorFlag, this.groups, 1 + this.__groupCount)
        if (!ok) {
            throw Object.defineProperty(new Error('inconsistency in matching group data'), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.IllegalStateException', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.Exception'] })
        }
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
        if (start < 0 || start > this.__inputLength) {
            throw Object.defineProperty(new Error('start index out of bounds: ' + start), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.IndexOutOfBoundsException', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.Exception'] })
        }
        this.reset$()
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
        if (((typeof start === 'number') || start === null)) {
            return this.find$int(start)
        } else if (start === undefined) {
            return this.find$()
        } else {throw new Error('invalid overload')}
    }
    /**
     * Helper: does match starting at start, with RE2 anchor flag.
     * @param {number} startByte
     * @param {number} anchor
     * @return {boolean}
     * @private
     */
    /*private*/ genMatch(startByte, anchor) {
        const ok = this.__pattern.re2().match$quickstart_MatcherInput$int$int$int$int_A$int(this.matcherInput, startByte, this.__inputLength, anchor, this.groups, 1)
        if (!ok) {
            return false
        }
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
        if (this.matcherInput.getEncoding() === MatcherInput.Encoding.UTF_8) {
            return String.fromCharCode.apply(null, this.matcherInput.asBytes()).substr(start, end - start)
        }
        return /* subSequence */ this.matcherInput.asCharSequence().substring(start, end).toString()
    }
    /**
     * Helper for Pattern: return input length.
     * @return {number}
     */
    inputLength() {
        return this.__inputLength
    }
    /**
     * Quotes '\' and '$' in {@code s}, so that the returned string could be used in
     * {@link #appendReplacement} as a literal replacement of {@code s}.
     *
     * @param {string} s the string to be quoted
     * @return {string} the quoted string
     */
    static quoteReplacement(s) {
        if (s.indexOf('\\') < 0 && s.indexOf('$') < 0) {
            return s
        }
        const sb = { str: '', toString: function() { return this.str } }
        for (let i = 0; i < s.length; ++i) {
            {
                const c = s.charAt(i)
                if ((c => c.charCodeAt == null ? c : c.charCodeAt(0))(c) == '\\'.charCodeAt(0) || (c => c.charCodeAt == null ? c : c.charCodeAt(0))(c) == '$'.charCodeAt(0)) {
                    /* append */ (sb => { sb.str += '\\'; return sb })(sb)
                }
                /* append */ (sb => { sb.str += c; return sb })(sb)
            }
        }
        return /* toString */ sb.str
    }
    appendReplacement$java_lang_StringBuffer$java_lang_String(sb, replacement) {
        const result = { str: '', toString: function() { return this.str } }
        this.appendReplacement$java_lang_StringBuilder$java_lang_String(result, replacement);
        /* append */ (sb => { sb.str += result; return sb })(sb)
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
        if (((sb != null && (sb instanceof Object)) || sb === null) && ((typeof replacement === 'string') || replacement === null)) {
            return this.appendReplacement$java_lang_StringBuffer$java_lang_String(sb, replacement)
        } else if (((sb != null && (sb instanceof Object)) || sb === null) && ((typeof replacement === 'string') || replacement === null)) {
            return this.appendReplacement$java_lang_StringBuilder$java_lang_String(sb, replacement)
        } else {throw new Error('invalid overload')}
    }
    appendReplacement$java_lang_StringBuilder$java_lang_String(sb, replacement) {
        const s = this.start$()
        const e = this.end$()
        if (this.appendPos < s) {
            /* append */ (sb => { sb.str += this.substring(this.appendPos, s); return sb })(sb)
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
                if ((c => c.charCodeAt == null ? c : c.charCodeAt(0))(replacement.charAt(i)) == '\\'.charCodeAt(0)) {
                    if (last < i) {
                        /* append */ (sb => { sb.str += replacement.substring(last, i); return sb })(sb)
                    }
                    i++
                    last = i
                    continue
                }
                if ((c => c.charCodeAt == null ? c : c.charCodeAt(0))(replacement.charAt(i)) == '$'.charCodeAt(0)) {
                    let c = (replacement.charAt(i + 1)).charCodeAt(0)
                    if ('0'.charCodeAt(0) <= c && c <= '9'.charCodeAt(0)) {
                        let n = c - '0'.charCodeAt(0)
                        if (last < i) {
                            /* append */ (sb => { sb.str += replacement.substring(last, i); return sb })(sb)
                        }
                        for (i += 2; i < m; i++) {
                            {
                                c = (replacement.charAt(i)).charCodeAt(0)
                                if (c < '0'.charCodeAt(0) || c > '9'.charCodeAt(0) || n * 10 + c - '0'.charCodeAt(0) > this.__groupCount) {
                                    break
                                }
                                n = n * 10 + c - '0'.charCodeAt(0)
                            }
                        }
                        if (n > this.__groupCount) {
                            throw Object.defineProperty(new Error('n > number of groups: ' + n), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.IndexOutOfBoundsException', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.Exception'] })
                        }
                        const group = this.group$int(n)
                        if (group != null) {
                            /* append */ (sb => { sb.str += group; return sb })(sb)
                        }
                        last = i
                        i--
                        continue
                    } else if (c == '{'.charCodeAt(0)) {
                        if (last < i) {
                            /* append */ (sb => { sb.str += replacement.substring(last, i); return sb })(sb)
                        }
                        i++
                        let j = i + 1
                        while ((j < replacement.length && (c => c.charCodeAt == null ? c : c.charCodeAt(0))(replacement.charAt(j)) != '}'.charCodeAt(0) && (c => c.charCodeAt == null ? c : c.charCodeAt(0))(replacement.charAt(j)) != ' '.charCodeAt(0))) {
                            {
                                j++
                            }
                        }

                        if (j === replacement.length || (c => c.charCodeAt == null ? c : c.charCodeAt(0))(replacement.charAt(j)) != '}'.charCodeAt(0)) {
                            throw Object.defineProperty(new Error("named capture group is missing trailing \'}\'"), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.IllegalArgumentException', 'java.lang.Exception'] })
                        }
                        const groupName = replacement.substring(i + 1, j);
                        /* append */ (sb => { sb.str += this.group$java_lang_String(groupName); return sb })(sb)
                        last = j + 1
                    }
                }
            }
        }
        if (last < m) {
            /* append */ (sb => { sb.str += replacement.substr(last, m); return sb })(sb)
        }
    }
    appendTail$java_lang_StringBuffer(sb) {
        /* append */ (sb => { sb.str += this.substring(this.appendPos, this.__inputLength); return sb })(sb)
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
        if (((sb != null && (sb instanceof Object)) || sb === null)) {
            return this.appendTail$java_lang_StringBuffer(sb)
        } else if (((sb != null && (sb instanceof Object)) || sb === null)) {
            return this.appendTail$java_lang_StringBuilder(sb)
        } else {throw new Error('invalid overload')}
    }
    appendTail$java_lang_StringBuilder(sb) {
        /* append */ (sb => { sb.str += this.substring(this.appendPos, this.__inputLength); return sb })(sb)
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
        this.reset$()
        const sb = { str: '', toString: function() { return this.str } }
        while ((this.find$())) {
            {
                this.appendReplacement$java_lang_StringBuffer$java_lang_String(sb, replacement)
                if (!all) {
                    break
                }
            }
        }

        this.appendTail$java_lang_StringBuffer(sb)
        return /* toString */ sb.str
    }
}
Matcher['__class'] = 'quickstart.Matcher'
