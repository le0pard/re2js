import { CharClass } from './CharClass'
import { CharGroup } from './CharGroup'
import { Regexp } from './Regexp'
import { RE2Flags } from './RE2Flags'
import { Unicode } from './Unicode'
import { UnicodeTables } from './UnicodeTables'
import { Utils } from './Utils'

class PatternSyntaxException extends Error {
  constructor(message, position) {
    super(message)
    this.name = 'PatternSyntaxException'
    this.position = position
  }
}

class Pair {
  constructor(first, second) {
    this.first = first
    this.second = second
  }

  static of(first, second) {
    return new Pair(first, second)
  }
}

class StringIterator {
  // a stream of UTF-16 codes
  str
  // current position in UTF-16 string
  pos = 0

  constructor(str) {
    this.str = str
  }

  // Returns the cursor position.  Do not interpret the result!
  pos() {
    return this.pos
  }

  // Resets the cursor position to a previous value returned by pos().
  rewindTo(pos) {
    this.pos = pos
  }

  // Returns true unless the stream is exhausted.
  more() {
    return this.pos < this.str.length
  }

  // Returns the rune at the cursor position.
  // Precondition: |more()|.
  peek() {
    return this.str.codePointAt(this.pos)
  }

  // Advances the cursor by |n| positions, which must be ASCII runes.
  skip(n) {
    this.pos += n
  }

  // Advances the cursor by the number of cursor positions in |s|.
  skipString(s) {
    this.pos += s.length
  }

  // Returns the rune at the cursor position, and advances the cursor
  // past it.  Precondition: |more()|.
  pop() {
    const r = this.str.codePointAt(this.pos)
    this.pos += [...String.fromCodePoint(r)].length
    return r
  }

  // Equivalent to both peek() == c but more efficient because we
  // don't support surrogates.  Precondition: |more()|.
  lookingAt(c) {
    return this.str.charAt(this.pos) === c
  }

  // Equivalent to rest().startsWith(s).
  lookingAtString(s) {
    return this.rest().startsWith(s)
  }

  // Returns the rest of the pattern as a Java UTF-16 string.
  rest() {
    return this.str.substring(this.pos)
  }

  // Returns the substring from |beforePos| to the current position.
  // |beforePos| must have been previously returned by |pos()|.
  from(beforePos) {
    return this.str.substring(beforePos, this.pos)
  }

  // toString
  toString() {
    return this.rest()
  }
}

class Parser {
  // Static error messages
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
    this.wholeRegexp = wholeRegexp
    this.flags = flags
    this.stack = [] // Stack of parsed expressions.
    this.free = null // Reusable Regexp instance.
    this.numCap = 0 // number of capturing groups seen
    this.namedGroups = {} // Map for named groups.
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
    let n = this.stack.length
    let i = n
    while (i > 0 && !Regexp.isPseudo(this.stack[i - 1].op)) {
      i--
    }
    let r = this.stack.slice(i, n)
    this.stack.splice(i, n - i)
    return r
  }

  push(re) {
    if (re.op === Regexp.Op.CHAR_CLASS && re.runes.length === 2 && re.runes[0] === re.runes[1]) {
      // Collapse range [x-x] -> single rune x.
      if (this.maybeConcat(re.runes[0], this.flags & ~RE2Flags.FOLD_CASE)) {
        return null
      }
      re.op = Regexp.Op.LITERAL
      re.runes = [re.runes[0]]
      re.flags = this.flags & ~RE2Flags.FOLD_CASE
    } else if ((re.op === Regexp.Op.CHAR_CLASS
      && re.runes.length === 4
      && re.runes[0] === re.runes[1]
      && re.runes[2] === re.runes[3]
      && Unicode.simpleFold(re.runes[0]) === re.runes[2]
      && Unicode.simpleFold(re.runes[2]) === re.runes[0])
      || (re.op === Regexp.Op.CHAR_CLASS
        && re.runes.length === 2
        && re.runes[0] + 1 === re.runes[1]
        && Unicode.simpleFold(re.runes[0]) === re.runes[1]
        && Unicode.simpleFold(re.runes[1]) === re.runes[0])) {
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

  maybeConcat(r, flags) {
    let n = this.stack.length
    if (n < 2) {
      return false
    }
    let re1 = this.stack[n - 1]
    let re2 = this.stack[n - 2]
    if (re1.op !== Regexp.Op.LITERAL
      || re2.op !== Regexp.Op.LITERAL
      || (re1.flags & RE2Flags.FOLD_CASE) !== (re2.flags & RE2Flags.FOLD_CASE)) {
      return false
    }

    // Push re1 into re2.
    re2.runes = re2.runes.concat(re1.runes)

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

  newLiteral(r, flags) {
    let re = this.newRegexp(Regexp.Op.LITERAL)
    re.flags = flags
    if ((flags & RE2Flags.FOLD_CASE) !== 0) {
      r = this.minFoldRune(r)
    }
    re.runes = [r]
    return re
  }

  minFoldRune(r) {
    if (r < Unicode.MIN_FOLD || r > Unicode.MAX_FOLD) {
      return r
    }
    let min = r
    let r0 = r
    for (r = Unicode.simpleFold(r); r !== r0; r = Unicode.simpleFold(r)) {
      if (min > r) {
        min = r
      }
    }
    return min
  }

  literal(r) {
    this.push(this.newLiteral(r, this.flags))
  }

  op(op) {
    let re = this.newRegexp(op)
    re.flags = this.flags
    return this.push(re)
  }

  repeat(op, min, max, beforePos, t, lastRepeatPos) {
    let flags = this.flags
    if ((flags & RE2Flags.PERL_X) !== 0) {
      if (t.more() && t.lookingAt('?')) {
        t.skip(1) // '?'
        flags ^= RE2Flags.NON_GREEDY
      }
      if (lastRepeatPos !== -1) {
        throw new Error(Parser.ERR_INVALID_REPEAT_OP + ' at position: ' + t.from(lastRepeatPos))
      }
    }
    let n = this.stack.length
    if (n === 0) {
      throw new Error(Parser.ERR_MISSING_REPEAT_ARGUMENT + ' at position: ' + t.from(beforePos))
    }
    let sub = this.stack[n - 1]
    if (Regexp.isPseudo(sub.op)) {
      throw new Error(Parser.ERR_MISSING_REPEAT_ARGUMENT + ' at position: ' + t.from(beforePos))
    }
    let re = this.newRegexp(op)
    re.min = min
    re.max = max
    re.flags = flags
    re.subs = [sub]
    this.stack[n - 1] = re
  }

  concat() {
    this.maybeConcat(-1, 0)

    // Scan down to find pseudo-operator | or (.
    let subs = this.popToPseudo()

    // Empty concatenation is special case.
    if (subs.length === 0) {
      return this.push(this.newRegexp(Regexp.Op.EMPTY_MATCH))
    }

    return this.push(this.collapse(subs, Regexp.Op.CONCAT))
  }

  alternate() {
    let subs = this.popToPseudo()

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
        re.runes.length === 4
        && re.runes[0] === 0
        && re.runes[1] === '\n'.charCodeAt(0) - 1
        && re.runes[2] === '\n'.charCodeAt(0) + 1
        && re.runes[3] === Unicode.MAX_RUNE) {
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
    for (let sub of subs) {
      len += (sub.op === op) ? sub.subs.length : 1
    }

    let newsubs = new Array(len)
    let i = 0
    for (let sub of subs) {
      if (sub.op === op) {
        Array.prototype.splice.apply(newsubs, [i, sub.subs.length].concat(sub.subs))
        i += sub.subs.length
        this.reuse(sub)
      } else {
        newsubs[i++] = sub
      }
    }

    let re = this.newRegexp(op)
    re.subs = newsubs

    if (op === Regexp.Op.ALTERNATE) {
      re.subs = this.factor(re.subs, re.flags)
      if (re.subs.length === 1) {
        let old = re
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
            while ((same < strlen && same < istrlen && str[same] === istr[same])) {
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
          prefix.runes = Utils.subarray$int_A$int$int(str, 0, strlen)
          for (let j = start; j < i; j++) {
            {
              array[s + j] = this.removeLeadingString(array[s + j], strlen)
            }
          }
          const suffix = this.collapse(Parser.subarray(array, s + start, s + i), Regexp.Op.ALTERNATE)
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
          if (first !== null && first.equals(ifirst) && (Parser.isCharClass(first) || (first.op === Regexp.Op.REPEAT && first.min === first.max && Parser.isCharClass(first.subs[0])))) {
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
          const suffix = this.collapse(Parser.subarray(array, s + start, s + i), Regexp.Op.ALTERNATE)
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
              if (/* Enum.ordinal */Object.values(Regexp.Op).indexOf(Regexp.Op[subMax.op]) < /* Enum.ordinal */ Object.values(Regexp.Op).indexOf(Regexp.Op[subJ.op]) || (subMax.op === subJ.op && (subMax.runes !== null ? subMax.runes.length : 0) < (subJ.runes !== null ? subJ.runes.length : 0))) {
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
        if (i + 1 < lensub && array[s + i].op === Regexp.Op.EMPTY_MATCH && array[s + i + 1].op === Regexp.Op.EMPTY_MATCH) {
          continue
        }
        array[lenout++] = array[s + i]
      }
    }
    lensub = lenout
    s = 0
    return Parser.subarray(array, s, lensub)
  }

  // removeLeadingString removes the first n leading runes
  // from the beginning of re. It returns the replacement for re.
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
          case 2:
            {
              const old = re
              re = re.subs[1]
              this.reuse(old)
              break
            }
          default:
            re.subs = re.subs.slice(1)
            break
        }
      }
      return re
    }

    if (re.op === Regexp.Op.LITERAL) {
      re.runes = re.runes.slice(n)
      if (re.runes.length === 0) {
        re.op = Regexp.Op.EMPTY_MATCH
      }
    }
    return re
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

  // removeLeadingRegexp removes the leading regexp in re.
  // It returns the replacement for re.
  // If reuse is true, it passes the removed regexp (if no longer needed) to
  // reuse.
  removeLeadingRegexp(re, reuse) {
    if (re.op === Regexp.Op.CONCAT && re.subs.length > 0) {
      if (reuse) {
        this.reuse(re.subs[0])
      }
      re.subs = re.subs.slice(1)
      switch (re.subs.length) {
        case 0:
          re.op = Regexp.Op.EMPTY_MATCH
          re.subs = Regexp.EMPTY_SUBS
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

  static parse(pattern, flags) {
    return new Parser(pattern, flags).parseInternal()
  }

  parseInternal() {
    if ((this.flags & RE2Flags.LITERAL) !== 0) {
      // Trivial parser for literal string.
      return Parser.literalRegexp(this.wholeRegexp, this.flags)
    }

    // Otherwise, must do real work.
    let lastRepeatPos = -1, min = -1, max = -1
    let t = new StringIterator(this.wholeRegexp)
    while (t.more()) {
      let repeatPos = -1
      switch (t.peek()) {
        default:
          this.literal(t.pop())
          break

        case '(':
          if ((this.flags & RE2Flags.PERL_X) !== 0 && t.lookingAt('(?')) {
            // Flag changes and non-capturing groups.
            this.parsePerlFlags(t)
            break
          }
          this.op(Regexp.Op.LEFT_PAREN).cap = ++this.numCap
          t.skip(1) // '('
          break

        case '|':
          this.parseVerticalBar()
          t.skip(1) // '|'
          break

        case ')':
          this.parseRightParen()
          t.skip(1) // ')'
          break

        case '^':
          if ((this.flags & RE2Flags.ONE_LINE) !== 0) {
            this.op(Regexp.Op.BEGIN_TEXT)
          } else {
            this.op(Regexp.Op.BEGIN_LINE)
          }
          t.skip(1) // '^'
          break

        case '$':
          if ((this.flags & RE2Flags.ONE_LINE) !== 0) {
            this.op(Regexp.Op.END_TEXT).flags |= RE2Flags.WAS_DOLLAR
          } else {
            this.op(Regexp.Op.END_LINE)
          }
          t.skip(1) // '$'
          break

        case '.':
          if ((this.flags & RE2Flags.DOT_NL) !== 0) {
            this.op(Regexp.Op.ANY_CHAR)
          } else {
            this.op(Regexp.Op.ANY_CHAR_NOT_NL)
          }
          t.skip(1) // '.'
          break

        case '[':
          this.parseClass(t)
          break

        case '*':
        case '+':
        case '?':
          repeatPos = t.pos()
          let op = null
          switch (t.pop()) {
            case '*':
              op = Regexp.Op.STAR
              break
            case '+':
              op = Regexp.Op.PLUS
              break
            case '?':
              op = Regexp.Op.QUEST
              break
          }
          this.repeat(op, min, max, repeatPos, t, lastRepeatPos)
          break

        case '{':
          repeatPos = t.pos()
          let minMax = this.parseRepeat(t)
          if (minMax < 0) {
            t.rewindTo(repeatPos)
            this.literal(t.pop()) // '{'
            break
          }
          min = minMax >> 16
          max = minMax & 0xffff // sign extend
          this.repeat(Regexp.Op.REPEAT, min, max, repeatPos, t, lastRepeatPos)
          break

        case '\\':
          {
            let savedPos = t.pos()
            t.skip(1) // '\\'
            if ((this.flags & RE2Flags.PERL_X) !== 0 && t.more()) {
              let c = t.pop()
              switch (c) {
                case 'A':
                  this.op(Regexp.Op.BEGIN_TEXT)
                  break
                case 'b':
                  this.op(Regexp.Op.WORD_BOUNDARY)
                  break
                case 'B':
                  this.op(Regexp.Op.NO_WORD_BOUNDARY)
                  break
                case 'C':
                  // any byte; not supported
                  throw new Error('Invalid escape: \\C')
                case 'Q':
                  // \Q ... \E: the ... is always literals
                  let lit = t.rest()
                  let i = lit.indexOf('\\E')
                  if (i >= 0) {
                    lit = lit.substring(0, i)
                  }
                  t.skipString(lit)
                  t.skipString('\\E')
                  for (let j = 0; j < lit.length;) {
                    let codepoint = lit.codePointAt(j)
                    this.literal(codepoint)
                    j += [...lit][j].length // get the length of the UTF-16 encoding
                  }
                  break
                case 'z':
                  this.op(Regexp.Op.END_TEXT)
                  break
                default:
                  t.rewindTo(savedPos)
                  break
              }
            }

            let re = new Regexp(Regexp.Op.CHAR_CLASS)
            re.flags = this.flags

            // Look for Unicode character group like \p{Han}
            if (t.lookingAt('\\p') || t.lookingAt('\\P')) {
              let cc = new CharClass()
              if (this.parseUnicodeClass(t, cc)) {
                re.runes = cc.toArray()
                this.push(re)
                break
              }
            }

            // Perl character class escape.
            let cc = new CharClass()
            if (this.parsePerlClassEscape(t, cc)) {
              re.runes = cc.toArray()
              this.push(re)
              break
            }

            t.rewindTo(savedPos)
            this.reuse(re)

            // Ordinary single-character escape.
            this.literal(this.parseEscape(t))
            break
          }
      }
      lastRepeatPos = repeatPos
    }

    this.concat()
    if (this.swapVerticalBar()) {
      this.pop() // pop vertical bar
    }
    this.alternate()

    let n = this.stack.length
    if (n !== 1) {
      throw new Error(Parser.ERR_MISSING_PAREN + ' in ' + this.wholeRegexp)
    }
    this.stack[0].namedGroups = this.namedGroups
    return this.stack[0]
  }

  static parseRepeat(t) {
    let start = t.pos()
    if (!t.more() || !t.lookingAt('{')) {
      return -1
    }
    t.skip(1) // '{'
    let min = parseInt(t.rest(), 10) // (can be -2)
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
      t.skip(1) // ','
      if (!t.more()) {
        return -1
      }
      if (t.lookingAt('}')) {
        max = -1
      } else if ((max = parseInt(t.rest(), 10)) === -1) { // (can be -2)
        return -1
      }
    }
    if (!t.more() || !t.lookingAt('}')) {
      return -1
    }
    t.skip(1) // '}'
    if (min < 0 || min > 1000 || max === -2 || max > 1000 || (max >= 0 && min > max)) {
      // Numbers were negative or too big, or max is present and min > max.
      throw new Error(`Invalid repeat size: ${t.from(start)}`)
    }
    return (min << 16) | (max & 0xffff) // success
  }

  static parsePerlFlags(t) {
    let startPos = t.pos()

    let s = t.rest()
    if (s.startsWith('(?P<')) {
      let end = s.indexOf('>')
      if (end < 0) {
        throw new Error(`Invalid named capture: ${s}`)
      }
      let name = s.substring(4, end) // "name"
      t.skipString(name)
      t.skip(5) // "(?P<>"
      if (!this.isValidCaptureName(name)) {
        throw new Error(`Invalid named capture: ${s.substring(0, end)}`) // "(?P<name>"
      }
      let re = this.op(Regexp.Op.LEFT_PAREN)
      re.cap = ++this.numCap
      if (this.namedGroups.set(name, this.numCap)) {
        throw new Error(`Duplicate named capture: ${name}`)
      }
      re.name = name
      return
    }

    t.skip(2) // "(?"
    let flags = this.flags
    let sign = +1
    let sawFlag = false
    while (t.more()) {
      let c = t.pop()
      switch (c) {
        default:
          break

        case 'i':
          flags |= RE2Flags.FOLD_CASE
          sawFlag = true
          break
        case 'm':
          flags &= ~RE2Flags.ONE_LINE
          sawFlag = true
          break
        case 's':
          flags |= RE2Flags.DOT_NL
          sawFlag = true
          break
        case 'U':
          flags |= RE2Flags.NON_GREEDY
          sawFlag = true
          break

        case '-':
          if (sign < 0) {
            break
          }
          sign = -1
          flags = ~flags
          sawFlag = false
          break

        case ':':
        case ')':
          if (sign < 0) {
            if (!sawFlag) {
              break
            }
            flags = ~flags
          }
          if (c === ':') {
            this.op(Regexp.Op.LEFT_PAREN)
          }
          this.flags = flags
          return
      }
    }

    throw new Error(`Invalid Perl operation: ${t.from(startPos)}`)
  }

  static isValidCaptureName(name) {
    if (name.length === 0) {
      return false
    }
    for (let i = 0; i < name.length; ++i) {
      let c = name.charAt(i)
      if (c !== '_' && !Utils.isAlnum(c)) {
        return false
      }
    }
    return true
  }

  // parseInt parses a nonnegative decimal integer.
  // -1 => bad format.  -2 => format ok, but integer overflow.
  static parseInt(t) {
    let start = t.pos()
    let c
    while (t.more() && (c = t.peek()) >= '0' && c <= '9') {
      t.skip(1) // digit
    }
    let n = t.from(start)
    if (n.length === 0 || (n.length > 1 && n.charAt(0) === '0')) { // disallow leading zeros
      return -1 // bad format
    }
    if (n.length > 8) {
      return -2 // overflow
    }
    return parseInt(n, 10) // can't fail
  }

  // can this be represented as a character class?
  // single-rune literal string, char class, ., and .|\n.
  static isCharClass(re) {
    return ((re.op === Regexp.Op.LITERAL && re.runes.length === 1)
      || re.op === Regexp.Op.CHAR_CLASS
      || re.op === Regexp.Op.ANY_CHAR_NOT_NL
      || re.op === Regexp.Op.ANY_CHAR)
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
        return r !== '\n'
      case Regexp.Op.ANY_CHAR:
        return true
    }
    return false
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

  // mergeCharClass makes dst = dst|src.
  // The caller must ensure that dst.Op >= src.Op,
  // to reduce the amount of copying.
  static mergeCharClass(dst, src) {
    switch (dst.op) {
      case Regexp.Op.ANY_CHAR:
        // src doesn't add anything.
        break
      case Regexp.Op.ANY_CHAR_NOT_NL:
        // src might add \n
        if (this.matchRune(src, '\n')) {
          dst.op = Regexp.Op.ANY_CHAR
        }
        break
      case Regexp.Op.CHAR_CLASS:
        // src is simpler, so either literal or char class
        if (src.op === Regexp.Op.LITERAL) {
          dst.runes = new CharClass(dst.runes).appendLiteral(src.runes[0], src.flags).toArray()
        } else {
          dst.runes = new CharClass(dst.runes).appendClass(src.runes).toArray()
        }
        break
      case Regexp.Op.LITERAL:
        // both literal
        if (src.runes[0] === dst.runes[0] && src.flags === dst.flags) {
          break
        }
        dst.op = Regexp.Op.CHAR_CLASS
        dst.runes =
          new CharClass()
            .appendLiteral(dst.runes[0], dst.flags)
            .appendLiteral(src.runes[0], src.flags)
            .toArray()
        break
    }
  }

  // If the top of the stack is an element followed by an opVerticalBar
  // swapVerticalBar swaps the two and returns true.
  // Otherwise it returns false.
  swapVerticalBar() {
    // If above and below vertical bar are literal or char class,
    // can merge into a single char class.
    let n = this.stack.length
    if (n >= 3
      && this.stack[n - 2].op === Regexp.Op.VERTICAL_BAR
      && this.isCharClass(this.stack[n - 1])
      && this.isCharClass(this.stack[n - 3])) {
      let re1 = this.stack[n - 1]
      let re3 = this.stack[n - 3]
      // Make re3 the more complex of the two.
      if (re1.op > re3.op) {
        let tmp = re3
        re3 = re1
        re1 = tmp
        this.stack[n - 3] = re3
      }
      this.mergeCharClass(re3, re1)
      this.reuse(re1)
      this.stack.pop()
      return true
    }

    if (n >= 2) {
      let re1 = this.stack[n - 1]
      let re2 = this.stack[n - 2]
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
      this.stack.pop() // pop vertical bar
    }
    this.alternate()

    let n = this.stack.length
    if (n < 2) {
      throw new Error('ERR_INTERNAL_ERROR: stack underflow')
    }
    let re1 = this.stack.pop()
    let re2 = this.stack.pop()
    if (re2.op !== Regexp.Op.LEFT_PAREN) {
      throw new Error('ERR_MISSING_PAREN: ' + this.wholeRegexp)
    }
    // Restore flags at time of paren.
    this.flags = re2.flags
    if (re2.cap === 0) {
      // Just for grouping.
      this.stack.push(re1)
    } else {
      re2.op = Regexp.Op.CAPTURE
      re2.subs = [re1]
      this.stack.push(re2)
    }
  }

  // parseEscape parses an escape sequence at the beginning of s
  // and returns the rune.
  // Pre: t at '\\'.  Post: after escape.
  static parseEscape(t) {
    let startPos = t.pos
    t.skip(1) // '\\'
    if (!t.more()) {
      throw new Error('ERR_TRAILING_BACKSLASH')
    }
    let c = t.pop()
    bigswitch:
    switch (c) {
      default:
        if (!Utils.isalnum(c)) {
          // Escaped non-word characters are always themselves.
          // PCRE is not quite so rigorous: it accepts things like
          // \q, but we don't.  We once rejected \_, but too many
          // programs and people insist on using it, so allow \_.
          return c
        }
        break

      // Octal escapes.
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
        // Single non-zero digit is a backreference; not supported
        if (!t.more() || t.peek() < '0' || t.peek() > '7') {
          break
        }
      /* fallthrough */
      case '0':
        // Consume up to three octal digits; already have one.
        let r = c - '0'
        for (let i = 1; i < 3; i++) {
          if (!t.more() || t.peek() < '0' || t.peek() > '7') {
            break
          }
          r = r * 8 + t.peek() - '0'
          t.skip(1) // digit
        }
        return r

      // Hexadecimal escapes.
      case 'x':
        if (!t.more()) {
          break
        }
        c = t.pop()
        if (c === '{') {
          // Any number of digits in braces.
          // Perl accepts any text at all; it ignores all text
          // after the first non-hex digit.  We require only hex digits,
          // and at least one.
          let nhex = 0
          r = 0
          for (; ;) {
            if (!t.more()) {
              break bigswitch
            }
            c = t.pop()
            if (c === '}') {
              break
            }
            let v = Utils.unhex(c)
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

        // Easy case: two hex digits.
        let x = Utils.unhex(c)
        if (!t.more()) {
          break
        }
        c = t.pop()
        let y = Utils.unhex(c)
        if (x < 0 || y < 0) {
          break
        }
        return x * 16 + y

      // C escapes.  There is no case 'b', to avoid misparsing
      // the Perl word-boundary \b as the C backspace \b
      // when in POSIX mode.  In Perl, /\b/ means word-boundary
      // but /[\b]/ means backspace.  We don't support that.
      // If you want a backspace, embed a literal backspace
      // character or use \x08.
      case 'a':
        return 7 // No \a in JavaScript
      case 'f':
        return '\f'.charCodeAt(0)
      case 'n':
        return '\n'.charCodeAt(0)
      case 'r':
        return '\r'.charCodeAt(0)
      case 't':
        return '\t'.charCodeAt(0)
      case 'v':
        return 11 // No \v in JavaScript
    }
    throw new Error('ERR_INVALID_ESCAPE: ' + t.from(startPos))
  }

  // parseClassChar parses a character class character and returns it.
  // wholeClassPos is the position of the start of the entire class "[...".
  // Pre: t at class char; Post: t after it.
  static parseClassChar(t, wholeClassPos) {
    if (!t.more()) {
      throw new Error('ERR_MISSING_BRACKET: ' + t.from(wholeClassPos))
    }

    // Allow regular escape sequences even though
    // many need not be escaped in this context.
    if (t.lookingAt('\\')) {
      return this.parseEscape(t)
    }

    return t.pop()
  }

  parsePerlClassEscape(t, cc) {
    let beforePos = t.pos
    if ((this.flags & RE2Flags.PERL_X) === 0
      || !t.more()
      || t.pop() !== '\\'
      || // consume '\\'
      !t.more()) {
      return false
    }
    t.pop() // e.g. advance past 'd' in "\\d"
    let g = CharGroup.PERL_GROUPS.get(t.from(beforePos))
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
  // On failure (no class of than name), throws Error.
  // On misparse, returns false; t.pos is undefined.
  parseNamedClass(t, cc) {
    // (Go precondition check deleted.)
    let cls = t.rest()
    let i = cls.indexOf(':]')
    if (i < 0) {
      return false
    }
    let name = cls.substring(0, i + 2) // "[:alnum:]"
    t.skipString(name)
    let g = CharGroup.POSIX_GROUPS.get(name)
    if (g === null) {
      throw new Error('ERR_INVALID_CHAR_RANGE: ' + name)
    }
    cc.appendGroup(g, (this.flags & RE2Flags.FOLD_CASE) !== 0)
    return true
  }

  // RangeTables are represented as int[][], a list of triples (start, end,
  // stride).
  static ANY_TABLE = [
    [0, Unicode.MAX_RUNE, 1]
  ]

  // Returns null if |name| does not identify a Unicode character range.
  static unicodeTable(name) {
    // Special case: "Any" means any.
    if (name === 'Any') {
      return Pair.of(Parser.ANY_TABLE, Parser.ANY_TABLE)
    }
    let table = UnicodeTables.CATEGORIES.get(name)
    if (table !== undefined) {
      return Pair.of(table, UnicodeTables.FOLD_CATEGORIES.get(name))
    }
    table = UnicodeTables.SCRIPTS.get(name)
    if (table !== undefined) {
      return Pair.of(table, UnicodeTables.FOLD_SCRIPT.get(name))
    }
    return null
  }

  parseUnicodeClass(t, cc) {
    const startPos = t.pos()
    if ((this.flags & RE2Flags.UNICODE_GROUPS) === 0 || (!t.lookingAt('\\p') && !t.lookingAt('\\P'))) {
      return false
    }
    t.skip(1) // '\\'
    // Committed to parse or throw exception.
    let sign = +1
    let c = t.pop() // 'p' or 'P'
    if (c === 'P') {
      sign = -1
    }
    if (!t.more()) {
      t.rewindTo(startPos)
      throw new PatternSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.rest())
    }
    c = t.pop()
    let name
    if (c !== '{') {
      // Single-letter name.
      name = Utils.runeToString(c)
    } else {
      // Name is in braces.
      let rest = t.rest()
      const end = rest.indexOf('}')
      if (end < 0) {
        t.rewindTo(startPos)
        throw new PatternSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.rest())
      }
      name = rest.substring(0, end) // e.g. "Han"
      t.skipString(name)
      t.skip(1) // '}'
    }

    // Group can have leading negation too.
    //  \p{^Han} == \P{Han}, \P{^Han} == \p{Han}.
    if (!name.isEmpty() && name.charAt(0) === '^') {
      sign = -sign
      name = name.substring(1)
    }

    let pair = this.unicodeTable(name)
    if (pair === null) {
      throw new PatternSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.from(startPos))
    }
    let tab = pair.first
    let fold = pair.second // fold-equivalent table

    // Variation of CharClass.appendGroup() for tables.
    if ((this.flags & RE2Flags.FOLD_CASE) === 0 || fold === null) {
      cc.appendTableWithSign(tab, sign)
    } else {
      // Merge and clean tab and fold in a temporary buffer.
      let tmp = new CharClass().appendTable(tab).appendTable(fold).cleanClass().toArray()
      cc.appendClassWithSign(tmp, sign)
    }
    return true
  }

  parseClass(t) {
    const startPos = t.pos()
    t.skip(1) // '['
    let re = new Regexp(Regexp.Op.CHAR_CLASS)
    re.flags = this.flags
    let cc = new CharClass()

    let sign = +1
    if (t.more() && t.lookingAt('^')) {
      sign = -1
      t.skip(1) // '^'

      // If character class does not match \n, add it here,
      // so that negation later will do the right thing.
      if ((this.flags & RE2Flags.CLASS_NL) === 0) {
        cc.appendRange('\n', '\n')
      }
    }

    let first = true // ']' and '-' are okay as first char in class
    while (!t.more() || t.peek() !== ']' || first) {
      // POSIX: - is only okay unescaped as first or last in class.
      // Perl: - is okay anywhere.
      if (t.more() && t.lookingAt('-') && (this.flags & RE2Flags.PERL_X) === 0 && !first) {
        let s = t.rest()
        if (s === '-' || !s.startsWith('-]')) {
          t.rewindTo(startPos)
          throw new PatternSyntaxException(Parser.ERR_INVALID_CHAR_RANGE, t.rest())
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
      let lo = this.parseClassChar(t, startPos)
      let hi = lo
      if (t.more() && t.lookingAt('-')) {
        t.skip(1) // '-'
        if (t.more() && t.lookingAt(']')) {
          // [a-] means (a|-) so check for final ].
          t.skip(-1)
        } else {
          hi = this.parseClassChar(t, startPos)
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
    t.skip(1) // ']'

    cc.cleanClass()
    if (sign < 0) {
      cc.negateClass()
    }
    re.runes = cc.toArray()
    this.push(re)
  }

  static subarray(array, start, end) {
    let r = new Array(end - start)
    for (let i = start; i < end; ++i) {
      r[i - start] = array[i]
    }
    return r
  }

  static concatRunes(x, y) {
    let z = new Array(x.length + y.length)
    Array.prototype.splice.apply(z, [0, x.length].concat(x))
    Array.prototype.splice.apply(z, [x.length, y.length].concat(y))
    return z
  }
}

export { Parser }
