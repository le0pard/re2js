// Generates src/__fixtures__/re2-search-golden.json: RE2's own search test cases
// (re2/testing/search_test.cc, simple_tests) with the results the C++ RE2 engine gives for them,
// recorded through the re2 Node.js binding. The fixture lets the test suite compare RE2JS with
// C++ RE2 without needing the native binding at test time.
//
// Usage (the binding is installed temporarily, as in the scheduled CI job):
//   YARN_ENABLE_SCRIPTS=true YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn add -D re2@1.27.0
//   yarn node tools/scripts/genRE2SearchFixture.js path/to/search_test.cc > src/__fixtures__/re2-search-golden.json
//   git checkout package.json yarn.lock && yarn install
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const RE2 = require('re2')

// Decodes a C string literal body (C escapes, \x and octal bytes) into its UTF-8 bytes.
const cUnescape = (s) => {
  const simple = {
    n: 10,
    t: 9,
    r: 13,
    f: 12,
    v: 11,
    a: 7,
    b: 8,
    '\\': 92,
    '"': 34,
    "'": 39,
    '?': 63
  }
  const out = []
  const encoder = new TextEncoder()
  for (let i = 0; i < s.length;) {
    if (s[i] !== '\\') {
      const cp = s.codePointAt(i)
      out.push(...encoder.encode(String.fromCodePoint(cp)))
      i += cp > 0xffff ? 2 : 1
      continue
    }
    const e = s[i + 1]
    if (e in simple) {
      out.push(simple[e])
      i += 2
    } else if (e === 'x') {
      let j = i + 2
      while (j < s.length && /[0-9a-fA-F]/.test(s[j])) j++
      out.push(parseInt(s.slice(i + 2, j), 16) & 0xff)
      i = j
    } else if (/[0-7]/.test(e)) {
      let j = i + 1
      while (j < s.length && j < i + 4 && /[0-7]/.test(s[j])) j++
      out.push(parseInt(s.slice(i + 1, j), 8) & 0xff)
      i = j
    } else {
      throw new Error(`unsupported escape \\${e} in ${s}`)
    }
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(out))
}

// First leftmost-first match of |pattern| in |text| as [start, end] pairs per group (UTF-16
// offsets, -1 for unmatched groups), or null for no match.
const firstMatch = (pattern, text) => {
  const m = new RE2(pattern, 'd').exec(text)
  if (m === null) return null
  return m.indices.flatMap((pair) => (pair ? [pair[0], pair[1]] : [-1, -1]))
}

const source = fs.readFileSync(process.argv[2], 'utf8')
const table = source.slice(source.indexOf('RegexpTest simple_tests[] = {'))
const body = table.slice(0, table.indexOf('\n};'))
const cases = []
for (const m of body.matchAll(/\{\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\s*\}/g)) {
  const pattern = cUnescape(m[1])
  const text = cUnescape(m[2])
  cases.push({
    pattern,
    text,
    partial: firstMatch(pattern, text),
    full: firstMatch(`\\A(?:${pattern})\\z`, text)
  })
}
process.stdout.write(
  `${JSON.stringify({ source: 're2/testing/search_test.cc simple_tests', engine: `re2 ${require('re2/package.json').version}`, cases }, null, 1)}\n`
)
