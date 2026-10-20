// Differential fuzzer against the JavaScript engine's own RegExp, for what has no other
// reference: lookbehinds (an re2js extension, which only the Pike VM runs) and
// RE2JS.translateRegExp, which rewrites JavaScript syntax for RE2.
//
// For each random JavaScript pattern (with lookbehinds, flags i, m and s) and input, the
// translated pattern must agree with a u-mode RegExp on what does not depend on which of
// several matches an engine prefers, as backtracking and RE2 choose differently in some cases
// (e.g. an empty iteration of a loop): where the first match starts, searching from each
// position, and whether the whole input matches.
//
// The JavaScript searches run in a worker thread (native-worker.js): backtracking can take
// exponential time on the nested repetitions the generator makes (the very problem RE2 avoids),
// so a case whose search takes longer than NATIVE_TIMEOUT_MS is skipped.
import { Worker } from 'node:worker_threads'
import { RE2JS } from '../../src/index.js'
import { RE2JSCompileException, RE2JSSyntaxException } from '../../src/exceptions.js'
import { makeJsPattern, makeJsText } from './generate.js'

const FLAGS = ['', '', 'i', 'm', 's', 'ims']
const NATIVE_TIMEOUT_MS = 250

let worker = null
const startWorker = () => {
  worker = new Worker(new URL('./native-worker.js', import.meta.url))
}

// The JavaScript answers for |request|, or null when they take too long
const askNative = (request) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.removeAllListeners()
      worker.terminate()
      startWorker()
      resolve(null)
    }, NATIVE_TIMEOUT_MS)
    worker.once('message', (answer) => {
      clearTimeout(timer)
      worker.removeAllListeners('error')
      resolve(answer)
    })
    worker.once('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    worker.postMessage(request)
  })

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

  setup() {
    startWorker()
    return null
  },

  async teardown() {
    await worker?.terminate()
  },

  generate(random) {
    return { pattern: makeJsPattern(random), flags: random.pick(FLAGS), text: makeJsText(random) }
  },

  async check(c) {
    try {
      new RegExp(c.pattern, `gu${c.flags}`) // oxlint-disable-line no-new
    } catch {
      return null // not valid JavaScript (a shrink can break it)
    }
    const re = compile(new RegExp(c.pattern, `u${c.flags}`))
    if (re === null) return null

    const boundaries = [0]
    for (const ch of c.text) boundaries.push(boundaries[boundaries.length - 1] + ch.length)
    const native = await askNative({
      pattern: c.pattern,
      flags: c.flags,
      text: c.text,
      starts: boundaries
    })
    if (native === null) return null // JavaScript's backtracking took too long

    for (let k = 0; k < boundaries.length; k++) {
      const from = boundaries[k]
      const want = native.firsts[k]
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
    if (full !== null && full.test(c.text) !== native.full) {
      return `the whole input matches: ${full.test(c.text)}, in JavaScript: ${native.full}`
    }
    return null
  }
}
