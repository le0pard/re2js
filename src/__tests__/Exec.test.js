import { expect, describe, test } from '@jest/globals'
import { RE2 } from '../RE2'

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import readline from 'node:readline'
import url from 'node:url'
import { utf16IndicesToUtf8 } from '../__utils__/unicode'

const FIXTURES_DIRNAME = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '../__fixtures__'
)

const unquoteChar = (s, i, quote) => {
  let c = s.codePointAt(i[0])
  i[0] += Array.from(String.fromCodePoint(c)).length

  // easy cases
  if (c == quote && (quote == "'" || quote == '"')) {
    throw new Error('unescaped quotation mark in literal')
  }
  if (c != '\\'.codePointAt(0)) {
    return c
  }

  // hard case: c is backslash
  c = s.codePointAt(i[0])
  i[0] += Array.from(String.fromCodePoint(c)).length

  switch (c) {
    case 'a'.codePointAt(0):
      return 0x07
    case 'b'.codePointAt(0):
      return '\b'.codePointAt(0)
    case 'f'.codePointAt(0):
      return '\f'.codePointAt(0)
    case 'n'.codePointAt(0):
      return '\n'.codePointAt(0)
    case 'r'.codePointAt(0):
      return '\r'.codePointAt(0)
    case 't'.codePointAt(0):
      return '\t'.codePointAt(0)
    case 'v'.codePointAt(0):
      return 0x0b
    case 'x'.codePointAt(0):
    case 'u'.codePointAt(0):
    case 'U'.codePointAt(0): {
      let n = 0
      switch (c) {
        case 'x'.codePointAt(0):
          n = 2
          break
        case 'u'.codePointAt(0):
          n = 4
          break
        case 'U'.codePointAt(0):
          n = 8
          break
      }
      let v = 0
      for (let j = 0; j < n; j++) {
        let d = s.codePointAt(i[0])
        i[0] += Array.from(String.fromCodePoint(d)).length

        let x = parseInt(String.fromCodePoint(d), 16)
        if (isNaN(x)) {
          throw new Error('not a hex char: ' + String.fromCodePoint(d))
        }
        v = (v << 4) | x
      }
      if (c == 'x'.codePointAt(0)) {
        return v
      }
      if (v > 0x10ffff) {
        throw new Error('Unicode code point out of range')
      }
      return v
    }
    case '0'.codePointAt(0):
    case '1'.codePointAt(0):
    case '2'.codePointAt(0):
    case '3'.codePointAt(0):
    case '4'.codePointAt(0):
    case '5'.codePointAt(0):
    case '6'.codePointAt(0):
    case '7'.codePointAt(0): {
      let v = c - '0'.codePointAt(0)
      for (let j = 0; j < 2; j++) {
        // one digit already; two more
        let d = s.codePointAt(i[0])
        i[0] += Array.from(String.fromCodePoint(d)).length

        let x = d - '0'.codePointAt(0)
        if (x < 0 || x > 7) {
          throw new Error('illegal octal digit')
        }
        v = (v << 3) | x
      }
      if (v > 255) {
        throw new Error('octal value out of range')
      }
      return v
    }
    case '\\'.codePointAt(0):
      return '\\'.codePointAt(0)
    case "'".codePointAt(0):
    case '"'.codePointAt(0):
      if (c != quote) {
        throw new Error('unnecessary backslash escape')
      }
      return c
    default:
      throw new Error('unexpected character')
  }
}

const unquote = (s) => {
  let n = s.length
  if (n < 2) {
    throw new Error('too short')
  }
  let quote = s.charAt(0)
  if (quote != s.charAt(n - 1)) {
    throw new Error("quotes don't match")
  }
  s = s.substring(1, n - 1)
  if (quote == '`') {
    if (s.indexOf('`') >= 0) {
      throw new Error("backquoted string contains '`'")
    }
    return s
  }
  if (quote != '"' && quote != "'") {
    throw new Error('invalid quotation mark')
  }
  if (s.indexOf('\n') >= 0) {
    throw new Error('multiline string literal')
  }
  // Is it trivial?  Avoid allocation.
  if (s.indexOf('\\') < 0 && s.indexOf(quote) < 0) {
    if (
      quote == '"' || // "abc"
      Array.from(s).length == 1
    ) {
      // 'a'
      // if s == "\\" then this return is wrong.
      return s
    }
  }

  let i = [0] // UTF-16 index, an in/out-parameter of unquoteChar.
  let buf = ''
  let len = s.length
  while (i[0] < len) {
    // The 'unquoteChar' function was not provided in the original code.
    // This should be replaced with the JavaScript version of that function.
    buf += String.fromCodePoint(unquoteChar(s, i, quote))
    if (quote == "'" && i[0] != len) {
      throw new Error('single-quotation must be one char')
    }
  }

  return buf
}

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
  // TODO: is this safe or must we decode UTF-16?
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

  for await (let line of readline.createInterface({ input: inputFile })) {
    lineno += 1

    const first = line[0]
    const firstCodePoint = first.codePointAt(0)
    if (first === '#') {
      continue
    }

    if ('A'.codePointAt(0) <= firstCodePoint && firstCodePoint <= 'Z'.codePointAt(0)) {
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
    } else if (first === '"') {
      const q = unquote(line)

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
        console.log(e)
      }

      try {
        refull = RE2.compile(`\\A(?:${q})\\z`)
      } catch (e) {
        // ignore
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
    }
  }

  if (input < strings.length) {
    throw new Error('out of sync: have strings left')
  }
}

it('RE2 search', async () => {
  await testRE2('re2-search.txt')
})

it.skip('RE2 exhaustive', async () => {
  await testRE2('re2-exhaustive.txt.gz')
}, 1800000) // long running test (~30 min), run only locally

it('example', () => {
  const re = RE2.compile('(?i:co(.)a)')
  expect(re.findAll('Copacobana', 10)).toEqual(['Copa', 'coba'])

  const res = re.findAllSubmatch('Copacobana', 100)
  expect(res[0]).toEqual(['Copa', 'p'])
  expect(res[1]).toEqual(['coba', 'b'])
})
