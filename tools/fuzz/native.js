// Differential fuzzer against the JavaScript engine's own RegExp, for what has no other
// reference: lookbehinds (an re2js extension, which only the Pike VM runs) and
// RE2JS.translateRegExp, which rewrites JavaScript syntax for RE2.
//
// For each random JavaScript pattern (with lookbehinds, flags i, m and s) and input, the
// translated pattern must agree with a u-mode RegExp on what does not depend on which of
// several matches an engine prefers, as backtracking and RE2 choose differently in some cases
// (e.g. an empty iteration of a loop): where the first match starts, searching from each
// position, and whether the whole input matches.
import { RE2JS } from '../../src/index.js'
import { RE2JSCompileException, RE2JSSyntaxException } from '../../src/exceptions.js'
import { makeJsPattern, makeJsText } from './generate.js'

const FLAGS = ['', '', 'i', 'm', 's', 'ims']

const compile = (regexp) => {
  try {
    return RE2JS.compile(RE2JS.translateRegExp(regexp), RE2JS.LOOKBEHINDS)
  } catch (e) {
    // What RE2 does not support (backreferences, lookaheads, captures inside lookbehinds)
    if (e instanceof RE2JSSyntaxException || e instanceof RE2JSCompileException) return null
    throw e
  }
}

export const nativeFuzzer = {
  name: 'native',
  fields: ['pattern', 'text'],

  generate(random) {
    return { pattern: makeJsPattern(random), flags: random.pick(FLAGS), text: makeJsText(random) }
  },

  check(c) {
    let native
    try {
      native = new RegExp(c.pattern, `gu${c.flags}`)
    } catch {
      return null // not valid JavaScript (a shrink can break it)
    }
    const re = compile(new RegExp(c.pattern, `u${c.flags}`))
    if (re === null) return null

    const boundaries = [0]
    for (const ch of c.text) boundaries.push(boundaries[boundaries.length - 1] + ch.length)
    for (const from of boundaries) {
      native.lastIndex = from
      const m = native.exec(c.text)
      const want = m === null ? -1 : m.index
      // V8 can report a match that starts inside a surrogate pair (with lookbehinds or \B),
      // which u-mode matching never should: there is nothing to compare with
      if (want >= 0 && !boundaries.includes(want)) continue
      const matcher = re.matcher(c.text)
      const have = matcher.find(from) ? matcher.start() : -1
      if (have !== want) {
        return `searching from ${from}, the first match starts at ${have}, in JavaScript at ${want}`
      }
    }

    const full = compile(new RegExp(`^(?:${c.pattern})$`, `u${c.flags}`))
    const fullNative = new RegExp(`^(?:${c.pattern})$`, `u${c.flags}`).test(c.text)
    if (full !== null && full.test(c.text) !== fullNative) {
      return `the whole input matches: ${full.test(c.text)}, in JavaScript: ${fullNative}`
    }
    return null
  }
}
