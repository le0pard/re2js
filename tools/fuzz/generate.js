// Random patterns and inputs for the fuzzers. Inputs use only characters whose Unicode
// properties have been stable for many versions, so that results cannot differ because two
// engines ship different Unicode tables.

const LITERALS = ['a', 'b', 'c', 'ab', 'x', 'A', 'K', 'k', 's', 'S', '1', ' ', '-', '_']
LITERALS.push('é', 'É', 'β', '本', '😀', '\\n', '\\t', '\\.', '\\*', '\\\\', '\\x41')
LITERALS.push('\\x{1F600}', '\\101', '\\Qa.b\\E')

const CLASSES = ['.', '[ab]', '[^a]', '[a-c]', '[^\\n]', '[a-zA-Z_]', '[é本]', '[^ab😀]', '[a-]']
CLASSES.push('[]a]', '[^]a]', '[[:alpha:]]', '[[:^digit:]]', '[^[:space:]x]', '[\\d\\s]', '[^\\D]')
CLASSES.push(
  '\\d',
  '\\D',
  '\\w',
  '\\W',
  '\\s',
  '\\S',
  '\\pL',
  '\\PL',
  '\\p{Greek}',
  '\\pN',
  '\\p{Lu}'
)
CLASSES.push('\\P{Ll}', '\\p{^Greek}', '[^\\s\\S]')

const ASSERTIONS = ['^', '$', '\\A', '\\z', '\\b', '\\B', '(?m:^)', '(?m:$)']

const FLAGS = ['(?:)', '(?i:a)', '(?i:k)', '(?i:s)', '(?i:é)', '(?s:.)', '(?U:a+)', '(?-s:.)']
FLAGS.push('(?i)', '(?m)', '(?s)', '(?U)')

const LOOKBEHINDS = ['(?<=a)', '(?<!a)', '(?<=ab)', '(?<!b)', '(?<=[ab]+)', '(?<=a.)', '(?<!\\w)']
LOOKBEHINDS.push('(?<=^a*)', '(?<=😀)', '(?<=\\b)', '(?<!(?:a|b)x)')

// Fragments that are often invalid, to compare which patterns are rejected
const JUNK = ['(', ')', '[', '{', '}', '{2}', '*', '\\', '\\8', '\\Z', '\\C', '(?P<n>', '(?<n']
JUNK.push('[z-a]', '\\p{Bogus}', '(?x)', 'x{2,1}', 'x{1001}', '(?i', '(?P=n)', '[[:foo:]]', '\\Q')
JUNK.push('{,2}', '**')

const REPEATS = ['*', '+', '?', '{2}', '{1,3}', '{0,2}', '{2,}', '{0}']
const PATTERN_FLAGS = ['', '', '', '(?i)', '(?s)', '(?m)', '(?U)', '(?ims)']

// A random pattern. |lookbehinds| adds captureless lookbehinds (an re2js extension), |junk|
// adds fragments that are often invalid.
export const makePattern = (random, { lookbehinds = false, junk = false } = {}) => {
  let names = 0
  const atom = (depth) => {
    const r = random.next()
    if (junk && r < 0.03) return random.pick(JUNK)
    if (lookbehinds && r < 0.1) return random.pick(LOOKBEHINDS)
    if (r < 0.6 || depth > 2) {
      return random.pick(random.pick([LITERALS, LITERALS, CLASSES, CLASSES, ASSERTIONS, FLAGS]))
    }
    if (r < 0.72) return `(?:${sequence(depth + 1)})`
    if (r < 0.88) return `(${sequence(depth + 1)})`
    // Names are unique except, rarely, a repeated one
    const name = names > 0 && random.chance(0.05) ? `n${random.int(names)}` : `n${names++}`
    const open = random.chance(0.5) ? `(?P<${name}>` : `(?<${name}>`
    return `${open}${sequence(depth + 1)})`
  }
  const quantify = (s) => {
    if (random.chance(0.55)) return s
    return s + random.pick(REPEATS) + (random.chance(0.25) ? '?' : '')
  }
  const sequence = (depth) => {
    let s = ''
    for (let n = 1 + random.int(3); n > 0; n--) s += quantify(atom(depth))
    return random.chance(0.3) ? `${s}|${quantify(atom(depth))}` : s
  }
  // A fifth are anchored at the start (often at both ends), which the one-pass engine needs
  const body = random.chance(0.2)
    ? `^(?:${sequence(0)})${random.chance(0.6) ? '$' : ''}`
    : sequence(0)
  return random.pick(PATTERN_FLAGS) + body
}

const TEXT_PIECES = ['a', 'b', 'c', 'x', 'A', 'K', 'k', 's', 'S', ' ', '_', '1', '-', '.', '\n']
TEXT_PIECES.push('\t', 'é', 'É', 'β', '本', '😀', 'ab', 'K', 'ſ')
const LONE_SURROGATES = ['\ud800', '\udc00']

// Usually short inputs; with probability |long|, thousands of pieces, which the bit-state
// backtracker cannot take, so the Pike VM and the lazy DFA run instead.
const pieceCount = (random, long) =>
  random.chance(long) ? 1000 + random.int(3000) : random.int(14)

// A random string; |loneSurrogates| mixes in unpaired surrogates (invalid UTF-16)
export const makeText = (random, { loneSurrogates = false, long = 0.05 } = {}) => {
  const pieces = loneSurrogates ? [...TEXT_PIECES, ...LONE_SURROGATES] : TEXT_PIECES
  let s = ''
  for (let n = pieceCount(random, long); n > 0; n--) s += random.pick(pieces)
  return s
}

const encoder = new TextEncoder()
const BYTE_PIECES = TEXT_PIECES.map((s) => Array.from(encoder.encode(s)))
// Invalid UTF-8: a stray byte, a lone lead byte, a continuation byte, an encoded surrogate, a
// truncated 4-byte sequence, an overlong newline, a value above U+10FFFF
BYTE_PIECES.push([0xff], [0xc3], [0x80], [0xed, 0xa0, 0x80], [0xf0, 0x9f], [0xe0, 0x80, 0x8a])
BYTE_PIECES.push([0xf4, 0x90, 0x80, 0x80])

// A random byte array, usually not valid UTF-8
export const makeBytes = (random, { long = 0.05 } = {}) => {
  const bytes = []
  for (let n = pieceCount(random, long); n > 0; n--) bytes.push(...random.pick(BYTE_PIECES))
  return bytes
}
