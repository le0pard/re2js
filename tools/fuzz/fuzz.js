// Runs the fuzzers: random patterns and inputs, checked by the engines against each other
// (engines.js) and against Go's regexp package (go.js). A failure is shrunk to a minimal case
// and printed with the command that replays it. Exits with status 1 on a failure.
//
//   yarn fuzz
//
// Environment:
//   RE2JS_FUZZ_SEED         seed of the run (default: random, printed at the start)
//   RE2JS_FUZZ_SECONDS      time for each fuzzer (default: 30)
//   RE2JS_FUZZ_ONLY         comma-separated fuzzers to run: engines, go (default: all)
//   RE2JS_FUZZ_CASE         replay only this case of the run (with RE2JS_FUZZ_SEED)
//   RE2JS_FUZZ_REQUIRE_ALL  1 to fail instead of skipping a fuzzer that cannot run (CI)
import { randomInt } from 'node:crypto'
import { enginesFuzzer } from './engines.js'
import { goFuzzer } from './go.js'
import { caseSeed, makeRandom } from './random.js'
import { shrink } from './shrink.js'

const FUZZERS = [enginesFuzzer, goFuzzer]

const env = (name) =>
  process.env[name] === void 0 || process.env[name] === '' ? null : process.env[name]
const seed =
  env('RE2JS_FUZZ_SEED') === null ? randomInt(2 ** 32) : Number(env('RE2JS_FUZZ_SEED')) >>> 0
const seconds = Number(env('RE2JS_FUZZ_SECONDS') ?? 30)
const only = env('RE2JS_FUZZ_ONLY')?.split(',') ?? null
const replay = env('RE2JS_FUZZ_CASE') === null ? null : Number(env('RE2JS_FUZZ_CASE'))
const requireAll = env('RE2JS_FUZZ_REQUIRE_ALL') === '1'

const log = (line = '') => process.stdout.write(`${line}\n`)

// The failure message for case |c|, or null; an exception is a failure too
const failureOf = async (fuzzer, c) => {
  try {
    return await fuzzer.check(c)
  } catch (e) {
    return `throws ${e.stack}`
  }
}

const report = async (fuzzer, index, c, failure) => {
  log(`FAIL ${fuzzer.name}, case ${index}: ${failure}`)
  log(`  case: ${JSON.stringify(c)}`)
  const minimal = await shrink(
    c,
    async (candidate) => (await failureOf(fuzzer, candidate)) !== null,
    {
      fields: fuzzer.fields
    }
  )
  log(`  shrunk to: ${JSON.stringify(minimal)}`)
  log(`  which fails with: ${await failureOf(fuzzer, minimal)}`)
  log(
    `  replay: RE2JS_FUZZ_SEED=${seed} RE2JS_FUZZ_ONLY=${fuzzer.name} RE2JS_FUZZ_CASE=${index} yarn fuzz`
  )
}

// Runs |fuzzer| for the time budget (or replays one case); returns whether it passed
const run = async (fuzzer) => {
  const skipped = await fuzzer.setup?.()
  if (skipped) {
    if (requireAll) {
      log(`FAIL ${fuzzer.name}: cannot run, ${skipped}`)
      return false
    }
    log(`${fuzzer.name}: skipped, ${skipped}`)
    return true
  }
  try {
    const deadline = Date.now() + seconds * 1000
    let cases = 0
    for (let index = replay ?? 0; ; index++) {
      if (replay !== null ? index > replay : Date.now() >= deadline) break
      const c = fuzzer.generate(makeRandom(caseSeed(seed, fuzzer.name, index)))
      const failure = await failureOf(fuzzer, c)
      cases++
      if (failure !== null) {
        await report(fuzzer, index, c, failure)
        return false
      }
    }
    log(`${fuzzer.name}: ${cases} cases passed`)
    return true
  } finally {
    await fuzzer.teardown?.()
  }
}

log(`re2js fuzz, seed ${seed}`)
let passed = true
for (const fuzzer of FUZZERS) {
  if (only !== null && !only.includes(fuzzer.name)) continue
  passed = (await run(fuzzer)) && passed
}
process.exitCode = passed ? 0 : 1
