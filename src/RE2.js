/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
/**
 * An RE2 class instance is a compiled representation of an RE2 regular expression, independent of
 * the public Java-like Pattern/Matcher API.
 *
 * <p>
 * This class also contains various implementation helpers for RE2 regular expressions.
 *
 * <p>
 * Use the {@link #quoteMeta(String)} utility function to quote all regular expression
 * metacharacters in an arbitrary string.
 *
 * <p>
 * See the {@code Matcher} and {@code Pattern} classes for the public API, and the <a
 * href='package.html'>package-level documentation</a> for an overview of how to use this API.
 * @class
 */
class AtomicReference {
    constructor(initialValue) {
        this._value = initialValue
    }

    // Returns the current value
    get() {
        return this._value
    }

    // Sets to the given value
    set(newValue) {
        this._value = newValue
    }

    // Atomically sets to the given value and returns true if the current value == the expected value
    compareAndSet(expect, update) {
        if (this._value === expect) {
            this._value = update
            return true
        } else {
            return false
        }
    }
}

export class RE2 {
    constructor(expr, prog, numSubexp, longest) {
        if (((typeof expr === 'string') || expr === null) && ((prog != null && prog instanceof Prog) || prog === null) && ((typeof numSubexp === 'number') || numSubexp === null) && ((typeof longest === 'boolean') || longest === null)) {
            let __args = arguments
            if (this.expr === undefined) {
                this.expr = null
            }
            if (this.prog === undefined) {
                this.prog = null
            }
            if (this.cond === undefined) {
                this.cond = 0
            }
            if (this.numSubexp === undefined) {
                this.numSubexp = 0
            }
            if (this.longest === undefined) {
                this.longest = false
            }
            if (this.prefix === undefined) {
                this.prefix = null
            }
            if (this.prefixUTF8 === undefined) {
                this.prefixUTF8 = null
            }
            if (this.prefixComplete === undefined) {
                this.prefixComplete = false
            }
            if (this.prefixRune === undefined) {
                this.prefixRune = 0
            }
            if (this.namedGroups === undefined) {
                this.namedGroups = null
            }
            this.pooled = (new AtomicReference())
            this.expr = expr
            this.prog = prog
            this.numSubexp = numSubexp
            this.cond = prog.startCond()
            this.longest = longest
        } else if (((typeof expr === 'string') || expr === null) && prog === undefined && numSubexp === undefined && longest === undefined) {
            let __args = arguments
            if (this.expr === undefined) {
                this.expr = null
            }
            if (this.prog === undefined) {
                this.prog = null
            }
            if (this.cond === undefined) {
                this.cond = 0
            }
            if (this.numSubexp === undefined) {
                this.numSubexp = 0
            }
            if (this.longest === undefined) {
                this.longest = false
            }
            if (this.prefix === undefined) {
                this.prefix = null
            }
            if (this.prefixUTF8 === undefined) {
                this.prefixUTF8 = null
            }
            if (this.prefixComplete === undefined) {
                this.prefixComplete = false
            }
            if (this.prefixRune === undefined) {
                this.prefixRune = 0
            }
            if (this.namedGroups === undefined) {
                this.namedGroups = null
            }
            this.pooled = (new AtomicReference())
            const re2 = RE2.compile(expr)
            this.expr = re2.expr
            this.prog = re2.prog
            this.cond = re2.cond
            this.numSubexp = re2.numSubexp
            this.longest = re2.longest
            this.prefix = re2.prefix
            this.prefixUTF8 = re2.prefixUTF8
            this.prefixComplete = re2.prefixComplete
            this.prefixRune = re2.prefixRune
        } else {throw new Error('invalid overload')}
    }
    static MATCH_NL_$LI$() {
 if (RE2.MATCH_NL == null) {
        RE2.MATCH_NL = RE2.CLASS_NL | RE2.DOT_NL
    } return RE2.MATCH_NL
}
    static PERL_$LI$() {
 if (RE2.PERL == null) {
        RE2.PERL = RE2.CLASS_NL | RE2.ONE_LINE | RE2.PERL_X | RE2.UNICODE_GROUPS
    } return RE2.PERL
}
    /**
     * Parses a regular expression and returns, if successful, an {@code RE2} instance that can be
     * used to match against text.
     *
     * <p>
     * When matching against text, the regexp returns a match that begins as early as possible in the
     * input (leftmost), and among those it chooses the one that a backtracking search would have
     * found first. This so-called leftmost-first matching is the same semantics that Perl, Python,
     * and other implementations use, although this package implements it without the expense of
     * backtracking. For POSIX leftmost-longest matching, see {@link #compilePOSIX}.
     * @param {string} expr
     * @return {RE2}
     */
    static compile(expr) {
        return RE2.compileImpl(expr, RE2.PERL_$LI$(), false)
    }
    /**
     * {@code compilePOSIX} is like {@link #compile} but restricts the regular expression to POSIX ERE
     * (egrep) syntax and changes the match semantics to leftmost-longest.
     *
     * <p>
     * That is, when matching against text, the regexp returns a match that begins as early as
     * possible in the input (leftmost), and among those it chooses a match that is as long as
     * possible. This so-called leftmost-longest matching is the same semantics that early regular
     * expression implementations used and that POSIX specifies.
     *
     * <p>
     * However, there can be multiple leftmost-longest matches, with different submatch choices, and
     * here this package diverges from POSIX. Among the possible leftmost-longest matches, this
     * package chooses the one that a backtracking search would have found first, while POSIX
     * specifies that the match be chosen to maximize the length of the first subexpression, then the
     * second, and so on from left to right. The POSIX rule is computationally prohibitive and not
     * even well-defined. See http://swtch.com/~rsc/regexp/regexp2.html#posix
     * @param {string} expr
     * @return {RE2}
     */
    static compilePOSIX(expr) {
        return RE2.compileImpl(expr, RE2.POSIX, true)
    }
    static compileImpl(expr, mode, longest) {
        let re = Parser.parse(expr, mode)
        const maxCap = re.maxCap()
        re = Simplify.simplify(re)
        const prog = Compiler.compileRegexp(re)
        const re2 = new RE2(expr, prog, maxCap, longest)
        const prefixBuilder = { str: '', toString: function() { return this.str } }
        re2.prefixComplete = prog.prefix(prefixBuilder)
        re2.prefix = /* toString */ prefixBuilder.str
        try {
            re2.prefixUTF8 = /* getBytes */ (re2.prefix).split('').map(s => s.charCodeAt(0))
        } catch (e) {
            throw Object.defineProperty(new Error("can\'t happen"), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.IllegalStateException', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.Exception'] })
        }
        if (!(re2.prefix.length === 0)) {
            re2.prefixRune = /* codePointAt */ re2.prefix.charCodeAt(0)
        }
        re2.namedGroups = re.namedGroups
        return re2
    }
    /**
     * Returns the number of parenthesized subexpressions in this regular expression.
     * @return {number}
     */
    numberOfCapturingGroups() {
        return this.numSubexp
    }
    get() {
        let head
        do {
            {
                head = this.pooled.get()
            }
        } while ((head != null && !this.pooled.compareAndSet(head, head.next)))
        return head
    }
    reset() {
        this.pooled.set(null)
    }
    put(m, isNew) {
        let head
        do {
            {
                head = this.pooled.get()
                if (!isNew && head != null) {
                    m = new Machine(m)
                    isNew = true
                }
                if (m.next !== head) {
                    m.next = head
                }
            }
        } while ((!this.pooled.compareAndSet(head, m)))
    }
    /**
     *
     * @return {string}
     */
    toString() {
        return this.expr
    }
    doExecute(__in, pos, anchor, ncap) {
        let m = this.get()
        let isNew = false
        if (m == null) {
            m = new Machine(this)
            isNew = true
        } else if (m.next != null) {
            m = new Machine(m)
            isNew = true
        }
        m.init(ncap)
        const cap = m.match(__in, pos, anchor) ? m.submatches() : null
        this.put(m, isNew)
        return cap
    }
    match$java_lang_CharSequence(s) {
        return this.doExecute(MachineInput.fromUTF16$java_lang_CharSequence(s), 0, RE2.UNANCHORED, 0) != null
    }
    match$java_lang_CharSequence$int$int$int$int_A$int(input, start, end, anchor, group, ngroup) {
        return this.match$quickstart_MatcherInput$int$int$int$int_A$int(MatcherInput.utf16(input), start, end, anchor, group, ngroup)
    }
    match(input, start, end, anchor, group, ngroup) {
        if (((input != null && (input.constructor != null && input.constructor['__interfaces'] != null && input.constructor['__interfaces'].indexOf('java.lang.CharSequence') >= 0 || typeof input === 'string')) || input === null) && ((typeof start === 'number') || start === null) && ((typeof end === 'number') || end === null) && ((typeof anchor === 'number') || anchor === null) && ((group != null && group instanceof Array && (group.length == 0 || group[0] == null || (typeof group[0] === 'number'))) || group === null) && ((typeof ngroup === 'number') || ngroup === null)) {
            return this.match$java_lang_CharSequence$int$int$int$int_A$int(input, start, end, anchor, group, ngroup)
        } else if (((input != null && input instanceof MatcherInput) || input === null) && ((typeof start === 'number') || start === null) && ((typeof end === 'number') || end === null) && ((typeof anchor === 'number') || anchor === null) && ((group != null && group instanceof Array && (group.length == 0 || group[0] == null || (typeof group[0] === 'number'))) || group === null) && ((typeof ngroup === 'number') || ngroup === null)) {
            return this.match$quickstart_MatcherInput$int$int$int$int_A$int(input, start, end, anchor, group, ngroup)
        } else if (((input != null && (input.constructor != null && input.constructor['__interfaces'] != null && input.constructor['__interfaces'].indexOf('java.lang.CharSequence') >= 0 || typeof input === 'string')) || input === null) && start === undefined && end === undefined && anchor === undefined && group === undefined && ngroup === undefined) {
            return this.match$java_lang_CharSequence(input)
        } else {throw new Error('invalid overload')}
    }
    match$quickstart_MatcherInput$int$int$int$int_A$int(input, start, end, anchor, group, ngroup) {
        if (start > end) {
            return false
        }
        const machineInput = input.getEncoding() === MatcherInput.Encoding.UTF_16 ? MachineInput.fromUTF16$java_lang_CharSequence$int$int(input.asCharSequence(), 0, end) : MachineInput.fromUTF8$byte_A$int$int(input.asBytes(), 0, end)
        const groupMatch = this.doExecute(machineInput, start, anchor, 2 * ngroup)
        if (groupMatch == null) {
            return false
        }
        if (group != null) {
            /* arraycopy */ ((srcPts, srcOff, dstPts, dstOff, size) => {
 if (srcPts !== dstPts || dstOff >= srcOff + size) {
                while (--size >= 0) {dstPts[dstOff++] = srcPts[srcOff++]}
            } else {
                let tmp = srcPts.slice(srcOff, srcOff + size)
                for (let i = 0; i < size; i++) {dstPts[dstOff++] = tmp[i]}
            }
})(groupMatch, 0, group, 0, groupMatch.length)
        }
        return true
    }
    /**
     * Returns true iff this regexp matches the UTF-8 byte array {@code b}.
     * @param {byte[]} b
     * @return {boolean}
     */
    matchUTF8(b) {
        return this.doExecute(MachineInput.fromUTF8$byte_A(b), 0, RE2.UNANCHORED, 0) != null
    }
    /**
     * Returns true iff textual regular expression {@code pattern} matches string {@code s}.
     *
     * <p>
     * More complicated queries need to use {@link #compile} and the full {@code RE2} interface.
     * @param {string} pattern
     * @param {*} s
     * @return {boolean}
     */
    static match(pattern, s) {
        return RE2.compile(pattern).match$java_lang_CharSequence(s)
    }
    /**
     * Returns a copy of {@code src} in which all matches for this regexp have been replaced by
     * {@code repl}. No support is provided for expressions (e.g. {@code \1} or {@code $1}) in the
     * replacement string.
     * @param {string} src
     * @param {string} repl
     * @return {string}
     */
    replaceAll(src, repl) {
        return this.replaceAllFunc(src, new RE2.RE2$0(this, repl), 2 * src.length + 1)
    }
    /**
     * Returns a copy of {@code src} in which only the first match for this regexp has been replaced
     * by {@code repl}. No support is provided for expressions (e.g. {@code \1} or {@code $1}) in the
     * replacement string.
     * @param {string} src
     * @param {string} repl
     * @return {string}
     */
    replaceFirst(src, repl) {
        return this.replaceAllFunc(src, new RE2.RE2$1(this, repl), 1)
    }
    /**
     * Returns a copy of {@code src} in which at most {@code maxReplaces} matches for this regexp have
     * been replaced by the return value of of function {@code repl} (whose first argument is the
     * matched string). No support is provided for expressions (e.g. {@code \1} or {@code $1}) in the
     * replacement string.
     * @param {string} src
     * @param {*} repl
     * @param {number} maxReplaces
     * @return {string}
     */
    replaceAllFunc(src, repl, maxReplaces) {
        let lastMatchEnd = 0
        let searchPos = 0
        const buf = { str: '', toString: function() { return this.str } }
        const input = MachineInput.fromUTF16$java_lang_CharSequence(src)
        let numReplaces = 0
        while ((searchPos <= src.length)) {
            {
                const a = this.doExecute(input, searchPos, RE2.UNANCHORED, 2)
                if (a == null || a.length === 0) {
                    break
                }
                /* append */ (sb => { sb.str += src.substring(lastMatchEnd, a[0]); return sb })(buf)
                if (a[1] > lastMatchEnd || a[0] === 0) {
                    /* append */ (sb => { sb.str += repl.replace(src.substring(a[0], a[1])); return sb })(buf)
                    ++numReplaces
                }
                lastMatchEnd = a[1]
                const width = input.step(searchPos) & 7
                if (searchPos + width > a[1]) {
                    searchPos += width
                } else if (searchPos + 1 > a[1]) {
                    searchPos++
                } else {
                    searchPos = a[1]
                }
                if (numReplaces >= maxReplaces) {
                    break
                }
            }
        }

        /* append */ (sb => { sb.str += src.substring(lastMatchEnd); return sb })(buf)
        return /* toString */ buf.str
    }
    /**
     * Returns a string that quotes all regular expression metacharacters inside the argument text;
     * the returned string is a regular expression matching the literal text. For example,
     * {@code quoteMeta("[foo]").equals("\\[foo\\]")}.
     * @param {string} s
     * @return {string}
     */
    static quoteMeta(s) {
        const b = { str: '', toString: function() { return this.str } }
        for (let i = 0, len = s.length; i < len; i++) {
            {
                const c = s.charAt(i)
                if ('\\.+*?()|[]{}^$'.indexOf(c) >= 0) {
                    /* append */ (sb => { sb.str += '\\'; return sb })(b)
                }
                /* append */ (sb => { sb.str += c; return sb })(b)
            }
        }
        return /* toString */ b.str
    }
    pad(a) {
        if (a == null) {
            return null
        }
        const n = (1 + this.numSubexp) * 2
        if (a.length < n) {
            const a2 = (s => {
 let a = []; while (s-- > 0) {a.push(0)} return a
})(n);
            /* arraycopy */ ((srcPts, srcOff, dstPts, dstOff, size) => {
 if (srcPts !== dstPts || dstOff >= srcOff + size) {
                while (--size >= 0) {dstPts[dstOff++] = srcPts[srcOff++]}
            } else {
                let tmp = srcPts.slice(srcOff, srcOff + size)
                for (let i = 0; i < size; i++) {dstPts[dstOff++] = tmp[i]}
            }
})(a, 0, a2, 0, a.length);
            /* fill */ ((a, start, end, v) => {
 for (let i = start; i < end; i++) {a[i] = v}
})(a2, a.length, n, -1)
            a = a2
        }
        return a
    }
    allMatches(input, n, deliver) {
        const end = input.endPos()
        if (n < 0) {
            n = end + 1
        }
        for (let pos = 0, i = 0, prevMatchEnd = -1; i < n && pos <= end;) {
            {
                const matches = this.doExecute(input, pos, RE2.UNANCHORED, this.prog.numCap)
                if (matches == null || matches.length === 0) {
                    break
                }
                let accept = true
                if (matches[1] === pos) {
                    if (matches[0] === prevMatchEnd) {
                        accept = false
                    }
                    const r = input.step(pos)
                    if (r < 0) {
                        pos = end + 1
                    } else {
                        pos += r & 7
                    }
                } else {
                    pos = matches[1]
                }
                prevMatchEnd = matches[1]
                if (accept) {
                    deliver.deliver(this.pad(matches))
                    i++
                }
            }
        }
    }
    /**
     * Returns an array holding the text of the leftmost match in {@code b} of this regular
     * expression.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {byte[]} b
     * @return {byte[]}
     */
    findUTF8(b) {
        const a = this.doExecute(MachineInput.fromUTF8$byte_A(b), 0, RE2.UNANCHORED, 2)
        if (a == null) {
            return null
        }
        return Utils.subarray$byte_A$int$int(b, a[0], a[1])
    }
    /**
     * Returns a two-element array of integers defining the location of the leftmost match in
     * {@code b} of this regular expression. The match itself is at {@code b[loc[0]...loc[1]]}.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {byte[]} b
     * @return {int[]}
     */
    findUTF8Index(b) {
        const a = this.doExecute(MachineInput.fromUTF8$byte_A(b), 0, RE2.UNANCHORED, 2)
        if (a == null) {
            return null
        }
        return Utils.subarray$int_A$int$int(a, 0, 2)
    }
    /**
     * Returns a string holding the text of the leftmost match in {@code s} of this regular
     * expression.
     *
     * <p>
     * If there is no match, the return value is an empty string, but it will also be empty if the
     * regular expression successfully matches an empty string. Use {@link #findIndex} or
     * {@link #findSubmatch} if it is necessary to distinguish these cases.
     * @param {string} s
     * @return {string}
     */
    find(s) {
        const a = this.doExecute(MachineInput.fromUTF16$java_lang_CharSequence(s), 0, RE2.UNANCHORED, 2)
        if (a == null) {
            return ''
        }
        return s.substring(a[0], a[1])
    }
    /**
     * Returns a two-element array of integers defining the location of the leftmost match in
     * {@code s} of this regular expression. The match itself is at
     * {@code s.substring(loc[0], loc[1])}.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {string} s
     * @return {int[]}
     */
    findIndex(s) {
        return this.doExecute(MachineInput.fromUTF16$java_lang_CharSequence(s), 0, RE2.UNANCHORED, 2)
    }
    /**
     * Returns an array of arrays the text of the leftmost match of the regular expression in
     * {@code b} and the matches, if any, of its subexpressions, as defined by the <a
     * href='#submatch'>Submatch</a> description above.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {byte[]} b
     * @return {byte[][]}
     */
    findUTF8Submatch(b) {
        const a = this.doExecute(MachineInput.fromUTF8$byte_A(b), 0, RE2.UNANCHORED, this.prog.numCap)
        if (a == null) {
            return null
        }
        const ret = (s => {
 let a = []; while (s-- > 0) {a.push(null)} return a
})(1 + this.numSubexp)
        for (let i = 0; i < ret.length; i++) {
            {
                if (2 * i < a.length && a[2 * i] >= 0) {
                    ret[i] = Utils.subarray$byte_A$int$int(b, a[2 * i], a[2 * i + 1])
                }
            }
        }
        return ret
    }
    /**
     * Returns an array holding the index pairs identifying the leftmost match of this regular
     * expression in {@code b} and the matches, if any, of its subexpressions, as defined by the the
     * <a href='#submatch'>Submatch</a> and <a href='#index'>Index</a> descriptions above.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {byte[]} b
     * @return {int[]}
     */
    findUTF8SubmatchIndex(b) {
        return this.pad(this.doExecute(MachineInput.fromUTF8$byte_A(b), 0, RE2.UNANCHORED, this.prog.numCap))
    }
    /**
     * Returns an array of strings holding the text of the leftmost match of the regular expression in
     * {@code s} and the matches, if any, of its subexpressions, as defined by the <a
     * href='#submatch'>Submatch</a> description above.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {string} s
     * @return {java.lang.String[]}
     */
    findSubmatch(s) {
        const a = this.doExecute(MachineInput.fromUTF16$java_lang_CharSequence(s), 0, RE2.UNANCHORED, this.prog.numCap)
        if (a == null) {
            return null
        }
        const ret = (s => {
 let a = []; while (s-- > 0) {a.push(null)} return a
})(1 + this.numSubexp)
        for (let i = 0; i < ret.length; i++) {
            {
                if (2 * i < a.length && a[2 * i] >= 0) {
                    ret[i] = s.substring(a[2 * i], a[2 * i + 1])
                }
            }
        }
        return ret
    }
    /**
     * Returns an array holding the index pairs identifying the leftmost match of this regular
     * expression in {@code s} and the matches, if any, of its subexpressions, as defined by the <a
     * href='#submatch'>Submatch</a> description above.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {string} s
     * @return {int[]}
     */
    findSubmatchIndex(s) {
        return this.pad(this.doExecute(MachineInput.fromUTF16$java_lang_CharSequence(s), 0, RE2.UNANCHORED, this.prog.numCap))
    }
    /**
     * {@code findAllUTF8()} is the <a href='#all'>All</a> version of {@link #findUTF8}; it returns a
     * list of up to {@code n} successive matches of the expression, as defined by the <a
     * href='#all'>All</a> description above.
     *
     * <p>
     * A return value of null indicates no match.
     *
     * TODO(adonovan): think about defining a byte slice view class, like a read-only Go slice backed
     * by |b|.
     * @param {byte[]} b
     * @param {number} n
     * @return {byte[][]}
     */
    findAllUTF8(b, n) {
        const result = ([])
        this.allMatches(MachineInput.fromUTF8$byte_A(b), n, new RE2.RE2$2(this, result, b))
        if (/* isEmpty */(result.length == 0)) {
            return null
        }
        return result
    }
    /**
     * {@code findAllUTF8Index} is the <a href='#all'>All</a> version of {@link #findUTF8Index}; it
     * returns a list of up to {@code n} successive matches of the expression, as defined by the <a
     * href='#all'>All</a> description above.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {byte[]} b
     * @param {number} n
     * @return {int[][]}
     */
    findAllUTF8Index(b, n) {
        const result = ([])
        this.allMatches(MachineInput.fromUTF8$byte_A(b), n, new RE2.RE2$3(this, result))
        if (/* isEmpty */(result.length == 0)) {
            return null
        }
        return result
    }
    /**
     * {@code findAll} is the <a href='#all'>All</a> version of {@link #find}; it returns a list of up
     * to {@code n} successive matches of the expression, as defined by the <a href='#all'>All</a>
     * description above.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {string} s
     * @param {number} n
     * @return {string[]}
     */
    findAll(s, n) {
        const result = ([])
        this.allMatches(MachineInput.fromUTF16$java_lang_CharSequence(s), n, new RE2.RE2$4(this, result, s))
        if (/* isEmpty */(result.length == 0)) {
            return null
        }
        return result
    }
    /**
     * {@code findAllIndex} is the <a href='#all'>All</a> version of {@link #findIndex}; it returns a
     * list of up to {@code n} successive matches of the expression, as defined by the <a
     * href='#all'>All</a> description above.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {string} s
     * @param {number} n
     * @return {int[][]}
     */
    findAllIndex(s, n) {
        const result = ([])
        this.allMatches(MachineInput.fromUTF16$java_lang_CharSequence(s), n, new RE2.RE2$5(this, result))
        if (/* isEmpty */(result.length == 0)) {
            return null
        }
        return result
    }
    /**
     * {@code findAllUTF8Submatch} is the <a href='#all'>All</a> version of {@link #findUTF8Submatch};
     * it returns a list of up to {@code n} successive matches of the expression, as defined by the <a
     * href='#all'>All</a> description above.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {byte[]} b
     * @param {number} n
     * @return {byte[][][]}
     */
    findAllUTF8Submatch(b, n) {
        const result = ([])
        this.allMatches(MachineInput.fromUTF8$byte_A(b), n, new RE2.RE2$6(this, b, result))
        if (/* isEmpty */(result.length == 0)) {
            return null
        }
        return result
    }
    /**
     * {@code findAllUTF8SubmatchIndex} is the <a href='#all'>All</a> version of
     * {@link #findUTF8SubmatchIndex}; it returns a list of up to {@code n} successive matches of the
     * expression, as defined by the <a href='#all'>All</a> description above.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {byte[]} b
     * @param {number} n
     * @return {int[][]}
     */
    findAllUTF8SubmatchIndex(b, n) {
        const result = ([])
        this.allMatches(MachineInput.fromUTF8$byte_A(b), n, new RE2.RE2$7(this, result))
        if (/* isEmpty */(result.length == 0)) {
            return null
        }
        return result
    }
    /**
     * {@code findAllSubmatch} is the <a href='#all'>All</a> version of {@link #findSubmatch}; it
     * returns a list of up to {@code n} successive matches of the expression, as defined by the <a
     * href='#all'>All</a> description above.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {string} s
     * @param {number} n
     * @return {java.lang.String[][]}
     */
    findAllSubmatch(s, n) {
        const result = ([])
        this.allMatches(MachineInput.fromUTF16$java_lang_CharSequence(s), n, new RE2.RE2$8(this, s, result))
        if (/* isEmpty */(result.length == 0)) {
            return null
        }
        return result
    }
    /**
     * {@code findAllSubmatchIndex} is the <a href='#all'>All</a> version of
     * {@link #findSubmatchIndex}; it returns a list of up to {@code n} successive matches of the
     * expression, as defined by the <a href='#all'>All</a> description above.
     *
     * <p>
     * A return value of null indicates no match.
     * @param {string} s
     * @param {number} n
     * @return {int[][]}
     */
    findAllSubmatchIndex(s, n) {
        const result = ([])
        this.allMatches(MachineInput.fromUTF16$java_lang_CharSequence(s), n, new RE2.RE2$9(this, result))
        if (/* isEmpty */(result.length == 0)) {
            return null
        }
        return result
    }
}
RE2['__class'] = 'quickstart.RE2';
(function(RE2) {
    class RE2$0 {
        constructor(__parent, repl) {
            this.repl = repl
            this.__parent = __parent
        }
        /**
         *
         * @param {string} orig
         * @return {string}
         */
        replace(orig) {
            return this.repl
        }
    }
    RE2.RE2$0 = RE2$0
    RE2$0['__interfaces'] = ['quickstart.RE2.ReplaceFunc']
    class RE2$1 {
        constructor(__parent, repl) {
            this.repl = repl
            this.__parent = __parent
        }
        /**
         *
         * @param {string} orig
         * @return {string}
         */
        replace(orig) {
            return this.repl
        }
    }
    RE2.RE2$1 = RE2$1
    RE2$1['__interfaces'] = ['quickstart.RE2.ReplaceFunc']
    class RE2$2 {
        constructor(__parent, result, b) {
            this.result = result
            this.b = b
            this.__parent = __parent
        }
        /**
         *
         * @param {int[]} match
         */
        deliver(match) {
            /* add */ (this.result.push(Utils.subarray$byte_A$int$int(this.b, match[0], match[1])) > 0)
        }
    }
    RE2.RE2$2 = RE2$2
    RE2$2['__interfaces'] = ['quickstart.RE2.DeliverFunc']
    class RE2$3 {
        constructor(__parent, result) {
            this.result = result
            this.__parent = __parent
        }
        /**
         *
         * @param {int[]} match
         */
        deliver(match) {
            /* add */ (this.result.push(Utils.subarray$int_A$int$int(match, 0, 2)) > 0)
        }
    }
    RE2.RE2$3 = RE2$3
    RE2$3['__interfaces'] = ['quickstart.RE2.DeliverFunc']
    class RE2$4 {
        constructor(__parent, result, s) {
            this.result = result
            this.s = s
            this.__parent = __parent
        }
        /**
         *
         * @param {int[]} match
         */
        deliver(match) {
            /* add */ (this.result.push(this.s.substring(match[0], match[1])) > 0)
        }
    }
    RE2.RE2$4 = RE2$4
    RE2$4['__interfaces'] = ['quickstart.RE2.DeliverFunc']
    class RE2$5 {
        constructor(__parent, result) {
            this.result = result
            this.__parent = __parent
        }
        /**
         *
         * @param {int[]} match
         */
        deliver(match) {
            /* add */ (this.result.push(Utils.subarray$int_A$int$int(match, 0, 2)) > 0)
        }
    }
    RE2.RE2$5 = RE2$5
    RE2$5['__interfaces'] = ['quickstart.RE2.DeliverFunc']
    class RE2$6 {
        constructor(__parent, b, result) {
            this.b = b
            this.result = result
            this.__parent = __parent
        }
        /**
         *
         * @param {int[]} match
         */
        deliver(match) {
            const slice = (s => {
 let a = []; while (s-- > 0) {a.push(null)} return a
})((match.length / 2 | 0))
            for (let j = 0; j < slice.length; ++j) {
                {
                    if (match[2 * j] >= 0) {
                        slice[j] = Utils.subarray$byte_A$int$int(this.b, match[2 * j], match[2 * j + 1])
                    }
                }
            }
            /* add */ (this.result.push(slice) > 0)
        }
    }
    RE2.RE2$6 = RE2$6
    RE2$6['__interfaces'] = ['quickstart.RE2.DeliverFunc']
    class RE2$7 {
        constructor(__parent, result) {
            this.result = result
            this.__parent = __parent
        }
        /**
         *
         * @param {int[]} match
         */
        deliver(match) {
            /* add */ (this.result.push(match) > 0)
        }
    }
    RE2.RE2$7 = RE2$7
    RE2$7['__interfaces'] = ['quickstart.RE2.DeliverFunc']
    class RE2$8 {
        constructor(__parent, s, result) {
            this.s = s
            this.result = result
            this.__parent = __parent
        }
        /**
         *
         * @param {int[]} match
         */
        deliver(match) {
            const slice = (s => {
 let a = []; while (s-- > 0) {a.push(null)} return a
})((match.length / 2 | 0))
            for (let j = 0; j < slice.length; ++j) {
                {
                    if (match[2 * j] >= 0) {
                        slice[j] = this.s.substring(match[2 * j], match[2 * j + 1])
                    }
                }
            }
            /* add */ (this.result.push(slice) > 0)
        }
    }
    RE2.RE2$8 = RE2$8
    RE2$8['__interfaces'] = ['quickstart.RE2.DeliverFunc']
    class RE2$9 {
        constructor(__parent, result) {
            this.result = result
            this.__parent = __parent
        }
        /**
         *
         * @param {int[]} match
         */
        deliver(match) {
            /* add */ (this.result.push(match) > 0)
        }
    }
    RE2.RE2$9 = RE2$9
    RE2$9['__interfaces'] = ['quickstart.RE2.DeliverFunc']
})(RE2 || (RE2 = {}))
import { Utils } from './Utils'
import { MatcherInput } from './MatcherInput'
import { MachineInput } from './MachineInput'
import { Compiler } from './Compiler'
import { Simplify } from './Simplify'
import { Parser } from './Parser'
import { Machine } from './Machine'
import { Prog } from './Prog'
