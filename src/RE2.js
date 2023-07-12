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
import { RE2Flags } from './RE2Flags'
import { Utils } from './Utils'
import { MatcherInput, MatcherInputBase } from './MatcherInput'
import { MachineInput } from './MachineInput'
import { Compiler } from './Compiler'
import { Simplify } from './Simplify'
import { Parser } from './Parser'
import { Machine } from './Machine'

class AtomicReference {
  constructor(initialValue) {
    this.value = initialValue
  }

  // Returns the current value
  get() {
    return this.value
  }

  // Sets to the given value
  set(newValue) {
    this.value = newValue
  }

  // Atomically sets to the given value and returns true if the current value == the expected value
  compareAndSet(expect, update) {
    if (this.value === expect) {
      this.value = update
      return true
    }
    return false
  }
}

class RE2 {
  // This is visible for testing.
  static initTest(expr) {
    const re2 = RE2.compile(expr)
    const res = new RE2(re2.expr, re2.prog, re2.numSubexp, re2.longest)
    res.cond = re2.cond
    res.prefix = re2.prefix
    res.prefixUTF8 = re2.prefixUTF8
    res.prefixComplete = re2.prefixComplete
    res.prefixRune = re2.prefixRune
    return res
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
   */
  static compile(expr) {
    return RE2.compileImpl(expr, RE2Flags.PERL, false)
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
   */
  static compilePOSIX(expr) {
    return RE2.compileImpl(expr, RE2Flags.POSIX, true)
  }

  // Exposed to ExecTests.
  static compileImpl(expr, mode, longest) {
    let re = Parser.parse(expr, mode)
    const maxCap = re.maxCap()
    re = Simplify.simplify(re)

    const prog = Compiler.compileRegexp(re)
    const re2 = new RE2(expr, prog, maxCap, longest)

    const [prefixCompl, prefixStr] = prog.prefix()
    re2.prefixComplete = prefixCompl
    re2.prefix = prefixStr
    re2.prefixUTF8 = Utils.stringToUtf8ByteArray(re2.prefix)

    if (re2.prefix.length > 0) {
      re2.prefixRune = re2.prefix.codePointAt(0)
    }
    re2.namedGroups = re.namedGroups
    return re2
  }

  /**
   * Returns true iff textual regular expression {@code pattern} matches string {@code s}.
   *
   * <p>
   * More complicated queries need to use {@link #compile} and the full {@code RE2} interface.
   */
  // This is visible for testing.
  static match(pattern, s) {
    return RE2.compile(pattern).match(s)
  }

  constructor(expr, prog, numSubexp = 0, longest = 0) {
    this.expr = expr // as passed to Compile
    this.prog = prog // compiled program
    this.numSubexp = numSubexp
    this.longest = longest
    this.cond = prog.startCond() // EMPTY_* bitmask: empty-width conditions
    this.prefix = null // required UTF-16 prefix in unanchored matches
    this.prefixUTF8 = null // required UTF-8 prefix in unanchored matches
    this.prefixComplete = false // true if prefix is the entire regexp
    this.prefixRune = 0 // first rune in prefix
    this.pooled = new AtomicReference() // Cache of machines for running regexp. Forms a Treiber stack.
  }

  /**
   * Returns the number of parenthesized subexpressions in this regular expression.
   */
  numberOfCapturingGroups() {
    return this.numSubexp
  }

  // get() returns a machine to use for matching |this|.  It uses |this|'s
  // machine cache if possible, to avoid unnecessary allocation.
  get() {
    // Pop a machine off the stack if available.
    let head

    do {
      head = this.pooled.get()
    } while (head && !this.pooled.compareAndSet(head, head.next))

    return head
  }

  // Clears the memory associated with this machine.
  reset() {
    this.pooled.set(null)
  }

  // put() returns a machine to |this|'s machine cache.  There is no attempt to
  // limit the size of the cache, so it will grow to the maximum number of
  // simultaneous matches run using |this|.  (The cache empties when |this|
  // gets garbage collected or reset is called.)
  put(m, isNew) {
    // To avoid allocation in the single-thread or uncontended case, reuse a node only if
    // it was the only element in the stack when it was popped, and it's the only element
    // in the stack when it's pushed back after use.
    let head = this.pooled.get()
    do {
      head = this.pooled.get()
      if (!isNew && head) {
        // If an element had a null next pointer and it was previously in the stack, another thread
        // might be trying to pop it out right now, and if it sees the same node now in the
        // stack the pop will succeed, but the new top of the stack will be the stale (null) value
        // of next. Allocate a new Machine so that the CAS will not succeed if this node has been
        // popped and re-pushed.
        m = Machine.fromMachine(m)
        isNew = true
      }

      // Without this comparison, TSAN will complain about a race condition:
      // Thread A, B, and C all attempt to do a match on the same pattern.
      //
      // A: Allocates Machine 1; executes match; put machine 1. State is now:
      //
      // pooled -> machine 1 -> null
      //
      // B reads pooled, sees machine 1
      //
      // C reads pooled, sees machine 1
      //
      // B successfully CASes pooled to null
      //
      // B executes match; put machine 1, which involves setting machine1.next to
      // null (even though it's already null); preempted before CAS
      //
      // C resumes, and reads machine1.next in order to execute cas(head, head.next)
      //
      // There is no happens-before relationship between B's redundant null write
      // and C's read, thus triggering TSAN.
      //
      // Not needed for JS code
      if (m.next !== head) {
        m.next = head
      }
    } while (!this.pooled.compareAndSet(head, m))
  }

  toString() {
    return this.expr
  }

  // doExecute() finds the leftmost match in the input and returns
  // the position of its subexpressions.
  // Derived from exec.go.
  doExecute(input, pos, anchor, ncap) {
    let m = this.get()
    // The Treiber stack cannot reuse nodes, unless the node to be reused has only ever been at
    // the bottom of the stack (i.e., next == null).
    let isNew = false
    if (!m) {
      m = Machine.fromRE2(this)
      isNew = true
    } else if (m.next !== null) {
      m = Machine.fromMachine(m)
      isNew = true
    }

    m.init(ncap)
    const cap = m.match(input, pos, anchor) ? m.submatches() : null
    this.put(m, isNew)
    return cap
  }

  match(s) {
    return this.doExecute(MachineInput.fromUTF16(s), 0, RE2Flags.UNANCHORED, 0) !== null
  }

  /**
   * Matches the regular expression against input starting at position start and ending at position
   * end, with the given anchoring. Records the submatch boundaries in group, which is [start, end)
   * pairs of byte offsets. The number of boundaries needed is inferred from the size of the group
   * array. It is most efficient not to ask for submatch boundaries.
   *
   * @param input the input byte array
   * @param start the beginning position in the input
   * @param end the end position in the input
   * @param anchor the anchoring flag (UNANCHORED, ANCHOR_START, ANCHOR_BOTH)
   * @param group the array to fill with submatch positions
   * @param ngroup the number of array pairs to fill in
   * @return true if a match was found
   */
  matchWithGroup(input, start, end, anchor, ngroup) {
    if (!(input instanceof MatcherInputBase)) {
      input = MatcherInput.utf16(input)
    }

    return this.matchMachineInput(input, start, end, anchor, ngroup)
  }

  matchMachineInput(input, start, end, anchor, ngroup) {
    if (start > end) {
      return [false, null]
    }
    const machineInput = input.isUTF16Encoding()
      ? MachineInput.fromUTF16(input.asCharSequence(), 0, end)
      : MachineInput.fromUTF8(input.asBytes(), 0, end)

    const groupMatch = this.doExecute(machineInput, start, anchor, 2 * ngroup)

    if (groupMatch === null) {
      return [false, null]
    }
    return [true, groupMatch]
  }

  /**
   * Returns true iff this regexp matches the UTF-8 byte array {@code b}.
   */
  // This is visible for testing.
  matchUTF8(b) {
    return this.doExecute(MachineInput.fromUTF8(b), 0, RE2Flags.UNANCHORED, 0) != null
  }

  /**
   * Returns a copy of {@code src} in which all matches for this regexp have been replaced by
   * {@code repl}. No support is provided for expressions (e.g. {@code \1} or {@code $1}) in the
   * replacement string.
   */
  // This is visible for testing.
  replaceAll(src, repl) {
    return this.replaceAllFunc(src, () => repl, 2 * src.length + 1)
  }

  /**
   * Returns a copy of {@code src} in which only the first match for this regexp has been replaced
   * by {@code repl}. No support is provided for expressions (e.g. {@code \1} or {@code $1}) in the
   * replacement string.
   */
  // This is visible for testing.
  replaceFirst(src, repl) {
    return this.replaceAllFunc(src, () => repl, 1)
  }

  /**
   * Returns a copy of {@code src} in which at most {@code maxReplaces} matches for this regexp have
   * been replaced by the return value of of function {@code repl} (whose first argument is the
   * matched string). No support is provided for expressions (e.g. {@code \1} or {@code $1}) in the
   * replacement string.
   */
  // This is visible for testing.
  replaceAllFunc(src, replFunc, maxReplaces) {
    let lastMatchEnd = 0
    let searchPos = 0
    let out = ''

    const input = MachineInput.fromUTF16(src)
    let numReplaces = 0
    while (searchPos <= src.length) {
      const a = this.doExecute(input, searchPos, RE2Flags.UNANCHORED, 2)
      if (a == null || a.length === 0) {
        break
      }
      out += src.substring(lastMatchEnd, a[0])

      if (a[1] > lastMatchEnd || a[0] === 0) {
        out += replFunc(src.substring(a[0], a[1]))
        numReplaces++
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

    out += src.substring(lastMatchEnd)
    return out
  }

  // The number of capture values in the program may correspond
  // to fewer capturing expressions than are in the regexp.
  // For example, "(a){0}" turns into an empty program, so the
  // maximum capture in the program is 0 but we need to return
  // an expression for \1.  Pad returns a with -1s appended as needed;
  // the result may alias a.
  pad(a) {
    if (a === null) {
      return null
    }

    let n = (1 + this.numSubexp) * 2

    if (a.length < n) {
      let a2 = new Array(n).fill(-1)
      for (let i = 0; i < a.length; i++) {
        a2[i] = a[i]
      }
      a = a2
    }
    return a
  }

  // Find matches in input.
  allMatches(input, n, deliverFun = (v) => v) {
    let result = []
    const end = input.endPos()
    if (n < 0) {
      n = end + 1
    }

    for (let pos = 0, i = 0, prevMatchEnd = -1; i < n && pos <= end; ) {
      const matches = this.doExecute(input, pos, RE2Flags.UNANCHORED, this.prog.numCap)
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
        result.push(deliverFun(this.pad(matches)))
        i++
      }
    }
    return result
  }

  // Legacy Go-style interface; preserved (package-private) for better
  // test coverage.
  //
  // There are 16 methods of RE2 that match a regular expression and
  // identify the matched text.  Their names are matched by this regular
  // expression:
  //
  //    find(All)?(UTF8)?(Submatch)?(Index)?
  //
  // If 'All' is present, the routine matches successive non-overlapping
  // matches of the entire expression.  Empty matches abutting a
  // preceding match are ignored.  The return value is an array
  // containing the successive return values of the corresponding
  // non-All routine.  These routines take an extra integer argument, n;
  // if n >= 0, the function returns at most n matches/submatches.
  //
  // If 'UTF8' is present, the argument is a UTF-8 encoded byte[] array;
  // otherwise it is a UTF-16 encoded java.lang.String; return values
  // are adjusted as appropriate.
  //
  // If 'Submatch' is present, the return value is an list identifying
  // the successive submatches of the expression.  Submatches are
  // matches of parenthesized subexpressions within the regular
  // expression, numbered from left to right in order of opening
  // parenthesis.  Submatch 0 is the match of the entire expression,
  // submatch 1 the match of the first parenthesized subexpression, and
  // so on.
  //
  // If 'Index' is present, matches and submatches are identified by
  // byte index pairs within the input string: result[2*n:2*n+1]
  // identifies the indexes of the nth submatch.  The pair for n==0
  // identifies the match of the entire expression.  If 'Index' is not
  // present, the match is identified by the text of the match/submatch.
  // If an index is negative, it means that subexpression did not match
  // any string in the input.

  /**
   * Returns an array holding the text of the leftmost match in {@code b} of this regular
   * expression.
   *
   * <p>
   * A return value of null indicates no match.
   */
  // This is visible for testing.
  findUTF8(b) {
    const a = this.doExecute(MachineInput.fromUTF8(b), 0, RE2Flags.UNANCHORED, 2)
    if (a === null) {
      return null
    }
    return b.slice(a[0], a[1])
  }

  /**
   * Returns a two-element array of integers defining the location of the leftmost match in
   * {@code b} of this regular expression. The match itself is at {@code b[loc[0]...loc[1]]}.
   *
   * <p>
   * A return value of null indicates no match.
   */
  // This is visible for testing.
  findUTF8Index(b) {
    const a = this.doExecute(MachineInput.fromUTF8(b), 0, RE2Flags.UNANCHORED, 2)
    if (a === null) {
      return null
    }
    return a.slice(0, 2)
  }

  /**
   * Returns a string holding the text of the leftmost match in {@code s} of this regular
   * expression.
   *
   * <p>
   * If there is no match, the return value is an empty string, but it will also be empty if the
   * regular expression successfully matches an empty string. Use {@link #findIndex} or
   * {@link #findSubmatch} if it is necessary to distinguish these cases.
   */
  // This is visible for testing.
  find(s) {
    const a = this.doExecute(MachineInput.fromUTF16(s), 0, RE2Flags.UNANCHORED, 2)
    if (a === null) {
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
   */
  // This is visible for testing.
  findIndex(s) {
    return this.doExecute(MachineInput.fromUTF16(s), 0, RE2Flags.UNANCHORED, 2)
  }

  /**
   * Returns an array of arrays the text of the leftmost match of the regular expression in
   * {@code b} and the matches, if any, of its subexpressions, as defined by the <a
   * href='#submatch'>Submatch</a> description above.
   *
   * <p>
   * A return value of null indicates no match.
   */
  // This is visible for testing.
  findUTF8Submatch(b) {
    const a = this.doExecute(MachineInput.fromUTF8(b), 0, RE2Flags.UNANCHORED, this.prog.numCap)
    if (a === null) {
      return null
    }

    const ret = new Array(1 + this.numSubexp).fill(null)
    for (let i = 0; i < ret.length; i++) {
      if (2 * i < a.length && a[2 * i] >= 0) {
        ret[i] = b.slice(a[2 * i], a[2 * i + 1])
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
   */
  // This is visible for testing.
  findUTF8SubmatchIndex(b) {
    return this.pad(
      this.doExecute(MachineInput.fromUTF8(b), 0, RE2Flags.UNANCHORED, this.prog.numCap)
    )
  }

  /**
   * Returns an array of strings holding the text of the leftmost match of the regular expression in
   * {@code s} and the matches, if any, of its subexpressions, as defined by the <a
   * href='#submatch'>Submatch</a> description above.
   *
   * <p>
   * A return value of null indicates no match.
   */
  // This is visible for testing.
  findSubmatch(s) {
    const a = this.doExecute(MachineInput.fromUTF16(s), 0, RE2Flags.UNANCHORED, this.prog.numCap)
    if (a === null) {
      return null
    }
    const ret = new Array(1 + this.numSubexp).fill(null)
    for (let i = 0; i < ret.length; i++) {
      if (2 * i < a.length && a[2 * i] >= 0) {
        ret[i] = s.substring(a[2 * i], a[2 * i + 1])
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
   */
  // This is visible for testing.
  findSubmatchIndex(s) {
    return this.pad(
      this.doExecute(MachineInput.fromUTF16(s), 0, RE2Flags.UNANCHORED, this.prog.numCap)
    )
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
   */
  // This is visible for testing.
  findAllUTF8(b, n) {
    const result = this.allMatches(MachineInput.fromUTF8(b), n, (match) =>
      b.slice(match[0], match[1])
    )
    if (result.length === 0) {
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
   */
  // This is visible for testing.
  findAllUTF8Index(b, n) {
    const result = this.allMatches(MachineInput.fromUTF8(b), n, (match) => match.slice(0, 2))
    if (result.length === 0) {
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
   */
  // This is visible for testing.
  findAll(s, n) {
    const result = this.allMatches(MachineInput.fromUTF16(s), n, (match) =>
      s.substring(match[0], match[1])
    )
    if (result.length === 0) {
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
   */
  // This is visible for testing.
  findAllIndex(s, n) {
    const result = this.allMatches(MachineInput.fromUTF16(s), n, (match) => match.slice(0, 2))
    if (result.length === 0) {
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
   */
  // This is visible for testing.
  findAllUTF8Submatch(b, n) {
    const result = this.allMatches(MachineInput.fromUTF8(b), n, (match) => {
      let slice = new Array((match.length / 2) | 0).fill(null)
      for (let j = 0; j < slice.length; j++) {
        if (match[2 * j] >= 0) {
          slice[j] = b.slice(match[2 * j], match[2 * j + 1])
        }
      }
      return slice
    })
    if (result.length === 0) {
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
   */
  // This is visible for testing.
  findAllUTF8SubmatchIndex(b, n) {
    const result = this.allMatches(MachineInput.fromUTF8(b), n)
    if (result.length === 0) {
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
   */
  // This is visible for testing.
  findAllSubmatch(s, n) {
    const result = this.allMatches(MachineInput.fromUTF16(s), n, (match) => {
      let slice = new Array((match.length / 2) | 0).fill(null)
      for (let j = 0; j < slice.length; j++) {
        if (match[2 * j] >= 0) {
          slice[j] = s.substring(match[2 * j], match[2 * j + 1])
        }
      }
      return slice
    })
    if (result.length === 0) {
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
   */
  // This is visible for testing.
  findAllSubmatchIndex(s, n) {
    const result = this.allMatches(MachineInput.fromUTF16(s), n)
    if (result.length === 0) {
      return null
    }
    return result
  }
}

export { RE2 }
