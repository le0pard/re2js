// Conformance tests against the RE2 and AT&T POSIX (Fowler) test data.
//
// Ported from Go's regexp/exec_test.go and re2j's ExecTest.java, with two additions:
// - every case is also run on the UTF-8 byte API (re2j's "Perhaps we should use the UTF-8 RE2
//   API?"), whose indices are the byte offsets the test data uses;
// - every case is run through each matching engine directly (Pike VM, bit-state backtracker,
//   one-pass, lazy DFA), not only through the engine the dispatcher happens to pick. The test
//   strings are short, so the dispatcher alone never reaches the Pike VM.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import { expect, it } from 'vitest'
import { RE2 } from '../RE2.js'
import { RE2Flags } from '../RE2Flags.js'
import { Utils } from '../Utils.js'
import { unquote, unquoteBytes } from '../__utils__/strconv.js'
import { runEngines } from '../__utils__/engines.js'
import { RE2JSSyntaxException } from '../exceptions.js'

const FIXTURES_DIRNAME = path.join(process.cwd(), 'src', '__fixtures__')

// Lines of a (possibly gzipped) fixture, split like Go's bufio.ScanLines: on '\n', dropping one
// trailing '\r'. A carriage return inside a line is kept (the exhaustive data has two).
const readLines = async function* (fileName) {
  let stream = fs.createReadStream(path.join(FIXTURES_DIRNAME, fileName))
  if (fileName.endsWith('.gz')) {
    stream = stream.pipe(zlib.createGunzip())
  }
  stream.setEncoding('utf8')
  let rest = ''
  for await (const chunk of stream) {
    const parts = (rest + chunk).split('\n')
    rest = parts.pop()
    for (const line of parts) {
      yield line.endsWith('\r') ? line.slice(0, -1) : line
    }
  }
  if (rest.length > 0) {
    yield rest.endsWith('\r') ? rest.slice(0, -1) : rest
  }
}

const isSingleBytes = (bytes) => bytes.every((b) => b < 0x80)

// Checks every engine result against |want| (null for no match), comparing only the first
// |want.length| positions when |prefixOnly| is set (the Fowler data lists fewer groups).
const expectEngines = (re, text, bytes, want, where, prefixOnly = false) => {
  for (const [engine, have] of runEngines(re, text, bytes)) {
    const message = `${where}: ${engine} /${re.toString()}/ on ${JSON.stringify(text ?? Array.from(bytes))}`
    if (typeof have === 'boolean') {
      expect(have, message).toBe(want !== null)
    } else if (prefixOnly && have !== null && want !== null) {
      expect(have.slice(0, want.length), message).toEqual(want)
    } else {
      expect(have, message).toEqual(want)
    }
  }
}

const parseResult = (lineno, res) => {
  // A single - indicates no match.
  if (res === '-') {
    return null
  }
  // Otherwise, a space-separated list of pairs; - means no submatch.
  const out = []
  for (const pair of res.split(' ')) {
    if (pair === '-') {
      out.push(-1, -1)
      continue
    }
    const k = pair.indexOf('-')
    const lo = k < 0 ? NaN : Number(pair.substring(0, k))
    const hi = k < 0 ? NaN : Number(pair.substring(k + 1))
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo > hi) {
      throw new Error(`${lineno}: invalid pair ${pair}`)
    }
    out.push(lo, hi)
  }
  return out
}

// Runs the RE2 test data. With |sample| = n > 1 only every n-th regexp is checked (against all
// strings of its stanza), which spreads the checks over every stanza of the file.
const testRE2 = async (fileName, sample = 1) => {
  let lineno = 0
  let strings = []
  let inStrings = false
  let input = 0
  let re = null
  let refull = null
  let regexps = 0

  for await (const line of readLines(fileName)) {
    lineno++
    if (line.length === 0) {
      throw new Error(`${lineno}: unexpected blank line`)
    }

    const first = line.charAt(0)
    if (first === '#') {
      continue
    }
    if (first >= 'A' && first <= 'Z') {
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
    } else if (first === '"') {
      if (inStrings) {
        strings.push(unquoteBytes(line))
        continue
      }

      const q = unquote(line)
      if (q === null) {
        throw new Error(`${lineno}: regexp is not valid UTF-8: ${line}`)
      }
      re = refull = null
      input = 0
      if (regexps++ % sample !== 0) {
        continue
      }
      try {
        re = RE2.compile(q)
      } catch (e) {
        if (e.message === 'error parsing regexp: invalid escape sequence: `\\C`') {
          // We don't and likely never will support \C; keep going.
          continue
        }
        throw new Error(`${lineno}: compile ${line}: ${e.message}`)
      }
      refull = RE2.compile(`\\A(?:${q})\\z`)
    } else if (first === '-' || (first >= '0' && first <= '9')) {
      if (input >= strings.length) {
        throw new Error(`${lineno}: out of sync: no input remaining`)
      }
      const bytes = strings[input++]
      if (re === null) {
        // not sampled, or uses \C
        continue
      }

      let text = null
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        // Not valid UTF-8: only the byte API can represent this input
      }

      if (!isSingleBytes(bytes) && re.toString().includes('\\B')) {
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
        const want = parseResult(lineno, res[i])
        const mode = `${partial ? 'partial' : 'full'}${longest ? ' longest' : ''}`
        expectEngines(regexp, text, bytes, want, `${fileName}:${lineno} ${mode}`)
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
  } else if (s.charAt(0) >= 'A' && s.charAt(0) <= 'Z') {
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
  let lineno = 0
  let lastRegexp = ''
  const NOTAB = RE2.compilePOSIX('[^\t]+')

  for await (const line of readLines(fileName)) {
    lineno += 1

    if (!line || line[0] === '#') {
      continue
    }

    const field = NOTAB.findAll(line, -1)
    // NULL is the empty string; a line using NIL (a null pointer) is skipped (as in Go)
    if (field.includes('NIL')) {
      continue
    }
    for (let i = 0; i < field.length; i++) {
      if (field[i] === 'NULL') {
        field[i] = ''
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

    // With '$' the pattern and text are C-escaped; the text may then hold bytes that are not
    // valid UTF-8 (e.g. \xff), which only the byte API can represent.
    let text = field[2]
    let bytes = Utils.stringToUtf8ByteArray(text)
    if (flag.indexOf('$') >= 0) {
      field[1] = unquote(`"${field[1]}"`)
      bytes = unquoteBytes(`"${field[2]}"`)
      text = unquote(`"${field[2]}"`)
    }

    if (field[1] === 'SAME') {
      field[1] = lastRegexp
    }
    lastRegexp = field[1]

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
        // Only a syntax error is the rejection the data expects; anything else is a bug
        if (shouldCompileMatch[0] || !(e instanceof RE2JSSyntaxException)) {
          throw new Error(`${lineno}: ${pattern} did not compile: ${e.message}`, { cause: e })
        }
        continue
      }

      expect(shouldCompileMatch[0], `${fileName}:${lineno}: ${pattern} compiled`).toBe(true)

      const where = `${fileName}:${lineno}`
      if (!shouldCompileMatch[1]) {
        expectEngines(re, text, bytes, null, where)
      } else if (pos.length === 0) {
        // Matches, positions not given: check only that every engine matches
        for (const [engine, have] of runEngines(re, text, bytes)) {
          expect(have === true || Array.isArray(have), `${where}: ${engine} ${pattern}`).toBe(true)
        }
      } else {
        // The data lists positions in bytes; the patterns and texts are ASCII
        expectEngines(re, text, bytes, pos, where, true)
      }
    }
  }
}

// tests

it('RE2 search', async () => {
  await testRE2('re2-search.txt')
})

// The full exhaustive data has 5.8 million lines and takes several minutes; a fixed sample of
// its regexps runs by default and RE2JS_EXHAUSTIVE=1 runs all of it.
it('RE2 exhaustive (sample)', async () => {
  await testRE2('re2-exhaustive.txt.gz', 400)
}, 600000)

it.skipIf(!process.env.RE2JS_EXHAUSTIVE)(
  'RE2 exhaustive',
  async () => {
    await testRE2('re2-exhaustive.txt.gz')
  },
  20000000
)

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
