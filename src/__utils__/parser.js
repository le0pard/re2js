import { RE2Flags } from '../RE2Flags'
import { Regexp } from '../Regexp'
import { Unicode } from '../Unicode'

const OP_NAMES = new Map([
  [Regexp.Op.NO_MATCH, 'no'],
  [Regexp.Op.EMPTY_MATCH, 'emp'],
  [Regexp.Op.LITERAL, 'lit'],
  [Regexp.Op.CHAR_CLASS, 'cc'],
  [Regexp.Op.ANY_CHAR_NOT_NL, 'dnl'],
  [Regexp.Op.ANY_CHAR, 'dot'],
  [Regexp.Op.BEGIN_LINE, 'bol'],
  [Regexp.Op.END_LINE, 'eol'],
  [Regexp.Op.BEGIN_TEXT, 'bot'],
  [Regexp.Op.END_TEXT, 'eot'],
  [Regexp.Op.WORD_BOUNDARY, 'wb'],
  [Regexp.Op.NO_WORD_BOUNDARY, 'nwb'],
  [Regexp.Op.CAPTURE, 'cap'],
  [Regexp.Op.STAR, 'star'],
  [Regexp.Op.PLUS, 'plus'],
  [Regexp.Op.QUEST, 'que'],
  [Regexp.Op.REPEAT, 'rep'],
  [Regexp.Op.CONCAT, 'cat'],
  [Regexp.Op.ALTERNATE, 'alt']
])

export const dumpRegexp = (re) => {
  let b = ''
  if (!OP_NAMES.has(re.op)) {
    b += `op${re.op}`
  } else {
    const name = OP_NAMES.get(re.op)

    switch (re.op) {
      case Regexp.Op.STAR:
      case Regexp.Op.PLUS:
      case Regexp.Op.QUEST:
      case Regexp.Op.REPEAT:
        if ((re.flags & RE2Flags.NON_GREEDY) !== 0) {
          b += 'n'
        }
        b += name
        break
      case Regexp.Op.LITERAL:
        if (re.runes.length > 1) {
          b += 'str'
        } else {
          b += 'lit'
        }
        if ((re.flags & RE2Flags.FOLD_CASE) !== 0) {
          for (let r of re.runes) {
            if (Unicode.simpleFold(r) !== r) {
              b += 'fold'
              break
            }
          }
        }
        break
      default:
        b += name
        break
    }
  }
  b += '{'
  switch (re.op) {
    case Regexp.Op.END_TEXT:
      if ((re.flags & RE2Flags.WAS_DOLLAR) === 0) {
        b += '\\z'
      }
      break
    case Regexp.Op.LITERAL:
      for (let r of re.runes) {
        b += String.fromCodePoint(r)
      }
      break
    case Regexp.Op.CONCAT:
    case Regexp.Op.ALTERNATE:
      for (let sub of re.subs) {
        b += dumpRegexp(sub)
      }
      break
    case Regexp.Op.STAR:
    case Regexp.Op.PLUS:
    case Regexp.Op.QUEST:
      b += dumpRegexp(re.subs[0])
      break
    case Regexp.Op.REPEAT:
      b += `${re.min},${re.max}`
      b += ' '
      b += dumpRegexp(re.subs[0])
      break
    case Regexp.Op.CAPTURE:
      if (re.name !== null && re.name.length > 0) {
        b += re.name
        b += ':'
      }
      b += dumpRegexp(re.subs[0])
      break
    case Regexp.Op.CHAR_CLASS: {
      let sep = ''
      for (let i = 0; i < re.runes.length; i += 2) {
        b += sep
        sep = ' '
        let lo = re.runes[i]
        let hi = re.runes[i + 1]
        if (lo === hi) {
          b += `0x${lo.toString(16)}`
        } else {
          b += `0x${lo.toString(16)}-0x${hi.toString(16)}`
        }
      }
      break
    }
  }
  b += '}'
  return b
}

export const mkCharClass = (f) => {
  const re = new Regexp(Regexp.Op.CHAR_CLASS)
  let runes = []
  let lo = -1

  for (let i = 0; i <= Unicode.MAX_RUNE; i++) {
    if (f(i)) {
      if (lo < 0) {
        lo = i
      }
    } else if (lo >= 0) {
      runes = [...runes, lo, i - 1]
      lo = -1
    }
  }
  if (lo >= 0) {
    runes = [...runes, lo, Unicode.MAX_RUNE]
  }

  re.runes = runes
  return dumpRegexp(re)
}
