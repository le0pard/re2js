import { CharClass } from './CharClass'
import { Regexp } from './Regexp'
import { RE2Flags } from './RE2Flags'
import { Unicode } from './Unicode'

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
}

export { Parser }
