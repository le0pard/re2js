import { RE2Flags } from './RE2Flags'
import { Unicode } from './Unicode'
import { UnicodeTables } from './UnicodeTables'
import { PERL_GROUPS, POSIX_GROUPS } from './CharGroup'
import { Utils } from './Utils'
import { CharClass } from './CharClass'
import { PatternSyntaxException } from './PatternSyntaxException'
import { Regexp } from './Regexp'

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
  static ERR_INTERNAL_ERROR = 'regexp/syntax: internal error'
  static ERR_INVALID_CHAR_CLASS = 'invalid character class'
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

  constructor(wholeRegexp, flags) {
    if (this.wholeRegexp === undefined) {
      this.wholeRegexp = null
    }
    if (this.flags === undefined) {
      this.flags = 0
    }
    this.stack = (() => {
      let __o = new Parser.Stack()
      __o.__delegate = []
      return __o
    })()
    if (this.free === undefined) {
      this.free = null
    }
    this.numCap = 0
    this.namedGroups = {}
    this.wholeRegexp = wholeRegexp
    this.flags = flags
  }
  newRegexp(op) {
    let re = this.free
    if (re != null && re.subs != null && re.subs.length > 0) {
      this.free = re.subs[0]
      re.reinit()
      re.op = op
    } else {
      re = new Regexp(op)
    }
    return re
  }
  reuse(re) {
    if (re.subs != null && re.subs.length > 0) {
      re.subs[0] = this.free
    }
    this.free = re
  }
  pop() {
    return /* remove */ this.stack.__delegate.splice(
      /* size */ this.stack.__delegate.length - 1,
      1
    )[0]
  }
  popToPseudo() {
    const n = this.stack.__delegate.length
    let i = n
    while (i > 0 && !Regexp.isPseudoOp(this.stack.__delegate[i - 1].op)) {
      {
        i--
      }
    }

    const r = ((a1, a2) => {
      if (a1.length >= a2.length) {
        a1.length = 0
        a1.push.apply(a1, a2)
        return a1
      } else {
        return a2.slice(0)
      }
    })(
      ((s) => {
        let a = []
        while (s-- > 0) {
          a.push(null)
        }
        return a
      })(n - i),
      /* subList */ this.stack.__delegate.slice(i, n)
    )
    this.stack.removeRange(i, n)
    return r
  }
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
      if (this.maybeConcat(re.runes[0], this.flags | RE2Flags.FOLD_CASE)) {
        return null
      }
      re.op = Regexp.Op.LITERAL
      re.runes = [re.runes[0]]
      re.flags = this.flags | RE2Flags.FOLD_CASE
    } else {
      this.maybeConcat(-1, 0)
    }
    /* add */ this.stack.__delegate.push(re) > 0
    return re
  }
  maybeConcat(r, flags) {
    const n = this.stack.__delegate.length
    if (n < 2) {
      return false
    }
    const re1 = this.stack.__delegate[n - 1]
    const re2 = this.stack.__delegate[n - 2]
    if (
      re1.op !== Regexp.Op.LITERAL ||
      re2.op !== Regexp.Op.LITERAL ||
      (re1.flags & RE2Flags.FOLD_CASE) !== (re2.flags & RE2Flags.FOLD_CASE)
    ) {
      return false
    }
    re2.runes = Parser.concatRunes(re2.runes, re1.runes)
    if (r >= 0) {
      re1.runes = [r]
      re1.flags = flags
      return true
    }
    this.pop()
    this.reuse(re1)
    return false
  }
  newLiteral(r, flags) {
    const re = this.newRegexp(Regexp.Op.LITERAL)
    re.flags = flags
    if ((flags & RE2Flags.FOLD_CASE) !== 0) {
      r = Parser.minFoldRune(r)
    }
    re.runes = [r]
    return re
  }
  static minFoldRune(r) {
    if (r < Unicode.MIN_FOLD || r > Unicode.MAX_FOLD) {
      return r
    }
    let min = r
    const r0 = r
    for (r = Unicode.simpleFold(r); r !== r0; r = Unicode.simpleFold(r)) {
      {
        if (min > r) {
          min = r
        }
      }
    }
    return min
  }
  literal(r) {
    this.push(this.newLiteral(r, this.flags))
  }
  op(op) {
    const re = this.newRegexp(op)
    re.flags = this.flags
    return this.push(re)
  }
  repeat(op, min, max, beforePos, t, lastRepeatPos) {
    let flags = this.flags
    if ((flags & RE2Flags.PERL_X) !== 0) {
      if (t.more() && t.lookingAt('?')) {
        t.skip(1)
        flags ^= RE2Flags.NON_GREEDY
      }
      if (lastRepeatPos !== -1) {
        throw new PatternSyntaxException(Parser.ERR_INVALID_REPEAT_OP, t.from(lastRepeatPos))
      }
    }
    const n = this.stack.__delegate.length
    if (n === 0) {
      throw new PatternSyntaxException(Parser.ERR_MISSING_REPEAT_ARGUMENT, t.from(beforePos))
    }
    const sub = this.stack.__delegate[n - 1]
    if (Regexp.isPseudoOp(sub.op)) {
      throw new PatternSyntaxException(Parser.ERR_MISSING_REPEAT_ARGUMENT, t.from(beforePos))
    }
    const re = this.newRegexp(op)
    re.min = min
    re.max = max
    re.flags = flags
    re.subs = [sub]
    /* set */ this.stack.__delegate[n - 1] = re
  }
  concat() {
    this.maybeConcat(-1, 0)
    const subs = this.popToPseudo()
    if (subs.length === 0) {
      return this.push(this.newRegexp(Regexp.Op.EMPTY_MATCH))
    }
    return this.push(this.collapse(subs, Regexp.Op.CONCAT))
  }
  alternate() {
    const subs = this.popToPseudo()
    if (subs.length > 0) {
      this.cleanAlt(subs[subs.length - 1])
    }
    if (subs.length === 0) {
      return this.push(this.newRegexp(Regexp.Op.NO_MATCH))
    }
    return this.push(this.collapse(subs, Regexp.Op.ALTERNATE))
  }
  cleanAlt(re) {
    if (re.op === Regexp.Op.CHAR_CLASS) {
      re.runes = new CharClass(re.runes).cleanClass().toArray()
      if (re.runes.length === 2 && re.runes[0] === 0 && re.runes[1] === Unicode.MAX_RUNE) {
        re.runes = null
        re.op = Regexp.Op.ANY_CHAR
      } else if (
        re.runes.length === 4 &&
        re.runes[0] === 0 &&
        re.runes[1] === '\n'.codePointAt(0) - 1 &&
        re.runes[2] === '\n'.codePointAt(0) + 1 &&
        re.runes[3] === Unicode.MAX_RUNE
      ) {
        re.runes = null
        re.op = Regexp.Op.ANY_CHAR_NOT_NL
      }
    }
  }
  collapse(subs, op) {
    if (subs.length === 1) {
      return subs[0]
    }
    let len = 0
    for (let index = 0; index < subs.length; index++) {
      let sub = subs[index]
      {
        len += sub.op === op ? sub.subs.length : 1
      }
    }
    const newsubs = ((s) => {
      let a = []
      while (s-- > 0) {
        a.push(null)
      }
      return a
    })(len)
    let i = 0
    for (let index = 0; index < subs.length; index++) {
      let sub = subs[index]
      {
        if (sub.op === op) {
          /* arraycopy */ ;((srcPts, srcOff, dstPts, dstOff, size) => {
            if (srcPts !== dstPts || dstOff >= srcOff + size) {
              while (--size >= 0) {
                dstPts[dstOff++] = srcPts[srcOff++]
              }
            } else {
              let tmp = srcPts.slice(srcOff, srcOff + size)
              for (let i = 0; i < size; i++) {
                dstPts[dstOff++] = tmp[i]
              }
            }
          })(sub.subs, 0, newsubs, i, sub.subs.length)
          i += sub.subs.length
          this.reuse(sub)
        } else {
          newsubs[i++] = sub
        }
      }
    }
    let re = this.newRegexp(op)
    re.subs = newsubs
    if (op === Regexp.Op.ALTERNATE) {
      re.subs = this.factor(re.subs, re.flags)
      if (re.subs.length === 1) {
        const old = re
        re = re.subs[0]
        this.reuse(old)
      }
    }
    return re
  }
  factor(array, flags) {
    if (array.length < 2) {
      return array
    }
    let s = 0
    let lensub = array.length
    let lenout = 0
    let str = null
    let strlen = 0
    let strflags = 0
    let start = 0
    for (let i = 0; i <= lensub; i++) {
      {
        let istr = null
        let istrlen = 0
        let iflags = 0
        if (i < lensub) {
          let re = array[s + i]
          if (re.op === Regexp.Op.CONCAT && re.subs.length > 0) {
            re = re.subs[0]
          }
          if (re.op === Regexp.Op.LITERAL) {
            istr = re.runes
            istrlen = re.runes.length
            iflags = re.flags & RE2Flags.FOLD_CASE
          }
          if (iflags === strflags) {
            let same = 0
            while (same < strlen && same < istrlen && str[same] === istr[same]) {
              {
                same++
              }
            }

            if (same > 0) {
              strlen = same
              continue
            }
          }
        }
        if (i === start) {
        } else if (i === start + 1) {
          array[lenout++] = array[s + start]
        } else {
          const prefix = this.newRegexp(Regexp.Op.LITERAL)
          prefix.flags = strflags
          prefix.runes = Utils.subarray(str, 0, strlen)
          for (let j = start; j < i; j++) {
            array[s + j] = this.removeLeadingString(array[s + j], strlen)
          }
          const suffix = this.collapse(
            Parser.subarray(array, s + start, s + i),
            Regexp.Op.ALTERNATE
          )
          const re = this.newRegexp(Regexp.Op.CONCAT)
          re.subs = [prefix, suffix]
          array[lenout++] = re
        }
        start = i
        str = istr
        strlen = istrlen
        strflags = iflags
      }
    }
    lensub = lenout
    s = 0
    start = 0
    lenout = 0
    let first = null
    for (let i = 0; i <= lensub; i++) {
      {
        let ifirst = null
        if (i < lensub) {
          ifirst = Parser.leadingRegexp(array[s + i])
          if (
            first != null &&
            first.equals(ifirst) &&
            (Parser.isCharClass(first) ||
              (first.op === Regexp.Op.REPEAT &&
                first.min === first.max &&
                Parser.isCharClass(first.subs[0])))
          ) {
            continue
          }
        }
        if (i === start) {
        } else if (i === start + 1) {
          array[lenout++] = array[s + start]
        } else {
          const prefix = first
          for (let j = start; j < i; j++) {
            {
              const reuse = j !== start
              array[s + j] = this.removeLeadingRegexp(array[s + j], reuse)
            }
          }
          const suffix = this.collapse(
            Parser.subarray(array, s + start, s + i),
            Regexp.Op.ALTERNATE
          )
          const re = this.newRegexp(Regexp.Op.CONCAT)
          re.subs = [prefix, suffix]
          array[lenout++] = re
        }
        start = i
        first = ifirst
      }
    }
    lensub = lenout
    s = 0
    start = 0
    lenout = 0
    for (let i = 0; i <= lensub; i++) {
      {
        if (i < lensub && Parser.isCharClass(array[s + i])) {
          continue
        }
        if (i === start) {
        } else if (i === start + 1) {
          array[lenout++] = array[s + start]
        } else {
          let max = start
          for (let j = start + 1; j < i; j++) {
            {
              const subMax = array[s + max]
              const subJ = array[s + j]
              if (
                subMax.op < subJ.op ||
                (subMax.op === subJ.op &&
                  (subMax.runes != null ? subMax.runes.length : 0) <
                    (subJ.runes != null ? subJ.runes.length : 0))
              ) {
                max = j
              }
            }
          }
          const tmp = array[s + start]
          array[s + start] = array[s + max]
          array[s + max] = tmp
          for (let j = start + 1; j < i; j++) {
            {
              Parser.mergeCharClass(array[s + start], array[s + j])
              this.reuse(array[s + j])
            }
          }
          this.cleanAlt(array[s + start])
          array[lenout++] = array[s + start]
        }
        if (i < lensub) {
          array[lenout++] = array[s + i]
        }
        start = i + 1
      }
    }
    lensub = lenout
    s = 0
    start = 0
    lenout = 0
    for (let i = 0; i < lensub; ++i) {
      {
        if (
          i + 1 < lensub &&
          array[s + i].op === Regexp.Op.EMPTY_MATCH &&
          array[s + i + 1].op === Regexp.Op.EMPTY_MATCH
        ) {
          continue
        }
        array[lenout++] = array[s + i]
      }
    }
    lensub = lenout
    s = 0
    return Parser.subarray(array, s, lensub)
  }
  removeLeadingString(re, n) {
    if (re.op === Regexp.Op.CONCAT && re.subs.length > 0) {
      const sub = this.removeLeadingString(re.subs[0], n)
      re.subs[0] = sub
      if (sub.op === Regexp.Op.EMPTY_MATCH) {
        this.reuse(sub)
        switch (re.subs.length) {
          case 0:
          case 1:
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
            re.subs = Parser.subarray(re.subs, 1, re.subs.length)
            break
        }
      }
      return re
    }
    if (re.op === Regexp.Op.LITERAL) {
      re.runes = Utils.subarray(re.runes, n, re.runes.length)
      if (re.runes.length === 0) {
        re.op = Regexp.Op.EMPTY_MATCH
      }
    }
    return re
  }
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
  removeLeadingRegexp(re, reuse) {
    if (re.op === Regexp.Op.CONCAT && re.subs.length > 0) {
      if (reuse) {
        this.reuse(re.subs[0])
      }
      re.subs = Parser.subarray(re.subs, 1, re.subs.length)
      switch (re.subs.length) {
        case 0:
          re.op = Regexp.Op.EMPTY_MATCH
          re.subs = Regexp.emptySubs()
          break
        case 1:
          const old = re
          re = re.subs[0]
          this.reuse(old)
          break
      }
      return re
    }
    if (reuse) {
      this.reuse(re)
    }
    return this.newRegexp(Regexp.Op.EMPTY_MATCH)
  }
  static literalRegexp(s, flags) {
    const re = new Regexp(Regexp.Op.LITERAL)
    re.flags = flags
    re.runes = Utils.stringToRunes(s)
    return re
  }
  /**
   * Parse regular expression pattern {@code pattern} with mode flags {@code flags}.
   * @param {string} pattern
   * @param {number} flags
   * @return {Regexp}
   */
  static parse(pattern, flags) {
    return new Parser(pattern, flags).parseInternal()
  }
  parseInternal() {
    if ((this.flags & RE2Flags.LITERAL) !== 0) {
      return Parser.literalRegexp(this.wholeRegexp, this.flags)
    }
    let lastRepeatPos = -1
    let min = -1
    let max = -1
    const t = new StringIterator(this.wholeRegexp)
    while (t.more()) {
      {
        let repeatPos = -1
        bigswitch: switch (t.peek()) {
          default:
            this.literal(t.pop())
            break
          case 40 /* '(' */:
            if ((this.flags & RE2Flags.PERL_X) !== 0 && t.lookingAt('(?')) {
              this.parsePerlFlags(t)
              break
            }
            this.op(Regexp.Op.LEFT_PAREN).cap = ++this.numCap
            t.skip(1)
            break
          case 124 /* '|' */:
            this.parseVerticalBar()
            t.skip(1)
            break
          case 41 /* ')' */:
            this.parseRightParen()
            t.skip(1)
            break
          case 94 /* '^' */:
            if ((this.flags & RE2Flags.ONE_LINE) !== 0) {
              this.op(Regexp.Op.BEGIN_TEXT)
            } else {
              this.op(Regexp.Op.BEGIN_LINE)
            }
            t.skip(1)
            break
          case 36 /* '$' */:
            if ((this.flags & RE2Flags.ONE_LINE) !== 0) {
              this.op(Regexp.Op.END_TEXT).flags |= RE2Flags.WAS_DOLLAR
            } else {
              this.op(Regexp.Op.END_LINE)
            }
            t.skip(1)
            break
          case 46 /* '.' */:
            if ((this.flags & RE2Flags.DOT_NL) !== 0) {
              this.op(Regexp.Op.ANY_CHAR)
            } else {
              this.op(Regexp.Op.ANY_CHAR_NOT_NL)
            }
            t.skip(1)
            break
          case 91 /* '[' */:
            this.parseClass(t)
            break
          case 42 /* '*' */:
          case 43 /* '+' */:
          case 63 /* '?' */: {
            repeatPos = t.pos()
            let op = null
            switch (t.pop()) {
              case 42 /* '*' */:
                op = Regexp.Op.STAR
                break
              case 43 /* '+' */:
                op = Regexp.Op.PLUS
                break
              case 63 /* '?' */:
                op = Regexp.Op.QUEST
                break
            }
            this.repeat(op, min, max, repeatPos, t, lastRepeatPos)
            break
          }

          case 123 /* '{' */: {
            repeatPos = t.pos()
            const minMax = Parser.parseRepeat(t)
            if (minMax < 0) {
              t.rewindTo(repeatPos)
              this.literal(t.pop())
              break
            }
            min = minMax >> 16
            max = ((minMax & Unicode.MAX_BMP) << 16) >> 16
            this.repeat(Regexp.Op.REPEAT, min, max, repeatPos, t, lastRepeatPos)
            break
          }

          case 92 /* '\\' */: {
            const savedPos = t.pos()
            t.skip(1)
            if ((this.flags & RE2Flags.PERL_X) !== 0 && t.more()) {
              const c = t.pop()
              switch (c) {
                case 65 /* 'A' */:
                  this.op(Regexp.Op.BEGIN_TEXT)
                  break bigswitch
                case 98 /* 'b' */:
                  this.op(Regexp.Op.WORD_BOUNDARY)
                  break bigswitch
                case 66 /* 'B' */:
                  this.op(Regexp.Op.NO_WORD_BOUNDARY)
                  break bigswitch
                case 67 /* 'C' */:
                  throw new PatternSyntaxException(Parser.ERR_INVALID_ESCAPE, '\\C')
                case 81 /* 'Q' */: {
                  let lit = t.rest()
                  const i = lit.indexOf('\\E')
                  if (i >= 0) {
                    lit = lit.substring(0, i)
                  }
                  t.skipString(lit)
                  t.skipString('\\E')
                  for (let j = 0; j < lit.length; ) {
                    {
                      const codepoint = lit.codePointAt(j)
                      this.literal(codepoint)
                      j += Utils.charCount(codepoint)
                    }
                  }
                  break bigswitch
                }

                case 122 /* 'z' */:
                  this.op(Regexp.Op.END_TEXT)
                  break bigswitch
                default:
                  t.rewindTo(savedPos)
                  break
              }
            }
            const re = this.newRegexp(Regexp.Op.CHAR_CLASS)
            re.flags = this.flags
            if (t.lookingAt('\\p') || t.lookingAt('\\P')) {
              const cc = new CharClass()
              if (this.parseUnicodeClass(t, cc)) {
                re.runes = cc.toArray()
                this.push(re)
                break bigswitch
              }
            }
            const cc = new CharClass()
            if (this.parsePerlClassEscape(t, cc)) {
              re.runes = cc.toArray()
              this.push(re)
              break bigswitch
            }
            t.rewindTo(savedPos)
            this.reuse(re)
            this.literal(Parser.parseEscape(t))
            break
          }
        }
        lastRepeatPos = repeatPos
      }
    }

    this.concat()
    if (this.swapVerticalBar()) {
      this.pop()
    }
    this.alternate()
    const n = this.stack.__delegate.length
    if (n !== 1) {
      throw new PatternSyntaxException(Parser.ERR_MISSING_PAREN, this.wholeRegexp)
    }
    /* get */ this.stack.__delegate[0].namedGroups = this.namedGroups
    return /* get */ this.stack.__delegate[0]
  }
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
      throw new PatternSyntaxException(Parser.ERR_INVALID_REPEAT_SIZE, t.from(start))
    }
    return (min << 16) | (max & Unicode.MAX_BMP)
  }
  parsePerlFlags(t) {
    const startPos = t.pos()
    const s = t.rest()
    if (
      /* startsWith */ ((str, searchString, position = 0) =>
        str.substr(position, searchString.length) === searchString)(s, '(?P<')
    ) {
      const end = s.indexOf('>')
      if (end < 0) {
        throw new PatternSyntaxException(Parser.ERR_INVALID_NAMED_CAPTURE, s)
      }
      const name = s.substring(4, end)
      t.skipString(name)
      t.skip(5)
      if (!Parser.isValidCaptureName(name)) {
        throw new PatternSyntaxException(Parser.ERR_INVALID_NAMED_CAPTURE, s.substring(0, end))
      }
      const re = this.op(Regexp.Op.LEFT_PAREN)
      re.cap = ++this.numCap
      if (this.namedGroups[name]) {
        throw new PatternSyntaxException(Parser.ERR_DUPLICATE_NAMED_CAPTURE, name)
      }
      this.namedGroups[name] = this.numCap
      re.name = name
      return
    }
    t.skip(2)
    let flags = this.flags
    let sign = +1
    let sawFlag = false
    loop: while (t.more()) {
      {
        const c = t.pop()
        switch (c) {
          default:
            break loop
          case 105 /* 'i' */:
            flags |= RE2Flags.FOLD_CASE
            sawFlag = true
            break
          case 109 /* 'm' */:
            flags &= ~RE2Flags.ONE_LINE
            sawFlag = true
            break
          case 115 /* 's' */:
            flags |= RE2Flags.DOT_NL
            sawFlag = true
            break
          case 85 /* 'U' */:
            flags |= RE2Flags.NON_GREEDY
            sawFlag = true
            break
          case 45 /* '-' */:
            if (sign < 0) {
              break loop
            }
            sign = -1
            flags = ~flags
            sawFlag = false
            break
          case 58 /* ':' */:
          case 41 /* ')' */:
            if (sign < 0) {
              if (!sawFlag) {
                break loop
              }
              flags = ~flags
            }
            if (c == ':'.codePointAt(0)) {
              this.op(Regexp.Op.LEFT_PAREN)
            }
            this.flags = flags
            return
        }
      }
    }

    throw new PatternSyntaxException(Parser.ERR_INVALID_PERL_OP, t.from(startPos))
  }
  static isValidCaptureName(name) {
    if (/* isEmpty */ name.length === 0) {
      return false
    }
    for (let i = 0; i < name.length; ++i) {
      {
        const c = name.charAt(i)
        if (
          ((c) => (c.codePointAt == null ? c : c.codePointAt(0)))(c) != '_'.codePointAt(0) &&
          !Utils.isalnum(c.codePointAt(0))
        ) {
          return false
        }
      }
    }
    return true
  }
  static parseInt(t) {
    const start = t.pos()
    let c
    while (t.more() && (c = t.peek()) >= '0'.codePointAt(0) && c <= '9'.codePointAt(0)) {
      {
        t.skip(1)
      }
    }

    const n = t.from(start)
    if (
      /* isEmpty */ n.length === 0 ||
      (n.length > 1 &&
        ((c) => (c.codePointAt == null ? c : c.codePointAt(0)))(n.charAt(0)) == '0'.codePointAt(0))
    ) {
      return -1
    }
    if (n.length > 8) {
      return -2
    }
    return parseFloat(n, 10)
  }
  static isCharClass(re) {
    return (
      (re.op === Regexp.Op.LITERAL && re.runes.length === 1) ||
      re.op === Regexp.Op.CHAR_CLASS ||
      re.op === Regexp.Op.ANY_CHAR_NOT_NL ||
      re.op === Regexp.Op.ANY_CHAR
    )
  }
  static matchRune(re, r) {
    switch (re.op) {
      case Regexp.Op.LITERAL:
        return re.runes.length === 1 && re.runes[0] === r
      case Regexp.Op.CHAR_CLASS:
        for (let i = 0; i < re.runes.length; i += 2) {
          {
            if (re.runes[i] <= r && r <= re.runes[i + 1]) {
              return true
            }
          }
        }
        return false
      case Regexp.Op.ANY_CHAR_NOT_NL:
        return r != '\n'.codePointAt(0)
      case Regexp.Op.ANY_CHAR:
        return true
    }
    return false
  }
  parseVerticalBar() {
    this.concat()
    if (!this.swapVerticalBar()) {
      this.op(Regexp.Op.VERTICAL_BAR)
    }
  }
  static mergeCharClass(dst, src) {
    switch (dst.op) {
      case Regexp.Op.ANY_CHAR:
        break
      case Regexp.Op.ANY_CHAR_NOT_NL:
        if (Parser.matchRune(src, '\n'.codePointAt(0))) {
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
  swapVerticalBar() {
    const n = this.stack.__delegate.length
    if (
      n >= 3 &&
      /* get */ this.stack.__delegate[n - 2].op === Regexp.Op.VERTICAL_BAR &&
      Parser.isCharClass(/* get */ this.stack.__delegate[n - 1]) &&
      Parser.isCharClass(/* get */ this.stack.__delegate[n - 3])
    ) {
      let re1 = this.stack.__delegate[n - 1]
      let re3 = this.stack.__delegate[n - 3]
      if (re1.op > re3.op) {
        const tmp = re3
        re3 = re1
        re1 = tmp
        /* set */ this.stack.__delegate[n - 3] = re3
      }
      Parser.mergeCharClass(re3, re1)
      this.reuse(re1)
      this.pop()
      return true
    }
    if (n >= 2) {
      const re1 = this.stack.__delegate[n - 1]
      const re2 = this.stack.__delegate[n - 2]
      if (re2.op === Regexp.Op.VERTICAL_BAR) {
        if (n >= 3) {
          this.cleanAlt(/* get */ this.stack.__delegate[n - 3])
        }
        /* set */ this.stack.__delegate[n - 2] = re1
        /* set */ this.stack.__delegate[n - 1] = re2
        return true
      }
    }
    return false
  }
  parseRightParen() {
    this.concat()
    if (this.swapVerticalBar()) {
      this.pop()
    }
    this.alternate()
    const n = this.stack.__delegate.length
    if (n < 2) {
      throw new PatternSyntaxException(Parser.ERR_INTERNAL_ERROR, 'stack underflow')
    }
    const re1 = this.pop()
    const re2 = this.pop()
    if (re2.op !== Regexp.Op.LEFT_PAREN) {
      throw new PatternSyntaxException(Parser.ERR_MISSING_PAREN, this.wholeRegexp)
    }
    this.flags = re2.flags
    if (re2.cap === 0) {
      this.push(re1)
    } else {
      re2.op = Regexp.Op.CAPTURE
      re2.subs = [re1]
      this.push(re2)
    }
  }
  static parseEscape(t) {
    const startPos = t.pos()
    t.skip(1) // '\\'
    if (!t.more()) {
      throw new PatternSyntaxException(Parser.ERR_TRAILING_BACKSLASH)
    }
    let c = t.pop()
    bigswitch: switch (c) {
      case 49 /* '1' */:
      case 50 /* '2' */:
      case 51 /* '3' */:
      case 52 /* '4' */:
      case 53 /* '5' */:
      case 54 /* '6' */:
      case 55 /* '7' */:
        if (!t.more() || t.peek() < '0'.codePointAt(0) || t.peek() > '7'.codePointAt(0)) {
          break
        }
      case 48 /* '0' */:
        let r = c - '0'.codePointAt(0)
        for (let i = 1; i < 3; i++) {
          {
            if (!t.more() || t.peek() < '0'.codePointAt(0) || t.peek() > '7'.codePointAt(0)) {
              break
            }
            r = r * 8 + t.peek() - '0'.codePointAt(0)
            t.skip(1)
          }
        }
        return r
      case 120 /* 'x' */:
        if (!t.more()) {
          break
        }
        c = t.pop()
        if (c == '{'.codePointAt(0)) {
          let nhex = 0
          let r = 0
          for (;;) {
            if (!t.more()) {
              break bigswitch
            }
            c = t.pop()
            if (c === '}'.codePointAt(0)) {
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
      case 97 /* 'a' */:
        return 7
      case 102 /* 'f' */:
        return '\f'.codePointAt(0)
      case 110 /* 'n' */:
        return '\n'.codePointAt(0)
      case 114 /* 'r' */:
        return '\r'.codePointAt(0)
      case 116 /* 't' */:
        return '\t'.codePointAt(0)
      case 118 /* 'v' */:
        return 11
      default:
        if (!Utils.isalnum(c)) {
          return c
        }
        break
    }
    throw new PatternSyntaxException(Parser.ERR_INVALID_ESCAPE, t.from(startPos))
  }
  static parseClassChar(t, wholeClassPos) {
    if (!t.more()) {
      throw new PatternSyntaxException(Parser.ERR_MISSING_BRACKET, t.from(wholeClassPos))
    }
    if (t.lookingAt('\\')) {
      return Parser.parseEscape(t)
    }
    return t.pop()
  }
  parsePerlClassEscape(t, cc) {
    const beforePos = t.pos()
    if (
      (this.flags & RE2Flags.PERL_X) === 0 ||
      !t.more() ||
      t.pop() != '\\'.codePointAt(0) ||
      !t.more()
    ) {
      return false
    }
    t.pop()
    const p = t.from(beforePos)
    const g = PERL_GROUPS.has(p) ? PERL_GROUPS.get(p) : null
    if (g == null) {
      return false
    }
    cc.appendGroup(g, (this.flags & RE2Flags.FOLD_CASE) !== 0)
    return true
  }
  parseNamedClass(t, cc) {
    const cls = t.rest()
    const i = cls.indexOf(':]')
    if (i < 0) {
      return false
    }
    const name = cls.substring(0, i + 2)
    t.skipString(name)
    const g = POSIX_GROUPS.has(name) ? POSIX_GROUPS.get(name) : null
    if (g == null) {
      throw new PatternSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, name)
    }
    cc.appendGroup(g, (this.flags & RE2Flags.FOLD_CASE) !== 0)
    return true
  }
  static ANY_TABLE_$LI$() {
    if (Parser.ANY_TABLE == null) {
      Parser.ANY_TABLE = [[0, Unicode.MAX_RUNE, 1]]
    }
    return Parser.ANY_TABLE
  }
  static unicodeTable(name) {
    if (name === 'Any') {
      return Parser.Pair.of(Parser.ANY_TABLE_$LI$(), Parser.ANY_TABLE_$LI$())
    }
    if (UnicodeTables.CATEGORIES.has(name)) {
      return Parser.Pair.of(
        UnicodeTables.CATEGORIES.get(name),
        UnicodeTables.FOLD_CATEGORIES.get(name)
      )
    }
    if (UnicodeTables.SCRIPTS.has(name)) {
      return Parser.Pair.of(UnicodeTables.SCRIPTS.get(name), UnicodeTables.FOLD_SCRIPT.get(name))
    }
    return null
  }
  parseUnicodeClass(t, cc) {
    const startPos = t.pos()
    if (
      (this.flags & RE2Flags.UNICODE_GROUPS) === 0 ||
      (!t.lookingAt('\\p') && !t.lookingAt('\\P'))
    ) {
      return false
    }
    t.skip(1)
    let sign = +1
    let c = t.pop()
    if (c == 'P'.codePointAt(0)) {
      sign = -1
    }
    if (!t.more()) {
      t.rewindTo(startPos)
      throw new PatternSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.rest())
    }
    c = t.pop()
    let name
    if (c != '{'.codePointAt(0)) {
      name = Utils.runeToString(c)
    } else {
      const rest = t.rest()
      const end = rest.indexOf('}')
      if (end < 0) {
        t.rewindTo(startPos)
        throw new PatternSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.rest())
      }
      name = rest.substring(0, end)
      t.skipString(name)
      t.skip(1)
    }
    if (
      !(name.length === 0) &&
      ((c) => (c.codePointAt == null ? c : c.codePointAt(0)))(name.charAt(0)) == '^'.codePointAt(0)
    ) {
      sign = -sign
      name = name.substring(1)
    }
    const pair = Parser.unicodeTable(name)
    if (pair == null) {
      throw new PatternSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.from(startPos))
    }
    const tab = pair.first
    const fold = pair.second
    if ((this.flags & RE2Flags.FOLD_CASE) === 0 || fold == null) {
      cc.appendTableWithSign(tab, sign)
    } else {
      const tmp = new CharClass().appendTable(tab).appendTable(fold).cleanClass().toArray()
      cc.appendClassWithSign(tmp, sign)
    }
    return true
  }
  parseClass(t) {
    const startPos = t.pos()
    t.skip(1)
    const re = this.newRegexp(Regexp.Op.CHAR_CLASS)
    re.flags = this.flags
    const cc = new CharClass()
    let sign = +1
    if (t.more() && t.lookingAt('^')) {
      sign = -1
      t.skip(1)
      if ((this.flags & RE2Flags.CLASS_NL) === 0) {
        cc.appendRange('\n'.codePointAt(0), '\n'.codePointAt(0))
      }
    }
    let first = true
    while (!t.more() || t.peek() != ']'.codePointAt(0) || first) {
      {
        if (t.more() && t.lookingAt('-') && (this.flags & RE2Flags.PERL_X) === 0 && !first) {
          const s = t.rest()
          if (s == '-' || !s.startsWith('-]')) {
            t.rewindTo(startPos)
            throw new PatternSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.rest())
          }
        }
        first = false
        const beforePos = t.pos()
        if (t.lookingAt('[:')) {
          if (this.parseNamedClass(t, cc)) {
            continue
          }
          t.rewindTo(beforePos)
        }
        if (this.parseUnicodeClass(t, cc)) {
          continue
        }
        if (this.parsePerlClassEscape(t, cc)) {
          continue
        }
        t.rewindTo(beforePos)
        const lo = Parser.parseClassChar(t, startPos)
        let hi = lo
        if (t.more() && t.lookingAt('-')) {
          t.skip(1)
          if (t.more() && t.lookingAt(']')) {
            t.skip(-1)
          } else {
            hi = Parser.parseClassChar(t, startPos)
            if (hi < lo) {
              throw new PatternSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.from(beforePos))
            }
          }
        }
        if ((this.flags & RE2Flags.FOLD_CASE) === 0) {
          cc.appendRange(lo, hi)
        } else {
          cc.appendFoldedRange(lo, hi)
        }
      }
    }

    t.skip(1)
    cc.cleanClass()
    if (sign < 0) {
      cc.negateClass()
    }
    re.runes = cc.toArray()
    this.push(re)
  }
  static subarray(array, start, end) {
    const r = ((s) => {
      let a = []
      while (s-- > 0) {
        a.push(null)
      }
      return a
    })(end - start)
    for (let i = start; i < end; ++i) {
      r[i - start] = array[i]
    }
    return r
  }
  static concatRunes(x, y) {
    const z = ((s) => {
      let a = []
      while (s-- > 0) {
        a.push(0)
      }
      return a
    })(x.length + y.length)
    /* arraycopy */ ;((srcPts, srcOff, dstPts, dstOff, size) => {
      if (srcPts !== dstPts || dstOff >= srcOff + size) {
        while (--size >= 0) {
          dstPts[dstOff++] = srcPts[srcOff++]
        }
      } else {
        let tmp = srcPts.slice(srcOff, srcOff + size)
        for (let i = 0; i < size; i++) {
          dstPts[dstOff++] = tmp[i]
        }
      }
    })(x, 0, z, 0, x.length)
    /* arraycopy */
    ;((srcPts, srcOff, dstPts, dstOff, size) => {
      if (srcPts !== dstPts || dstOff >= srcOff + size) {
        while (--size >= 0) {
          dstPts[dstOff++] = srcPts[srcOff++]
        }
      } else {
        let tmp = srcPts.slice(srcOff, srcOff + size)
        for (let i = 0; i < size; i++) {
          dstPts[dstOff++] = tmp[i]
        }
      }
    })(y, 0, z, x.length, y.length)
    return z
  }
}

Parser['__class'] = 'quickstart.Parser'
;(function (Parser) {
  class Stack {
    /**
     *
     * @param {number} fromIndex
     * @param {number} toIndex
     */
    removeRange(fromIndex, toIndex) {
      return this.__delegate.splice(fromIndex, toIndex - fromIndex)
    }
    constructor() {}
  }
  Parser.Stack = Stack
  Stack['__class'] = 'quickstart.Parser.Stack'
  class Pair {
    constructor(first, second) {
      if (this.first === undefined) {
        this.first = null
      }
      if (this.second === undefined) {
        this.second = null
      }
      this.first = first
      this.second = second
    }
    static of(first, second) {
      return new Parser.Pair(first, second)
    }
  }
  Parser.Pair = Pair
  Pair['__class'] = 'quickstart.Parser.Pair'
})(Parser || (Parser = {}))

export { Parser }
