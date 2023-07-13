import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import readline from 'node:readline'
import url from 'node:url'

import { RE2 } from '../RE2'
import { RE2Flags } from '../RE2Flags'
import { Utils } from '../Utils'
import { utf16IndicesToUtf8 } from '../__utils__/unicode'
import { expect } from '@jest/globals'

const FIXTURES_DIRNAME = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '../__fixtures__'
)

const isSingleBytes = (s) => {
  for (let i = 0; i < s.length; i++) {
    if (s.codePointAt(i) >= 0x80) {
      return false
    }
  }
  return true
}

const parseResult = (lineno, res) => {
  // A single - indicates no match.
  if (res === '-') {
    return null
  }
  // Otherwise, a space-separated list of pairs.
  let n = 1
  let len = res.length
  for (let j = 0; j < len; j++) {
    if (res.charAt(j) === ' ') {
      n++
    }
  }
  let out = new Array(2 * n)
  let i = 0
  n = 0
  for (let j = 0; j <= len; j++) {
    if (j === len || res.charAt(j) === ' ') {
      // Process a single pair.  - means no submatch.
      let pair = res.substring(i, j)
      if (pair === '-') {
        out[n++] = -1
        out[n++] = -1
      } else {
        let k = pair.indexOf('-')
        if (k < 0) {
          throw new Error(`${lineno}: invalid pair ${pair}`)
        }
        let lo = -1,
          hi = -2
        try {
          lo = parseInt(pair.substring(0, k))
          hi = parseInt(pair.substring(k + 1))
        } catch (e) {
          /* fall through */
        }
        if (lo > hi) {
          throw new Error(`${lineno}: invalid pair ${pair}`)
        }
        out[n++] = lo
        out[n++] = hi
      }
      i = j + 1
    }
  }
  return out
}

const unquote = (str) => {
  // Remove quotes at the beginning and end of the string
  if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
    str = str.slice(1, -1)
  }

  // Replace escaped characters
  str = str
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\')

  // Replace hexadecimal escape sequences
  str = str.replace(/\\x([0-9A-Fa-f]{2})/g, function (match, p1) {
    return String.fromCharCode(parseInt(p1, 16))
  })

  return str
}

const testRE2 = async (fileName) => {
  let inputFile = fs.createReadStream(path.join(FIXTURES_DIRNAME, fileName))
  if (fileName.endsWith('.gz')) {
    inputFile = inputFile.pipe(zlib.createGunzip())
  }

  let lineno = 0
  let strings = []
  let inStrings = false
  let input = 0
  let re = null
  let refull = null
  let lineBuffer = null

  for await (let line of readline.createInterface({
    input: inputFile,
    crlfDelay: Infinity
  })) {
    lineno += 1
    if (line.length === 0) {
      throw new Error(`${lineno}: unexpected blank line`)
    }

    const first = line.charAt(0)
    const firstCodePoint = first.codePointAt(0)
    if (first === '#') {
      continue
    }

    if ('A'.codePointAt(0) <= firstCodePoint && firstCodePoint <= 'Z'.codePointAt(0)) {
      // name
      continue
    }

    if (line === 'strings') {
      if (input < strings.length) {
        throw new Error(`${lineno}: out of sync: strings left`)
      }

      strings = []
      inStrings = true
    } else if (line === 'regexps') {
      inStrings = false
    } else if (first === '"' || lineBuffer) {
      let q = line

      if (lineBuffer && lineBuffer.length > 0) {
        q = `${lineBuffer}${q}`
        lineBuffer = null
      } else if (!q.endsWith('"') || q === '"') {
        lineBuffer = `${q}\r` // looks like java do not think \r is new line
        continue
      }

      try {
        q = unquote(q)
      } catch (e) {
        throw new Error(`${lineno}: Error to unquote: ${line}, error: ${e}`)
      }

      if (inStrings) {
        strings = [...strings, q]
        continue
      }

      re = refull = null

      try {
        re = RE2.compile(q)
      } catch (e) {
        if (e.message === 'error parsing regexp: invalid escape sequence: `\\C`') {
          // We don't and likely never will support \C; keep going.
          continue
        }
        throw e
      }

      try {
        refull = RE2.compile(`\\A(?:${q})\\z`)
      } catch (e) {
        console.error('Error to refull parse: ', q, e) // eslint-disable-line no-console
      }

      input = 0
    } else if (
      first === '-' ||
      ('0'.codePointAt(0) <= firstCodePoint && firstCodePoint <= '9'.codePointAt(0))
    ) {
      if (re === null) {
        continue
      }

      if (input >= strings.length) {
        throw new Error(`${lineno}: out of sync: no input remaining`)
      }

      const text = strings[input++]
      const multibyte = !isSingleBytes(text)

      if (multibyte && re.toString().includes('\\B')) {
        // C++ RE2's \B considers every position in the input, which
        // is a stream of bytes, so it sees 'not word boundary' in the
        // middle of a rune.  But this package only considers whole
        // runes, so it disagrees.  Skip those cases.
        continue
      }

      const res = line.split(';')
      if (res.length !== 4) {
        throw new Error(`${lineno}: wrong test results: ${JSON.stringify(res)}`)
      }

      for (let i = 0; i < 4; i++) {
        const partial = (i & 1) !== 0
        const longest = (i & 2) !== 0

        const regexp = partial ? re : refull

        regexp.longest = longest
        let have = regexp.findSubmatchIndex(text) // UTF-16 indices

        if (multibyte && have !== null) {
          // The testdata uses UTF-8 indices, but we're using the UTF-16 API.
          // Perhaps we should use the UTF-8 RE2 API?
          have = utf16IndicesToUtf8(have, text)
        }

        const want = parseResult(lineno, res[i]) // UTF-8 indices

        expect(want).toEqual(have)

        regexp.longest = longest
        expect(regexp.match(text)).toEqual(want !== null)
      }
    } else {
      throw new Error(`${lineno}: out of sync`)
    }
  }

  if (input < strings.length) {
    throw new Error('out of sync: have strings left')
  }
}

const parseFowlerResult = (s) => {
  if (s.length === 0) {
    return [[], [true, true]]
  } else if (s === 'NOMATCH') {
    return [[], [true, false]]
  } else if ('A'.codePointAt(0) <= s.codePointAt(0) && s.codePointAt(0) <= 'Z'.codePointAt(0)) {
    return [[], [false, false]]
  }

  const shouldCompileMatch = [true, true]

  let result = []
  while (s.length > 0) {
    let end = ')'
    if (result.length % 2 === 0) {
      if (s.charAt(0) !== '(') {
        throw new Error("parse error: missing '('")
      }
      s = s.substring(1)
      end = ','
    }
    let i = s.indexOf(end)
    if (i <= 0) {
      // [sic]
      throw new Error("parse error: missing '" + end + "'")
    }
    let num = s.substring(0, i)
    if (num !== '?') {
      result.push(parseInt(num)) // (may throw)
    } else {
      result.push(-1)
    }
    s = s.substring(i + 1)
  }
  if (result.length % 2 !== 0) {
    throw new Error('parse error: odd number of fields')
  }
  return [result, shouldCompileMatch]
}

const testFowler = async (fileName) => {
  let inputFile = fs.createReadStream(path.join(FIXTURES_DIRNAME, fileName))
  if (fileName.endsWith('.gz')) {
    inputFile = inputFile.pipe(zlib.createGunzip())
  }

  let lineno = 0
  let lastRegexp = ''
  const NOTAB = RE2.compilePOSIX('[^\t]+')

  for await (let line of readline.createInterface({ input: inputFile })) {
    lineno += 1

    if (!line || line[0] === '#') {
      continue
    }

    const field = NOTAB.findAll(line, -1)
    for (let i = 0; i < field.length; i++) {
      if (field[i] === 'NULL') {
        field[i] = ''
      }
      if (field[i] === 'NIL') {
        continue
      }
    }

    if (field.length === 0) {
      continue
    }

    let flag = field[0]

    switch (flag.charAt(0)) {
      case '?':
      case '&':
      case '|':
      case ';':
      case '{':
      case '}': {
        flag = flag.substring(1)
        if (!flag || flag === '') {
          continue
        }
        break
      }
      case ':': {
        let i = flag.indexOf(':', 1)
        if (i < 0) {
          continue
        }
        flag = flag.substring(1 + i + 1)
        break
      }
      case 'C':
      case 'N':
      case 'T':
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        continue
    }

    if (field.length < 4) {
      throw new Error(`${lineno}: too few fields: ${line}`)
    }

    if (flag.indexOf('$') >= 0) {
      field[1] = unquote(`"${field[1]}"`)
      field[2] = unquote(`"${field[2]}"`)
    }

    if (field[1] === 'SAME') {
      field[1] = lastRegexp
    }
    lastRegexp = field[1]

    const text = field[2]

    const [pos, shouldCompileMatch] = parseFowlerResult(field[3]) // in/out param to parser

    for (let i = 0; i < flag.length; i++) {
      let pattern = field[1]

      let flags = RE2Flags.POSIX | RE2Flags.CLASS_NL
      switch (flag.charAt(i)) {
        default:
          continue
        case 'E':
          break
        case 'L':
          pattern = Utils.quoteMeta(pattern)
      }

      if (flag.indexOf('i') >= 0) {
        flags |= RE2Flags.FOLD_CASE
      }

      let re = null
      try {
        re = RE2.compileImpl(pattern, flags, true)
      } catch (e) {
        if (shouldCompileMatch[0]) {
          throw new Error(`${lineno}: ${pattern} did not compile`)
        }
        continue
      }

      expect(shouldCompileMatch[0]).toBe(true)

      let match = re.match(text)
      expect(match).toEqual(shouldCompileMatch[1])

      let haveArray = re.findSubmatchIndex(text)
      if (haveArray === null) {
        haveArray = [] // to make .length and printing safe
      }

      expect(haveArray.length > 0).toEqual(match)

      let have = []
      for (let j = 0; j < pos.length; ++j) {
        have.push(haveArray[j])
      }

      expect(have).toEqual(pos)
    }
  }
}

// tests

it('RE2 search', async () => {
  await testRE2('re2-search.txt')
})

it.skip('RE2 exhaustive', async () => {
  await testRE2('re2-exhaustive.txt.gz')
}, 3600000) // long running test (~60 min), run only locally

it('RE2 fowler basic', async () => {
  await testFowler('basic.dat')
})

it('RE2 fowler null subexpr', async () => {
  await testFowler('nullsubexpr.dat')
})

it('RE2 fowler repetition', async () => {
  await testFowler('repetition.dat')
})

it('example', () => {
  const re = RE2.compile('(?i:co(.)a)')
  expect(re.findAll('Copacobana', 10)).toEqual(['Copa', 'coba'])

  const res = re.findAllSubmatch('Copacobana', 100)
  expect(res[0]).toEqual(['Copa', 'p'])
  expect(res[1]).toEqual(['coba', 'b'])
})
