// Runs JavaScript RegExp searches for the native fuzzer (native.js) in a worker thread, as a
// backtracking search can take exponential time; the fuzzer stops this worker when one runs too
// long and skips the case.
//
// Request: { pattern, flags, text, starts }
// Response: { firsts: where the first match starts searching from each of |starts| (-1: none),
//             full: whether the whole text matches }
import { parentPort } from 'node:worker_threads'

parentPort.on('message', ({ pattern, flags, text, starts }) => {
  const regexp = new RegExp(pattern, `gu${flags}`)
  const firsts = starts.map((from) => {
    regexp.lastIndex = from
    const m = regexp.exec(text)
    return m === null ? -1 : m.index
  })
  const full = new RegExp(`^(?:${pattern})$`, `u${flags}`).test(text)
  parentPort.postMessage({ firsts, full })
})
