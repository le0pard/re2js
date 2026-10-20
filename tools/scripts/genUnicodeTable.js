// Generates src/UnicodeTables.js from the Unicode Character Database. Run `yarn gen:unicode`,
// which writes the file and formats it. Usage: node genUnicodeTable.js [output file], printing
// to stdout without one; the file is written only once every table has been built and checked.
//
// The tables follow Go's unicode package (maketables.go): code point ranges with a stride for
// the general categories, the scripts and the binary properties re2js accepts in \p{...}; for
// each, the code points outside it that case-fold into it (for (?i) classes); and the
// case-folding orbits behind Unicode.simpleFold. Only the Unicode data package is read, never
// the JS runtime's case mapping, so the output does not depend on the Node version.
import { writeFileSync } from 'node:fs'
import aliases from 'unicode-property-value-aliases'
import { toRanges } from './codepointRange.js'

const UNICODE = '@unicode/unicode-17.0.0'
const UNICODE_VERSION = UNICODE.replace('@unicode/unicode-', '')

// Loads a module of the Unicode data package, e.g. 'Script/Latin/code-points.mjs'
const load = async (path) => (await import(`${UNICODE}/${path}`)).default

// General categories under their short aliases (L, LC, Lu, ...), the names RE2 and Go use; the
// alias table also lists long forms such as 'digit' and 'punct'.
const CATEGORIES = Array.from(aliases.get('General_Category')).filter(
  ([alias]) => alias.length <= 2
)

// Binary properties re2js accepts in \p{...}, an extension: RE2 and Go have none of them.
const BINARY_PROPERTIES = [
  'ASCII_Hex_Digit',
  'Alphabetic',
  'Dash',
  'Emoji',
  'Emoji_Component',
  'Emoji_Modifier',
  'Emoji_Modifier_Base',
  'Emoji_Presentation',
  'Extended_Pictographic',
  'Hex_Digit',
  'Lowercase',
  'Math',
  'Quotation_Mark',
  'Terminal_Punctuation',
  'Uppercase',
  'White_Space'
]

// Go's unicode.IsPrint: letters, marks, numbers, punctuation and symbols (Unicode.isPrint adds
// the ASCII space).
const PRINT_CATEGORIES = ['L', 'M', 'N', 'P', 'S']

// === CASE FOLDING ===

// Code points with the same simple case folding (statuses C and S of CaseFolding.txt) form one
// class. Unicode.simpleFold steps through a class in ascending order and wraps around (Go:
// caseOrbit). Go tables only classes of three or more and derives pairs from its case tables;
// here every class is tabled except the ASCII letter pairs, whose case Unicode.simpleFold swaps
// itself, so folding never depends on the JS runtime.
const commonFolding = await load('Case_Folding/C/code-points.mjs')
const simpleFolding = await load('Case_Folding/S/code-points.mjs')
const folding = new Map([...commonFolding, ...simpleFolding])
if (folding.size !== commonFolding.size + simpleFolding.size) {
  throw new Error('CaseFolding.txt statuses C and S overlap')
}

const foldClasses = new Map() // folded code point -> its class
for (const [r, folded] of folding) {
  if (!foldClasses.has(folded)) foldClasses.set(folded, new Set([folded]))
  foldClasses.get(folded).add(r)
}

const caseOrbit = new Map()
for (const foldClass of foldClasses.values()) {
  const members = Array.from(foldClass).sort((a, b) => a - b)
  if (members.length === 2 && members[1] < 0x80) continue // an ASCII letter pair
  members.forEach((r, i) => caseOrbit.set(r, members[(i + 1) % members.length]))
}

// Unicode.simpleFold, over the orbit table generated here
const simpleFold = (r) => {
  const next = caseOrbit.get(r)
  if (next !== void 0) return next
  if (r >= 0x41 && r <= 0x5a) return r + 0x20 // A-Z
  if (r >= 0x61 && r <= 0x7a) return r - 0x20 // a-z
  return r
}

// The code points outside |codepoints| that case-fold to one inside it (Go: foldExceptions)
const foldExceptions = (codepoints) => {
  const inTable = new Set(codepoints)
  const exceptions = []
  for (const r of codepoints) {
    for (let f = simpleFold(r); f !== r; f = simpleFold(f)) {
      if (!inTable.has(f)) exceptions.push(f)
    }
  }
  return exceptions
}

// === ENCODING ===
// Ranges and orbits are stored as base64 VLQ strings of deltas and decoded on first use.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-'

const encodeVLQ = (value) => {
  if (!Number.isInteger(value) || value < 0) throw new Error(`cannot encode ${value}`)
  let res = ''
  do {
    let digit = value & 0x1f
    value >>>= 5
    if (value > 0) digit |= 0x20 // continuation bit
    res += B64[digit]
  } while (value > 0)
  return res
}

// ZigZag, so that negative deltas encode as small non-negative numbers
const encodeZigZag = (n) => (n << 1) ^ (n >> 31)

// Each range as [delta from the previous range's end, length, stride]; the stride is left out
// when every range has stride 1.
const encodeRanges = (ranges) => {
  const stride1 = ranges.every((r) => r[2] === 1)
  let encoded = ''
  let current = 0
  for (const [lo, hi, stride] of ranges) {
    encoded += encodeVLQ(lo - current) + encodeVLQ(hi - lo)
    if (!stride1) encoded += encodeVLQ(stride)
    current = hi
  }
  return { encoded, stride1 }
}

// Each entry as [delta from the previous key, zigzag of (value - key)]
const encodeOrbit = (orbit) => {
  let encoded = ''
  let current = 0
  for (const [key, value] of Array.from(orbit).sort((a, b) => a[0] - b[0])) {
    encoded += encodeVLQ(key - current) + encodeVLQ(encodeZigZag(value - key))
    current = key
  }
  return encoded
}

// === DECODING ===
// These are emitted into the generated file as they are written here, and used below to check
// that every table decodes back to what was encoded.

const B64_MAP = new Uint8Array(256)
for (let i = 0; i < B64.length; i++) {
  B64_MAP[B64.charCodeAt(i)] = i
}

const decodeVLQ = (str) => {
  const res = []
  let value = 0
  let shift = 0
  for (let i = 0; i < str.length; i++) {
    const digit = B64_MAP[str.charCodeAt(i)]
    value |= (digit & 0x1f) << shift
    if ((digit & 0x20) === 0) {
      res.push(value)
      value = 0
      shift = 0
    } else {
      shift += 5
    }
  }
  return res
}

// Returns [lo, hi, stride] triples flattened into a Uint32Array (see UnicodeRangeTable)
const decodeRanges = (str, isStride1) => {
  const res = decodeVLQ(str)
  const numRanges = isStride1 ? res.length / 2 : res.length / 3
  const out = new Uint32Array(numRanges * 3)
  let current = 0
  let resIdx = 0
  for (let i = 0; i < numRanges; i++) {
    current += res[resIdx++]
    out[i * 3] = current
    current += res[resIdx++]
    out[i * 3 + 1] = current
    out[i * 3 + 2] = isStride1 ? 1 : res[resIdx++]
  }
  return out
}

const decodeOrbit = (str) => {
  const res = decodeVLQ(str)
  const map = new Map()
  let currentKey = 0
  for (let i = 0; i < res.length; i += 2) {
    currentKey += res[i]
    const zz = res[i + 1]
    const delta = (zz >>> 1) ^ -(zz & 1) // ZigZag back to a signed delta
    map.set(currentKey, currentKey + delta)
  }
  return map
}

// A map whose values are built on first use
class LazyMap {
  constructor(initializer) {
    this.initializer = initializer
    this.cache = new Map()
  }
  has(key) {
    return key in this.initializer
  }
  get(key) {
    if (this.cache.has(key)) return this.cache.get(key)
    const fn = this.initializer[key]
    const val = fn ? fn() : null
    this.cache.set(key, val)
    return val
  }
}

// === OUTPUT ===

// The expression building the UnicodeRangeTable for |codepoints|
const tableSource = (codepoints) => {
  const ranges = toRanges(codepoints)
  const { encoded, stride1 } = encodeRanges(ranges)
  if (decodeRanges(encoded, stride1).join() !== ranges.flat().join()) {
    throw new Error('range table does not round-trip')
  }
  return `new UnicodeRangeTable(decodeRanges('${encoded}', ${stride1}))`
}

// LazyMap entries for |tables| ([name, code points] pairs), and for their fold exceptions
const lazyEntries = (tables) => {
  const entries = []
  const foldEntries = []
  for (const [name, codepoints] of tables) {
    entries.push(`${JSON.stringify(name)}: () => ${tableSource(codepoints)},`)
    const exceptions = foldExceptions(codepoints)
    if (exceptions.length > 0) {
      foldEntries.push(`${JSON.stringify(name)}: () => ${tableSource(exceptions)},`)
    }
  }
  return [entries.join('\n'), foldEntries.join('\n')]
}

const categoryTables = []
for (const [alias, name] of CATEGORIES) {
  categoryTables.push([alias, await load(`General_Category/${name}/code-points.mjs`)])
}
for (const name of BINARY_PROPERTIES) {
  categoryTables.push([name, await load(`Binary_Property/${name}/code-points.mjs`)])
}
const scriptTables = []
for (const name of (await import(UNICODE)).default.Script) {
  scriptTables.push([name, await load(`Script/${name}/code-points.mjs`)])
}
let printCodepoints = []
for (const alias of PRINT_CATEGORIES) {
  const name = aliases.get('General_Category').get(alias)
  printCodepoints = printCodepoints.concat(await load(`General_Category/${name}/code-points.mjs`))
}

const [categories, foldCategories] = lazyEntries(categoryTables)
const [scripts, foldScripts] = lazyEntries(scriptTables)

const orbitEncoded = encodeOrbit(caseOrbit)
const decodedOrbit = decodeOrbit(orbitEncoded)
if (
  decodedOrbit.size !== caseOrbit.size ||
  [...caseOrbit].some(([k, v]) => decodedOrbit.get(k) !== v)
) {
  throw new Error('case orbit does not round-trip')
}

const output = `// GENERATED BY tools/scripts/genUnicodeTable.js FROM UNICODE ${UNICODE_VERSION}; DO NOT EDIT.
// Regenerate with: yarn gen:unicode

import { UnicodeRangeTable } from './UnicodeRangeTable.js'

const B64 = '${B64}'
const B64_MAP = new Uint8Array(256)
for (let i = 0; i < B64.length; i++) {
  B64_MAP[B64.charCodeAt(i)] = i
}

const decodeVLQ = ${decodeVLQ}

const decodeRanges = ${decodeRanges}

const decodeOrbit = ${decodeOrbit}

${LazyMap}

class UnicodeTables {
  static _CASE_ORBIT = null
  static get CASE_ORBIT() {
    if (!this._CASE_ORBIT) {
      this._CASE_ORBIT = decodeOrbit('${orbitEncoded}')
    }
    return this._CASE_ORBIT
  }

  static _Print = null
  static get Print() {
    if (!this._Print) {
      this._Print = ${tableSource(printCodepoints)}
    }
    return this._Print
  }

  static CATEGORIES = new LazyMap({
${categories}
  })

  static get Upper() {
    return this.CATEGORIES.get('Lu')
  }

  static SCRIPTS = new LazyMap({
${scripts}
  })

  static FOLD_CATEGORIES = new LazyMap({
${foldCategories}
  })

  static FOLD_SCRIPT = new LazyMap({
${foldScripts}
  })
}

export { UnicodeTables }
`

const outputFile = process.argv[2]
if (outputFile) {
  writeFileSync(outputFile, output)
} else {
  process.stdout.write(output)
}
