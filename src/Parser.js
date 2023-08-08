import { Codepoint } from './Codepoint'
import { RE2Flags } from './RE2Flags'
import { Unicode } from './Unicode'
import { UnicodeTables } from './UnicodeTables'
import { PERL_GROUPS, POSIX_GROUPS } from './CharGroup'
import { Utils } from './Utils'
import { CharClass } from './CharClass'
import { RE2JSSyntaxException } from './exceptions'
import { Regexp } from './Regexp'

class Pair {
  static of(first, second) {
    return new Pair(first, second)
  }

  constructor(first, second) {
    this.first = first
    this.second = second
  }
}

// StringIterator: a stream of runes with an opaque cursor, permitting
// rewinding.  The units of the cursor are not specified beyond the
// fact that ASCII characters are single width.  (Cursor positions
// could be UTF-8 byte indices, UTF-16 code indices or rune indices.)
//
// In particular, be careful with:
// - skip: only use this to advance over ASCII characters
//   since these always have a width of 1.
// - skipString: only use this to advance over strings which are
//   known to be at the current position, e.g. due to prior call to
//   lookingAt().
// Only use pop() to advance over possibly non-ASCII runes.
class StringIterator {
  constructor(str) {
    this.str = str
    this.position = 0
  }

  // Returns the cursor position.  Do not interpret the result!
  pos() {
    return this.position
  }

  // Resets the cursor position to a previous value returned by pos().
  rewindTo(pos) {
    this.position = pos
  }

  // Returns true unless the stream is exhausted.
  more() {
    return this.position < this.str.length
  }

  // Returns the rune at the cursor position.
  // Precondition: |more()|.
  peek() {
    return this.str.codePointAt(this.position)
  }

  // Advances the cursor by |n| positions, which must be ASCII runes.
  //
  // (In practise, this is only ever used to skip over regexp
  // metacharacters that are ASCII, so there is no numeric difference
  // between indices into  UTF-8 bytes, UTF-16 codes and runes.)
  skip(n) {
    this.position += n
  }

  // Advances the cursor by the number of cursor positions in |s|.
  skipString(s) {
    this.position += s.length
  }

  // Returns the rune at the cursor position, and advances the cursor
  // past it.  Precondition: |more()|.
  pop() {
    const r = this.str.codePointAt(this.position)
    this.position += Utils.charCount(r)
    return r
  }

  lookingAt(s) {
    return this.rest().startsWith(s)
  }

  // Returns the rest of the pattern as a Java UTF-16 string.
  rest() {
    return this.str.substring(this.position)
  }

  // Returns the substring from |beforePos| to the current position.
  // |beforePos| must have been previously returned by |pos()|.
  from(beforePos) {
    return this.str.substring(beforePos, this.position)
  }

  toString() {
    return this.rest()
  }
}
/**
 * A parser of regular expression patterns.
 *
 * The only public entry point is {@link #parse(String pattern, int flags)}.
 */
class Parser {
  // Unexpected error
  static ERR_INTERNAL_ERROR = 'regexp/syntax: internal error'

  // Parse errors
  static ERR_INVALID_CHAR_RANGE = 'invalid character class range'
  static ERR_INVALID_ESCAPE = 'invalid escape sequence'
  static ERR_INVALID_NAMED_CAPTURE = 'invalid named capture'
  static ERR_INVALID_PERL_OP = 'invalid or unsupported Perl syntax'
  static ERR_INVALID_REPEAT_OP = 'invalid nested repetition operator'
  static ERR_INVALID_REPEAT_SIZE = 'invalid repeat count'
  static ERR_MISSING_BRACKET = 'missing closing ]'
  static ERR_MISSING_PAREN = 'missing closing )'
  static ERR_MISSING_REPEAT_ARGUMENT = 'missing argument to repetition operator'
  static ERR_TRAILING_BACKSLASH = 'trailing backslash at end of expression'
  static ERR_DUPLICATE_NAMED_CAPTURE = 'duplicate capture group name'

  // RangeTables are represented as int[][], a list of triples (start, end,
  // stride).
  static ANY_TABLE() {
    return [[0, Unicode.MAX_RUNE, 1]]
  }

  // unicodeTable() returns the Unicode RangeTable identified by name
  // and the table of additional fold-equivalent code points.
  // Returns null if |name| does not identify a Unicode character range.
  static unicodeTable(name) {
    if (name === 'Any') {
      return Pair.of(Parser.ANY_TABLE(), Parser.ANY_TABLE())
    }
    if (UnicodeTables.CATEGORIES.has(name)) {
      return Pair.of(UnicodeTables.CATEGORIES.get(name), UnicodeTables.FOLD_CATEGORIES.get(name))
    }
    if (UnicodeTables.SCRIPTS.has(name)) {
      return Pair.of(UnicodeTables.SCRIPTS.get(name), UnicodeTables.FOLD_SCRIPT.get(name))
    }
    return null
  }

  // minFoldRune returns the minimum rune fold-equivalent to r.
  static minFoldRune(r) {
    if (r < Unicode.MIN_FOLD || r > Unicode.MAX_FOLD) {
      return r
    }

    let min = r
    const r0 = r
    for (r = Unicode.simpleFold(r); r !== r0; r = Unicode.simpleFold(r)) {
      if (min > r) {
        min = r
      }
    }
    return min
  }

  // leadingRegexp returns the leading regexp that re begins with.
  // The regexp refers to storage in re or its children.
  static leadingRegexp(re) {
    if (re.op === Regexp.Op.EMPTY_MATCH) {
      return null
    }
    if (re.op === Regexp.Op.CONCAT && re.subs.length > 0) {
      const sub = re.subs[0]
      if (sub.op === Regexp.Op.EMPTY_MATCH) {
        return null
      }
      return sub
    }
    return re
  }

  static literalRegexp(s, flags) {
    const re = new Regexp(Regexp.Op.LITERAL)
    re.flags = flags
    re.runes = Utils.stringToRunes(s)
    return re
  }
  /**
   * Parse regular expression pattern {@code pattern} with mode flags {@code flags}.
   */
  static parse(pattern, flags) {
    return new Parser(pattern, flags).parseInternal()
  }

  // parseRepeat parses {min} (max=min) or {min,} (max=-1) or {min,max}.
  // If |t| is not of that form, it returns -1.
  // If |t| has the right form but the values are negative or too big,
  // it returns -2.
  // On success, returns a nonnegative number encoding min/max in the
  // high/low signed halfwords of the result.  (Note: min >= 0; max may
  // be -1.)
  //
  // On success, advances |t| beyond the repeat; otherwise |t.pos()| is
  // undefined.
  static parseRepeat(t) {
    const start = t.pos()
    if (!t.more() || !t.lookingAt('{')) {
      return -1
    }
    t.skip(1)

    const min = Parser.parseInt(t)
    if (min === -1) {
      return -1
    }
    if (!t.more()) {
      return -1
    }

    let max
    if (!t.lookingAt(',')) {
      max = min
    } else {
      t.skip(1)
      if (!t.more()) {
        return -1
      }
      if (t.lookingAt('}')) {
        max = -1
      } else if ((max = Parser.parseInt(t)) === -1) {
        return -1
      }
    }

    if (!t.more() || !t.lookingAt('}')) {
      return -1
    }
    t.skip(1)
    if (min < 0 || min > 1000 || max === -2 || max > 1000 || (max >= 0 && min > max)) {
      throw new RE2JSSyntaxException(Parser.ERR_INVALID_REPEAT_SIZE, t.from(start))
    }

    return (min << 16) | (max & Unicode.MAX_BMP)
  }

  // isValidCaptureName reports whether name
  // is a valid capture name: [A-Za-z0-9_]+.
  // PCRE limits names to 32 bytes.
  // Python rejects names starting with digits.
  // We don't enforce either of those.
  static isValidCaptureName(name) {
    if (name.length === 0) {
      return false
    }

    for (let i = 0; i < name.length; i++) {
      const c = name.codePointAt(i)
      if (c !== Codepoint.CODES.get('_') && !Utils.isalnum(c)) {
        return false
      }
    }

    return true
  }

  // parseInt parses a nonnegative decimal integer.
  // -1 => bad format.  -2 => format ok, but integer overflow.
  static parseInt(t) {
    const start = t.pos()
    while (
      t.more() &&
      t.peek() >= Codepoint.CODES.get('0') &&
      t.peek() <= Codepoint.CODES.get('9')
    ) {
      t.skip(1)
    }

    const n = t.from(start)
    if (n.length === 0 || (n.length > 1 && n.codePointAt(0) === Codepoint.CODES.get('0'))) {
      return -1
    }
    if (n.length > 8) {
      return -2
    }
    return parseFloat(n, 10)
  }

  // can this be represented as a character class?
  // single-rune literal string, char class, ., and .|\n.
  static isCharClass(re) {
    return (
      (re.op === Regexp.Op.LITERAL && re.runes.length === 1) ||
      re.op === Regexp.Op.CHAR_CLASS ||
      re.op === Regexp.Op.ANY_CHAR_NOT_NL ||
      re.op === Regexp.Op.ANY_CHAR
    )
  }

  // does re match r?
  static matchRune(re, r) {
    switch (re.op) {
      case Regexp.Op.LITERAL:
        return re.runes.length === 1 && re.runes[0] === r
      case Regexp.Op.CHAR_CLASS:
        for (let i = 0; i < re.runes.length; i += 2) {
          if (re.runes[i] <= r && r <= re.runes[i + 1]) {
            return true
          }
        }
        return false
      case Regexp.Op.ANY_CHAR_NOT_NL:
        return r !== Codepoint.CODES.get('\n')
      case Regexp.Op.ANY_CHAR:
        return true
    }
    return false
  }

  // mergeCharClass makes dst = dst|src.
  // The caller must ensure that dst.Op >= src.Op,
  // to reduce the amount of copying.
  static mergeCharClass(dst, src) {
    switch (dst.op) {
      case Regexp.Op.ANY_CHAR:
        break
      case Regexp.Op.ANY_CHAR_NOT_NL:
        if (Parser.matchRune(src, Codepoint.CODES.get('\n'))) {
          dst.op = Regexp.Op.ANY_CHAR
        }
        break
      case Regexp.Op.CHAR_CLASS:
        if (src.op === Regexp.Op.LITERAL) {
          dst.runes = new CharClass(dst.runes).appendLiteral(src.runes[0], src.flags).toArray()
        } else {
          dst.runes = new CharClass(dst.runes).appendClass(src.runes).toArray()
        }
        break
      case Regexp.Op.LITERAL:
        if (src.runes[0] === dst.runes[0] && src.flags === dst.flags) {
          break
        }
        dst.op = Regexp.Op.CHAR_CLASS
        dst.runes = new CharClass()
          .appendLiteral(dst.runes[0], dst.flags)
          .appendLiteral(src.runes[0], src.flags)
          .toArray()
        break
    }
  }

  // parseEscape parses an escape sequence at the beginning of s
  // and returns the rune.
  // Pre: t at '\\'.  Post: after escape.
  static parseEscape(t) {
    const startPos = t.pos()
    t.skip(1) // '\\'
    if (!t.more()) {
      throw new RE2JSSyntaxException(Parser.ERR_TRAILING_BACKSLASH)
    }
    let c = t.pop()
    bigswitch: switch (c) {
      case Codepoint.CODES.get('1'):
      case Codepoint.CODES.get('2'):
      case Codepoint.CODES.get('3'):
      case Codepoint.CODES.get('4'):
      case Codepoint.CODES.get('5'):
      case Codepoint.CODES.get('6'):
      case Codepoint.CODES.get('7'): {
        if (
          !t.more() ||
          t.peek() < Codepoint.CODES.get('0') ||
          t.peek() > Codepoint.CODES.get('7')
        ) {
          break
        }
      }
      // eslint-disable-next-line no-fallthrough
      case Codepoint.CODES.get('0'): {
        let r = c - Codepoint.CODES.get('0')
        for (let i = 1; i < 3; i++) {
          if (
            !t.more() ||
            t.peek() < Codepoint.CODES.get('0') ||
            t.peek() > Codepoint.CODES.get('7')
          ) {
            break
          }
          r = r * 8 + t.peek() - Codepoint.CODES.get('0')
          t.skip(1)
        }
        return r
      }
      case Codepoint.CODES.get('x'): {
        if (!t.more()) {
          break
        }
        c = t.pop()
        if (c === Codepoint.CODES.get('{')) {
          let nhex = 0
          let r = 0
          // eslint-disable-next-line no-constant-condition
          while (true) {
            if (!t.more()) {
              break bigswitch
            }
            c = t.pop()
            if (c === Codepoint.CODES.get('}')) {
              break
            }
            const v = Utils.unhex(c)
            if (v < 0) {
              break bigswitch
            }
            r = r * 16 + v
            if (r > Unicode.MAX_RUNE) {
              break bigswitch
            }
            nhex++
          }
          if (nhex === 0) {
            break bigswitch
          }
          return r
        }
        const x = Utils.unhex(c)
        if (!t.more()) {
          break
        }
        c = t.pop()
        const y = Utils.unhex(c)
        if (x < 0 || y < 0) {
          break
        }
        return x * 16 + y
      }
      case Codepoint.CODES.get('a'):
        return Codepoint.CODES.get('\x07')
      case Codepoint.CODES.get('f'):
        return Codepoint.CODES.get('\f')
      case Codepoint.CODES.get('n'):
        return Codepoint.CODES.get('\n')
      case Codepoint.CODES.get('r'):
        return Codepoint.CODES.get('\r')
      case Codepoint.CODES.get('t'):
        return Codepoint.CODES.get('\t')
      case Codepoint.CODES.get('v'):
        return Codepoint.CODES.get('\v')
      default:
        if (!Utils.isalnum(c)) {
          return c
        }
        break
    }
    throw new RE2JSSyntaxException(Parser.ERR_INVALID_ESCAPE, t.from(startPos))
  }

  // parseClassChar parses a character class character and returns it.
  // wholeClassPos is the position of the start of the entire class "[...".
  // Pre: t at class char; Post: t after it.
  static parseClassChar(t, wholeClassPos) {
    if (!t.more()) {
      throw new RE2JSSyntaxException(Parser.ERR_MISSING_BRACKET, t.from(wholeClassPos))
    }
    if (t.lookingAt('\\')) {
      return Parser.parseEscape(t)
    }
    return t.pop()
  }

  static concatRunes(x, y) {
    return [...x, ...y]
  }

  constructor(wholeRegexp, flags = 0) {
    this.wholeRegexp = wholeRegexp
    // Flags control the behavior of the parser and record information about
    // regexp context.
    this.flags = flags
    // number of capturing groups seen
    this.numCap = 0
    this.namedGroups = {}
    // Stack of parsed expressions.
    this.stack = []
    this.free = null
  }

  // Allocate a Regexp, from the free list if possible.
  newRegexp(op) {
    let re = this.free
    if (re !== null && re.subs !== null && re.subs.length > 0) {
      this.free = re.subs[0]
      re.reinit()
      re.op = op
    } else {
      re = new Regexp(op)
    }
    return re
  }

  reuse(re) {
    if (re.subs !== null && re.subs.length > 0) {
      re.subs[0] = this.free
    }
    this.free = re
  }

  // Parse stack manipulation.

  pop() {
    return this.stack.pop()
  }

  popToPseudo() {
    const n = this.stack.length
    let i = n
    while (i > 0 && !Regexp.isPseudoOp(this.stack[i - 1].op)) {
      i--
    }

    const r = this.stack.slice(i, n)
    this.stack = this.stack.slice(0, i)
    return r
  }

  // push pushes the regexp re onto the parse stack and returns the regexp.
  // Returns null for a CHAR_CLASS that can be merged with the top-of-stack.
  push(re) {
    if (re.op === Regexp.Op.CHAR_CLASS && re.runes.length === 2 && re.runes[0] === re.runes[1]) {
      if (this.maybeConcat(re.runes[0], this.flags & ~RE2Flags.FOLD_CASE)) {
        return null
      }
      re.op = Regexp.Op.LITERAL
      re.runes = [re.runes[0]]
      re.flags = this.flags & ~RE2Flags.FOLD_CASE
    } else if (
      (re.op === Regexp.Op.CHAR_CLASS &&
        re.runes.length === 4 &&
        re.runes[0] === re.runes[1] &&
        re.runes[2] === re.runes[3] &&
        Unicode.simpleFold(re.runes[0]) === re.runes[2] &&
        Unicode.simpleFold(re.runes[2]) === re.runes[0]) ||
      (re.op === Regexp.Op.CHAR_CLASS &&
        re.runes.length === 2 &&
        re.runes[0] + 1 === re.runes[1] &&
        Unicode.simpleFold(re.runes[0]) === re.runes[1] &&
        Unicode.simpleFold(re.runes[1]) === re.runes[0])
    ) {
      // Case-insensitive rune like [Aa] or [Δδ].
      if (this.maybeConcat(re.runes[0], this.flags | RE2Flags.FOLD_CASE)) {
        return null
      }
      // Rewrite as (case-insensitive) literal.
      re.op = Regexp.Op.LITERAL
      re.runes = [re.runes[0]]
      re.flags = this.flags | RE2Flags.FOLD_CASE
    } else {
      // Incremental concatenation.
      this.maybeConcat(-1, 0)
    }
    this.stack.push(re)
    return re
  }

  // maybeConcat implements incremental concatenation
  // of literal runes into string nodes.  The parser calls this
  // before each push, so only the top fragment of the stack
  // might need processing.  Since this is called before a push,
  // the topmost literal is no longer subject to operators like *
  // (Otherwise ab* would turn into (ab)*.)
  // If (r >= 0 and there's a node left over, maybeConcat uses it
  // to push r with the given flags.
  // maybeConcat reports whether r was pushed.
  maybeConcat(r, flags) {
    const n = this.stack.length
    if (n < 2) {
      return false
    }
    const re1 = this.stack[n - 1]
    const re2 = this.stack[n - 2]
    if (
      re1.op !== Regexp.Op.LITERAL ||
      re2.op !== Regexp.Op.LITERAL ||
      (re1.flags & RE2Flags.FOLD_CASE) !== (re2.flags & RE2Flags.FOLD_CASE)
    ) {
      return false
    }
    // Push re1 into re2.
    re2.runes = Parser.concatRunes(re2.runes, re1.runes)
    // Reuse re1 if possible.
    if (r >= 0) {
      re1.runes = [r]
      re1.flags = flags
      return true
    }
    this.pop()
    this.reuse(re1)
    return false // did not push r
  }

  // newLiteral returns a new LITERAL Regexp with the given flags
  newLiteral(r, flags) {
    const re = this.newRegexp(Regexp.Op.LITERAL)
    re.flags = flags
    if ((flags & RE2Flags.FOLD_CASE) !== 0) {
      r = Parser.minFoldRune(r)
    }
    re.runes = [r]
    return re
  }

  // literal pushes a literal regexp for the rune r on the stack
  // and returns that regexp.
  literal(r) {
    this.push(this.newLiteral(r, this.flags))
  }

  // op pushes a regexp with the given op onto the stack
  // and returns that regexp.
  op(op) {
    const re = this.newRegexp(op)
    re.flags = this.flags
    return this.push(re)
  }

  // repeat replaces the top stack element with itself repeated according to
  // op, min, max.  beforePos is the start position of the repetition operator.
  // Pre: t is positioned after the initial repetition operator.
  // Post: t advances past an optional perl-mode '?', or stays put.
  //       Or, it fails with RE2JSSyntaxException.
  repeat(op, min, max, beforePos, t, lastRepeatPos) {
    let flags = this.flags
    if ((flags & RE2Flags.PERL_X) !== 0) {
      if (t.more() && t.lookingAt('?')) {
        t.skip(1)
        flags ^= RE2Flags.NON_GREEDY
      }
      if (lastRepeatPos !== -1) {
        // In Perl it is not allowed to stack repetition operators:
        // a** is a syntax error, not a doubled star, and a++ means
        // something else entirely, which we don't support!
        throw new RE2JSSyntaxException(Parser.ERR_INVALID_REPEAT_OP, t.from(lastRepeatPos))
      }
    }

    const n = this.stack.length
    if (n === 0) {
      throw new RE2JSSyntaxException(Parser.ERR_MISSING_REPEAT_ARGUMENT, t.from(beforePos))
    }

    const sub = this.stack[n - 1]
    if (Regexp.isPseudoOp(sub.op)) {
      throw new RE2JSSyntaxException(Parser.ERR_MISSING_REPEAT_ARGUMENT, t.from(beforePos))
    }

    const re = this.newRegexp(op)
    re.min = min
    re.max = max
    re.flags = flags
    re.subs = [sub]
    this.stack[n - 1] = re
  }

  // concat replaces the top of the stack (above the topmost '|' or '(') with
  // its concatenation.
  concat() {
    this.maybeConcat(-1, 0)
    const subs = this.popToPseudo()
    if (subs.length === 0) {
      return this.push(this.newRegexp(Regexp.Op.EMPTY_MATCH))
    }
    return this.push(this.collapse(subs, Regexp.Op.CONCAT))
  }

  // alternate replaces the top of the stack (above the topmost '(') with its
  // alternation.
  alternate() {
    // Scan down to find pseudo-operator (.
    // There are no | above (.
    const subs = this.popToPseudo()
    // Make sure top class is clean.
    // All the others already are (see swapVerticalBar).
    if (subs.length > 0) {
      this.cleanAlt(subs[subs.length - 1])
    }
    // Empty alternate is special case
    // (shouldn't happen but easy to handle).
    if (subs.length === 0) {
      return this.push(this.newRegexp(Regexp.Op.NO_MATCH))
    }
    return this.push(this.collapse(subs, Regexp.Op.ALTERNATE))
  }

  // cleanAlt cleans re for eventual inclusion in an alternation.
  cleanAlt(re) {
    if (re.op === Regexp.Op.CHAR_CLASS) {
      re.runes = new CharClass(re.runes).cleanClass().toArray()
      if (re.runes.length === 2 && re.runes[0] === 0 && re.runes[1] === Unicode.MAX_RUNE) {
        re.runes = null
        re.op = Regexp.Op.ANY_CHAR
      } else if (
        re.runes.length === 4 &&
        re.runes[0] === 0 &&
        re.runes[1] === Codepoint.CODES.get('\n') - 1 &&
        re.runes[2] === Codepoint.CODES.get('\n') + 1 &&
        re.runes[3] === Unicode.MAX_RUNE
      ) {
        re.runes = null
        re.op = Regexp.Op.ANY_CHAR_NOT_NL
      }
    }
  }

  // collapse returns the result of applying op to subs[start:end].
  // If (sub contains op nodes, they all get hoisted up
  // so that there is never a concat of a concat or an
  // alternate of an alternate.
  collapse(subs, op) {
    if (subs.length === 1) {
      return subs[0]
    }
    // Concatenate subs iff op is same.
    // Compute length in first pass.
    let len = 0
    for (let sub of subs) {
      len += sub.op === op ? sub.subs.length : 1
    }
    let newsubs = new Array(len).fill(null)
    let i = 0
    for (let sub of subs) {
      if (sub.op === op) {
        newsubs.splice(i, sub.subs.length, ...sub.subs)
        i += sub.subs.length
        this.reuse(sub)
      } else {
        newsubs[i++] = sub
      }
    }

    let re = this.newRegexp(op)
    re.subs = newsubs
    if (op === Regexp.Op.ALTERNATE) {
      // re.subs = this.factor(re.subs, re.flags)
      re.subs = this.factor(re.subs)
      if (re.subs.length === 1) {
        const old = re
        re = re.subs[0]
        this.reuse(old)
      }
    }
    return re
  }

  // factor factors common prefixes from the alternation list sub.  It
  // returns a replacement list that reuses the same storage and frees
  // (passes to p.reuse) any removed *Regexps.
  //
  // For example,
  //     ABC|ABD|AEF|BCX|BCY
  // simplifies by literal prefix extraction to
  //     A(B(C|D)|EF)|BC(X|Y)
  // which simplifies by character class introduction to
  //     A(B[CD]|EF)|BC[XY]
  //
  factor(array) {
    if (array.length < 2) {
      return array
    }
    // The following code is subtle, because it's a literal JS
    // translation of code that makes clever use of Go "slices".
    // A slice is a triple (array, offset, length), and the Go
    // implementation uses two slices, |sub| and |out| backed by the
    // same array.  In JS, we have to be explicit about all of these
    // variables, so:
    //
    // Go    JS
    // sub   (array, s, lensub)
    // out   (array, 0, lenout)   // (always a prefix of |array|)
    //
    // In the comments we'll use the logical notation of go slices, e.g. sub[i]
    // even though the JS code will read array[s + i].

    let s = 0 // offset of first |sub| within array.
    let lensub = array.length // = len(sub)
    let lenout = 0 // = len(out)
    // Round 1: Factor out common literal prefixes.
    // Note: (str, strlen) and (istr, istrlen) are like Go slices
    // onto a prefix of some Regexp's runes array (hence offset=0).
    let str = null
    let strlen = 0
    let strflags = 0
    let start = 0
    for (let i = 0; i <= lensub; i++) {
      // Invariant: the Regexps that were in sub[0:start] have been
      // used or marked for reuse, and the slice space has been reused
      // for out (len <= start).
      //
      // Invariant: sub[start:i] consists of regexps that all begin
      // with str as modified by strflags.
      let istr = null
      let istrlen = 0
      let iflags = 0
      if (i < lensub) {
        // NB, we inlined Go's leadingString() since Java has no pair return.
        let re = array[s + i]
        if (re.op === Regexp.Op.CONCAT && re.subs.length > 0) {
          re = re.subs[0]
        }
        if (re.op === Regexp.Op.LITERAL) {
          istr = re.runes
          istrlen = re.runes.length
          iflags = re.flags & RE2Flags.FOLD_CASE
        }
        // istr is the leading literal string that re begins with.
        // The string refers to storage in re or its children.
        if (iflags === strflags) {
          let same = 0
          while (same < strlen && same < istrlen && str[same] === istr[same]) {
            same++
          }

          if (same > 0) {
            // Matches at least one rune in current range.
            // Keep going around.
            strlen = same
            continue
          }
        }
      }
      // Found end of a run with common leading literal string:
      // sub[start:i] all begin with str[0:strlen], but sub[i]
      // does not even begin with str[0].
      //
      // Factor out common string and append factored expression to out.
      if (i === start) {
        // Nothing to do - run of length 0.
      } else if (i === start + 1) {
        // Just one: don't bother factoring.
        array[lenout++] = array[s + start]
      } else {
        // Construct factored form: prefix(suffix1|suffix2|...)
        const prefix = this.newRegexp(Regexp.Op.LITERAL)
        prefix.flags = strflags
        prefix.runes = str.slice(0, strlen)
        for (let j = start; j < i; j++) {
          array[s + j] = this.removeLeadingString(array[s + j], strlen)
        }
        // Recurse.
        const suffix = this.collapse(array.slice(s + start, s + i), Regexp.Op.ALTERNATE)
        const re = this.newRegexp(Regexp.Op.CONCAT)
        re.subs = [prefix, suffix]
        array[lenout++] = re
      }
      // Prepare for next iteration.
      start = i
      str = istr
      strlen = istrlen
      strflags = iflags
    }
    // In Go: sub = out
    lensub = lenout
    s = 0
    // Round 2: Factor out common complex prefixes,
    // just the first piece of each concatenation,
    // whatever it is.  This is good enough a lot of the time.
    start = 0
    lenout = 0
    let first = null
    for (let i = 0; i <= lensub; i++) {
      // Invariant: the Regexps that were in sub[0:start] have been
      // used or marked for reuse, and the slice space has been reused
      // for out (lenout <= start).
      //
      // Invariant: sub[start:i] consists of regexps that all begin with
      // ifirst.
      let ifirst = null
      if (i < lensub) {
        ifirst = Parser.leadingRegexp(array[s + i])
        if (
          first !== null &&
          first.equals(ifirst) &&
          (Parser.isCharClass(first) ||
            (first.op === Regexp.Op.REPEAT &&
              first.min === first.max &&
              Parser.isCharClass(first.subs[0])))
        ) {
          continue
        }
      }
      // Found end of a run with common leading regexp:
      // sub[start:i] all begin with first but sub[i] does not.
      //
      // Factor out common regexp and append factored expression to out.
      if (i === start) {
        // Nothing to do - run of length 0.
      } else if (i === start + 1) {
        // Just one: don't bother factoring.
        array[lenout++] = array[s + start]
      } else {
        // Construct factored form: prefix(suffix1|suffix2|...)
        const prefix = first
        for (let j = start; j < i; j++) {
          const reuse = j !== start // prefix came from sub[start]
          array[s + j] = this.removeLeadingRegexp(array[s + j], reuse)
        }
        // recurse
        const suffix = this.collapse(array.slice(s + start, s + i), Regexp.Op.ALTERNATE)
        const re = this.newRegexp(Regexp.Op.CONCAT)
        re.subs = [prefix, suffix]
        array[lenout++] = re
      }
      // Prepare for next iteration.
      start = i
      first = ifirst
    }
    // In Go: sub = out
    lensub = lenout
    s = 0
    // Round 3: Collapse runs of single literals into character classes.
    start = 0
    lenout = 0
    for (let i = 0; i <= lensub; i++) {
      // Invariant: the Regexps that were in sub[0:start] have been
      // used or marked for reuse, and the slice space has been reused
      // for out (lenout <= start).
      //
      // Invariant: sub[start:i] consists of regexps that are either
      // literal runes or character classes.
      if (i < lensub && Parser.isCharClass(array[s + i])) {
        continue
      }
      // sub[i] is not a char or char class;
      // emit char class for sub[start:i]...
      if (i === start) {
        // Nothing to do - run of length 0.
      } else if (i === start + 1) {
        // Just one: don't bother factoring.
        array[lenout++] = array[s + start]
      } else {
        // Make new char class.
        // Start with most complex regexp in sub[start].
        let max = start
        for (let j = start + 1; j < i; j++) {
          const subMax = array[s + max]
          const subJ = array[s + j]
          if (
            subMax.op < subJ.op ||
            (subMax.op === subJ.op &&
              (subMax.runes !== null ? subMax.runes.length : 0) <
                (subJ.runes !== null ? subJ.runes.length : 0))
          ) {
            max = j
          }
        }
        // swap sub[start], sub[max].
        const tmp = array[s + start]
        array[s + start] = array[s + max]
        array[s + max] = tmp
        for (let j = start + 1; j < i; j++) {
          Parser.mergeCharClass(array[s + start], array[s + j])
          this.reuse(array[s + j])
        }
        this.cleanAlt(array[s + start])
        array[lenout++] = array[s + start]
      }
      // ... and then emit sub[i].
      if (i < lensub) {
        array[lenout++] = array[s + i]
      }
      start = i + 1
    }
    // In Go: sub = out
    lensub = lenout
    s = 0
    // Round 4: Collapse runs of empty matches into a single empty match.
    start = 0
    lenout = 0
    for (let i = 0; i < lensub; ++i) {
      if (
        i + 1 < lensub &&
        array[s + i].op === Regexp.Op.EMPTY_MATCH &&
        array[s + i + 1].op === Regexp.Op.EMPTY_MATCH
      ) {
        continue
      }
      array[lenout++] = array[s + i]
    }
    // In Go: sub = out
    lensub = lenout
    s = 0
    return array.slice(s, lensub)
  }

  // removeLeadingString removes the first n leading runes
  // from the beginning of re.  It returns the replacement for re.
  removeLeadingString(re, n) {
    if (re.op === Regexp.Op.CONCAT && re.subs.length > 0) {
      // Removing a leading string in a concatenation
      // might simplify the concatenation.
      const sub = this.removeLeadingString(re.subs[0], n)
      re.subs[0] = sub
      if (sub.op === Regexp.Op.EMPTY_MATCH) {
        this.reuse(sub)
        switch (re.subs.length) {
          case 0:
          case 1:
            // Impossible but handle.
            re.op = Regexp.Op.EMPTY_MATCH
            re.subs = null
            break
          case 2: {
            const old = re
            re = re.subs[1]
            this.reuse(old)
            break
          }
          default:
            re.subs = re.subs.slice(1, re.subs.length)
            break
        }
      }
      return re
    }
    if (re.op === Regexp.Op.LITERAL) {
      re.runes = re.runes.slice(n, re.runes.length)
      if (re.runes.length === 0) {
        re.op = Regexp.Op.EMPTY_MATCH
      }
    }
    return re
  }

  // removeLeadingRegexp removes the leading regexp in re.
  // It returns the replacement for re.
  // If reuse is true, it passes the removed regexp (if no longer needed) to
  // reuse.
  removeLeadingRegexp(re, reuse) {
    if (re.op === Regexp.Op.CONCAT && re.subs.length > 0) {
      if (reuse) {
        this.reuse(re.subs[0])
      }
      re.subs = re.subs.slice(1, re.subs.length)
      switch (re.subs.length) {
        case 0: {
          re.op = Regexp.Op.EMPTY_MATCH
          re.subs = Regexp.emptySubs()
          break
        }
        case 1: {
          const old = re
          re = re.subs[0]
          this.reuse(old)
          break
        }
      }
      return re
    }
    if (reuse) {
      this.reuse(re)
    }
    return this.newRegexp(Regexp.Op.EMPTY_MATCH)
  }

  parseInternal() {
    if ((this.flags & RE2Flags.LITERAL) !== 0) {
      // Trivial parser for literal string.
      return Parser.literalRegexp(this.wholeRegexp, this.flags)
    }
    // Otherwise, must do real work.
    let lastRepeatPos = -1
    let min = -1
    let max = -1
    const t = new StringIterator(this.wholeRegexp)
    while (t.more()) {
      {
        let repeatPos = -1
        bigswitch: switch (t.peek()) {
          case Codepoint.CODES.get('('):
            if ((this.flags & RE2Flags.PERL_X) !== 0 && t.lookingAt('(?')) {
              // Flag changes and non-capturing groups.
              this.parsePerlFlags(t)
              break
            }
            this.op(Regexp.Op.LEFT_PAREN).cap = ++this.numCap
            t.skip(1) // '('
            break
          case Codepoint.CODES.get('|'):
            this.parseVerticalBar() // '|'
            t.skip(1) // '|'
            break
          case Codepoint.CODES.get(')'):
            this.parseRightParen()
            t.skip(1) // ')'
            break
          case Codepoint.CODES.get('^'):
            if ((this.flags & RE2Flags.ONE_LINE) !== 0) {
              this.op(Regexp.Op.BEGIN_TEXT)
            } else {
              this.op(Regexp.Op.BEGIN_LINE)
            }
            t.skip(1) // '^'
            break
          case Codepoint.CODES.get('$'):
            if ((this.flags & RE2Flags.ONE_LINE) !== 0) {
              this.op(Regexp.Op.END_TEXT).flags |= RE2Flags.WAS_DOLLAR
            } else {
              this.op(Regexp.Op.END_LINE)
            }
            t.skip(1) // '$'
            break
          case Codepoint.CODES.get('.'):
            if ((this.flags & RE2Flags.DOT_NL) !== 0) {
              this.op(Regexp.Op.ANY_CHAR)
            } else {
              this.op(Regexp.Op.ANY_CHAR_NOT_NL)
            }
            t.skip(1) // '.'
            break
          case Codepoint.CODES.get('['):
            this.parseClass(t)
            break
          case Codepoint.CODES.get('*'):
          case Codepoint.CODES.get('+'):
          case Codepoint.CODES.get('?'): {
            repeatPos = t.pos()
            let op = null
            switch (t.pop()) {
              case Codepoint.CODES.get('*'):
                op = Regexp.Op.STAR
                break
              case Codepoint.CODES.get('+'):
                op = Regexp.Op.PLUS
                break
              case Codepoint.CODES.get('?'):
                op = Regexp.Op.QUEST
                break
            }
            this.repeat(op, min, max, repeatPos, t, lastRepeatPos)
            // (min and max are now dead.)
            break
          }

          case Codepoint.CODES.get('{'): {
            repeatPos = t.pos()
            const minMax = Parser.parseRepeat(t)
            if (minMax < 0) {
              // If the repeat cannot be parsed, { is a literal.
              t.rewindTo(repeatPos)
              this.literal(t.pop()) // '{'
              break
            }
            min = minMax >> 16
            max = ((minMax & Unicode.MAX_BMP) << 16) >> 16
            this.repeat(Regexp.Op.REPEAT, min, max, repeatPos, t, lastRepeatPos)
            break
          }

          case Codepoint.CODES.get('\\'): {
            const savedPos = t.pos()
            t.skip(1) // '\\'
            if ((this.flags & RE2Flags.PERL_X) !== 0 && t.more()) {
              const c = t.pop()
              switch (c) {
                case Codepoint.CODES.get('A'):
                  this.op(Regexp.Op.BEGIN_TEXT)
                  break bigswitch
                case Codepoint.CODES.get('b'):
                  this.op(Regexp.Op.WORD_BOUNDARY)
                  break bigswitch
                case Codepoint.CODES.get('B'):
                  this.op(Regexp.Op.NO_WORD_BOUNDARY)
                  break bigswitch
                case Codepoint.CODES.get('C'):
                  // any byte; not supported
                  throw new RE2JSSyntaxException(Parser.ERR_INVALID_ESCAPE, '\\C')
                case Codepoint.CODES.get('Q'): {
                  // \Q ... \E: the ... is always literals
                  let lit = t.rest()
                  const i = lit.indexOf('\\E')
                  if (i >= 0) {
                    lit = lit.substring(0, i)
                  }
                  t.skipString(lit)
                  t.skipString('\\E')

                  let j = 0
                  while (j < lit.length) {
                    const codepoint = lit.codePointAt(j)
                    this.literal(codepoint)
                    j += Utils.charCount(codepoint)
                  }
                  break bigswitch
                }

                case Codepoint.CODES.get('z'):
                  this.op(Regexp.Op.END_TEXT)
                  break bigswitch
                default:
                  t.rewindTo(savedPos)
                  break
              }
            }

            const re = this.newRegexp(Regexp.Op.CHAR_CLASS)
            re.flags = this.flags
            // Look for Unicode character group like \p{Han}
            if (t.lookingAt('\\p') || t.lookingAt('\\P')) {
              const cc = new CharClass()
              if (this.parseUnicodeClass(t, cc)) {
                re.runes = cc.toArray()
                this.push(re)
                break bigswitch
              }
            }
            // Perl character class escape.
            const cc = new CharClass()
            if (this.parsePerlClassEscape(t, cc)) {
              re.runes = cc.toArray()
              this.push(re)
              break bigswitch
            }
            t.rewindTo(savedPos)
            this.reuse(re)
            // Ordinary single-character escape.
            this.literal(Parser.parseEscape(t))
            break
          }
          default:
            this.literal(t.pop())
            break
        }
        lastRepeatPos = repeatPos
      }
    }

    this.concat()
    if (this.swapVerticalBar()) {
      this.pop() // pop vertical bar
    }
    this.alternate()
    const n = this.stack.length
    if (n !== 1) {
      throw new RE2JSSyntaxException(Parser.ERR_MISSING_PAREN, this.wholeRegexp)
    }
    this.stack[0].namedGroups = this.namedGroups
    return this.stack[0]
  }

  // parsePerlFlags parses a Perl flag setting or non-capturing group or both,
  // like (?i) or (?: or (?i:.
  // Pre: t at "(?".  Post: t after ")".
  // Sets numCap.
  parsePerlFlags(t) {
    const startPos = t.pos()
    // Check for named captures, first introduced in Python's regexp library.
    // As usual, there are three slightly different syntaxes:
    //
    //   (?P<name>expr)   the original, introduced by Python
    //   (?<name>expr)    the .NET alteration, adopted by Perl 5.10
    //   (?'name'expr)    another .NET alteration, adopted by Perl 5.10
    //
    // Perl 5.10 gave in and implemented the Python version too,
    // but they claim that the last two are the preferred forms.
    // PCRE and languages based on it (specifically, PHP and Ruby)
    // support all three as well.  EcmaScript 4 uses only the Python form.
    //
    // In both the open source world (via Code Search) and the
    // Google source tree, (?P<expr>name) is the dominant form,
    // so that's the one we implement.  One is enough.
    const s = t.rest()
    if (s.startsWith('(?P<')) {
      // Pull out name.
      const end = s.indexOf('>')
      if (end < 0) {
        throw new RE2JSSyntaxException(Parser.ERR_INVALID_NAMED_CAPTURE, s)
      }
      const name = s.substring(4, end) // "name"
      t.skipString(name)
      t.skip(5) // "(?P<>"
      if (!Parser.isValidCaptureName(name)) {
        // "(?P<name>"
        throw new RE2JSSyntaxException(Parser.ERR_INVALID_NAMED_CAPTURE, s.substring(0, end))
      }
      // Like ordinary capture, but named.
      const re = this.op(Regexp.Op.LEFT_PAREN)
      re.cap = ++this.numCap
      if (this.namedGroups[name]) {
        throw new RE2JSSyntaxException(Parser.ERR_DUPLICATE_NAMED_CAPTURE, name)
      }
      this.namedGroups[name] = this.numCap
      re.name = name
      return
    }
    // Non-capturing group.  Might also twiddle Perl flags.
    t.skip(2) // "(?"

    let flags = this.flags
    let sign = +1
    let sawFlag = false
    loop: while (t.more()) {
      {
        const c = t.pop()
        switch (c) {
          case Codepoint.CODES.get('i'):
            flags |= RE2Flags.FOLD_CASE
            sawFlag = true
            break
          case Codepoint.CODES.get('m'):
            flags &= ~RE2Flags.ONE_LINE
            sawFlag = true
            break
          case Codepoint.CODES.get('s'):
            flags |= RE2Flags.DOT_NL
            sawFlag = true
            break
          case Codepoint.CODES.get('U'):
            flags |= RE2Flags.NON_GREEDY
            sawFlag = true
            break
          // Switch to negation.
          case Codepoint.CODES.get('-'):
            if (sign < 0) {
              break loop
            }
            sign = -1
            // Invert flags so that | above turn into &~ and vice versa.
            // We'll invert flags again before using it below.
            flags = ~flags
            sawFlag = false
            break
          // End of flags, starting group or not.
          case Codepoint.CODES.get(':'):
          case Codepoint.CODES.get(')'):
            if (sign < 0) {
              if (!sawFlag) {
                break loop
              }
              flags = ~flags
            }
            if (c === Codepoint.CODES.get(':')) {
              // Open new group
              this.op(Regexp.Op.LEFT_PAREN)
            }
            this.flags = flags
            return
          default:
            // Flags.
            break loop
        }
      }
    }

    throw new RE2JSSyntaxException(Parser.ERR_INVALID_PERL_OP, t.from(startPos))
  }

  // parseVerticalBar handles a | in the input.
  parseVerticalBar() {
    this.concat()
    // The concatenation we just parsed is on top of the stack.
    // If it sits above an opVerticalBar, swap it below
    // (things below an opVerticalBar become an alternation).
    // Otherwise, push a new vertical bar.
    if (!this.swapVerticalBar()) {
      this.op(Regexp.Op.VERTICAL_BAR)
    }
  }

  // If the top of the stack is an element followed by an opVerticalBar
  // swapVerticalBar swaps the two and returns true.
  // Otherwise it returns false.
  swapVerticalBar() {
    const n = this.stack.length
    // If above and below vertical bar are literal or char class,
    // can merge into a single char class.
    if (
      n >= 3 &&
      this.stack[n - 2].op === Regexp.Op.VERTICAL_BAR &&
      Parser.isCharClass(this.stack[n - 1]) &&
      Parser.isCharClass(this.stack[n - 3])
    ) {
      let re1 = this.stack[n - 1]
      let re3 = this.stack[n - 3]
      // Make re3 the more complex of the two.
      if (re1.op > re3.op) {
        const tmp = re3
        re3 = re1
        re1 = tmp
        this.stack[n - 3] = re3
      }
      Parser.mergeCharClass(re3, re1)
      this.reuse(re1)
      this.pop()
      return true
    }
    if (n >= 2) {
      const re1 = this.stack[n - 1]
      const re2 = this.stack[n - 2]
      if (re2.op === Regexp.Op.VERTICAL_BAR) {
        if (n >= 3) {
          // Now out of reach.
          // Clean opportunistically.
          this.cleanAlt(this.stack[n - 3])
        }
        this.stack[n - 2] = re1
        this.stack[n - 1] = re2
        return true
      }
    }
    return false
  }

  // parseRightParen handles a ')' in the input.
  parseRightParen() {
    this.concat()
    if (this.swapVerticalBar()) {
      this.pop() // pop vertical bar
    }
    this.alternate()
    const n = this.stack.length
    if (n < 2) {
      throw new RE2JSSyntaxException(Parser.ERR_INTERNAL_ERROR, 'stack underflow')
    }

    const re1 = this.pop()
    const re2 = this.pop()
    if (re2.op !== Regexp.Op.LEFT_PAREN) {
      throw new RE2JSSyntaxException(Parser.ERR_MISSING_PAREN, this.wholeRegexp)
    }
    // Restore flags at time of paren.
    this.flags = re2.flags
    if (re2.cap === 0) {
      // Just for grouping.
      this.push(re1)
    } else {
      re2.op = Regexp.Op.CAPTURE
      re2.subs = [re1]
      this.push(re2)
    }
  }

  // parsePerlClassEscape parses a leading Perl character class escape like \d
  // from the beginning of |t|.  If one is present, it appends the characters
  // to cc and returns true.  The iterator is advanced past the escape
  // on success, undefined on failure, in which case false is returned.
  parsePerlClassEscape(t, cc) {
    const beforePos = t.pos()
    if (
      (this.flags & RE2Flags.PERL_X) === 0 ||
      !t.more() ||
      t.pop() !== Codepoint.CODES.get('\\') ||
      !t.more()
    ) {
      return false
    }
    t.pop() // e.g. advance past 'd' in "\\d"
    const p = t.from(beforePos)
    const g = PERL_GROUPS.has(p) ? PERL_GROUPS.get(p) : null
    if (g === null) {
      return false
    }
    cc.appendGroup(g, (this.flags & RE2Flags.FOLD_CASE) !== 0)
    return true
  }

  // parseNamedClass parses a leading POSIX named character class like
  // [:alnum:] from the beginning of t.  If one is present, it appends the
  // characters to cc, advances the iterator, and returns true.
  // Pre: t at "[:".  Post: t after ":]".
  // On failure (no class of than name), throws RE2JSSyntaxException.
  // On misparse, returns false; t.pos() is undefined.
  parseNamedClass(t, cc) {
    // (Go precondition check deleted.)
    const cls = t.rest()
    const i = cls.indexOf(':]')
    if (i < 0) {
      return false
    }

    const name = cls.substring(0, i + 2) // "[:alnum:]"
    t.skipString(name)
    const g = POSIX_GROUPS.has(name) ? POSIX_GROUPS.get(name) : null
    if (g === null) {
      throw new RE2JSSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, name)
    }
    cc.appendGroup(g, (this.flags & RE2Flags.FOLD_CASE) !== 0)
    return true
  }

  // parseUnicodeClass() parses a leading Unicode character class like \p{Han}
  // from the beginning of t.  If one is present, it appends the characters to
  // to |cc|, advances |t| and returns true.
  //
  // Returns false if such a pattern is not present or UNICODE_GROUPS
  // flag is not enabled; |t.pos()| is not advanced in this case.
  // Indicates error by throwing RE2JSSyntaxException.
  parseUnicodeClass(t, cc) {
    const startPos = t.pos()
    if (
      (this.flags & RE2Flags.UNICODE_GROUPS) === 0 ||
      (!t.lookingAt('\\p') && !t.lookingAt('\\P'))
    ) {
      return false
    }

    t.skip(1) // '\\'
    // Committed to parse or throw exception.
    let sign = +1
    let c = t.pop() // 'p' or 'P'
    if (c === Codepoint.CODES.get('P')) {
      sign = -1
    }
    if (!t.more()) {
      t.rewindTo(startPos)
      throw new RE2JSSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.rest())
    }

    c = t.pop()
    let name

    if (c !== Codepoint.CODES.get('{')) {
      // Single-letter name.
      name = Utils.runeToString(c)
    } else {
      // Name is in braces.
      const rest = t.rest()
      const end = rest.indexOf('}')
      if (end < 0) {
        t.rewindTo(startPos)
        throw new RE2JSSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.rest())
      }
      name = rest.substring(0, end) // e.g. "Han"
      t.skipString(name)
      t.skip(1)
      // Don't use skip(end) because it assumes UTF-16 coding, and
      // StringIterator doesn't guarantee that.
    }
    // Group can have leading negation too.
    //  \p{^Han} == \P{Han}, \P{^Han} == \p{Han}.
    if (!(name.length === 0) && name.codePointAt(0) === Codepoint.CODES.get('^')) {
      sign = 0 - sign // -sign
      name = name.substring(1)
    }

    const pair = Parser.unicodeTable(name)
    if (pair === null) {
      throw new RE2JSSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.from(startPos))
    }

    const tab = pair.first
    const fold = pair.second // fold-equivalent table
    // Variation of CharClass.appendGroup() for tables.
    if ((this.flags & RE2Flags.FOLD_CASE) === 0 || fold === null) {
      cc.appendTableWithSign(tab, sign)
    } else {
      // Merge and clean tab and fold in a temporary buffer.
      // This is necessary for the negative case and just tidy
      // for the positive case.
      const tmp = new CharClass().appendTable(tab).appendTable(fold).cleanClass().toArray()
      cc.appendClassWithSign(tmp, sign)
    }
    return true
  }

  // parseClass parses a character class and pushes it onto the parse stack.
  //
  // NOTES:
  // Pre: at '['; Post: after ']'.
  // Mutates stack.  Advances iterator.  May throw.
  parseClass(t) {
    const startPos = t.pos()
    t.skip(1) // '['
    const re = this.newRegexp(Regexp.Op.CHAR_CLASS)
    re.flags = this.flags
    const cc = new CharClass()
    let sign = +1

    if (t.more() && t.lookingAt('^')) {
      sign = -1
      t.skip(1) // '^'
      // If character class does not match \n, add it here,
      // so that negation later will do the right thing.
      if ((this.flags & RE2Flags.CLASS_NL) === 0) {
        cc.appendRange(Codepoint.CODES.get('\n'), Codepoint.CODES.get('\n'))
      }
    }

    let first = true // ']' and '-' are okay as first char in class
    while (!t.more() || t.peek() !== Codepoint.CODES.get(']') || first) {
      // POSIX: - is only okay unescaped as first or last in class.
      // Perl: - is okay anywhere.
      if (t.more() && t.lookingAt('-') && (this.flags & RE2Flags.PERL_X) === 0 && !first) {
        const s = t.rest()
        if (s === '-' || !s.startsWith('-]')) {
          t.rewindTo(startPos)
          throw new RE2JSSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.rest())
        }
      }

      first = false
      const beforePos = t.pos()
      // Look for POSIX [:alnum:] etc.
      if (t.lookingAt('[:')) {
        if (this.parseNamedClass(t, cc)) {
          continue
        }
        t.rewindTo(beforePos)
      }

      // Look for Unicode character group like \p{Han}.
      if (this.parseUnicodeClass(t, cc)) {
        continue
      }

      // Look for Perl character class symbols (extension).
      if (this.parsePerlClassEscape(t, cc)) {
        continue
      }
      t.rewindTo(beforePos)

      // Single character or simple range.
      const lo = Parser.parseClassChar(t, startPos)
      let hi = lo
      if (t.more() && t.lookingAt('-')) {
        t.skip(1)
        if (t.more() && t.lookingAt(']')) {
          // [a-] means (a|-) so check for final ].
          t.skip(-1)
        } else {
          hi = Parser.parseClassChar(t, startPos)
          if (hi < lo) {
            throw new RE2JSSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.from(beforePos))
          }
        }
      }
      if ((this.flags & RE2Flags.FOLD_CASE) === 0) {
        cc.appendRange(lo, hi)
      } else {
        cc.appendFoldedRange(lo, hi)
      }
    }
    t.skip(1) // ']'

    cc.cleanClass()
    if (sign < 0) {
      cc.negateClass()
    }
    re.runes = cc.toArray()
    this.push(re)
  }
}

export { Parser }
