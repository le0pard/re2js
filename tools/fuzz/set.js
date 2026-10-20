// RE2Set fuzzer: a set compiles its patterns into one program and matches them all in one pass,
// with its own DFA and Pike VM mode. It must report exactly the patterns that match on their own.
//
// For each random set of one to five patterns (with lookbehinds in a fifth of them, with each
// anchoring, sometimes leftmost-longest) and a random input, set.match() must equal the list of
// patterns whose own RE2JS.compile(...).test() is true, anchored as the set anchors them.
import { RE2JS, RE2Set } from '../../src/index.js'
import { RE2JSCompileException, RE2JSSyntaxException } from '../../src/exceptions.js'
import { makePattern, makeText } from './generate.js'

const ANCHORS = [RE2Set.UNANCHORED, RE2Set.ANCHOR_START, RE2Set.ANCHOR_BOTH]

const anchored = (anchor, pattern) => {
  if (anchor === RE2Set.ANCHOR_BOTH) return `^(?:${pattern})$`
  if (anchor === RE2Set.ANCHOR_START) return `^(?:${pattern})`
  return pattern
}

export const setFuzzer = {
  name: 'set',
  fields: ['patterns', 'text'],

  generate(random) {
    const lookbehinds = random.chance(0.2)
    return {
      patterns: Array.from({ length: 1 + random.int(5) }, () =>
        makePattern(random, { lookbehinds })
      ),
      anchor: random.pick(ANCHORS),
      flags: (lookbehinds ? RE2JS.LOOKBEHINDS : 0) | (random.chance(0.2) ? RE2JS.LONGEST_MATCH : 0),
      text: makeText(random, { long: 0.02 })
    }
  },

  check(c) {
    // Only valid patterns: a shrink that breaks one is not the same failure
    for (const p of c.patterns) {
      try {
        RE2JS.compile(p, c.flags)
      } catch (e) {
        if (e instanceof RE2JSSyntaxException || e instanceof RE2JSCompileException) return null
        throw e
      }
    }
    if (c.patterns.length === 0) return null

    const set = new RE2Set(c.anchor, c.flags)
    for (const p of c.patterns) set.add(p)
    set.compile()
    const want = c.patterns.flatMap((p, k) =>
      RE2JS.compile(anchored(c.anchor, p), c.flags).test(c.text) ? [k] : []
    )
    const have = set.match(c.text)
    if (JSON.stringify(have) !== JSON.stringify(want)) {
      return `set.match gives ${JSON.stringify(have)}, the patterns on their own match ${JSON.stringify(want)} (anchor ${c.anchor})`
    }
    return null
  }
}
