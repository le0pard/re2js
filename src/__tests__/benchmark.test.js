import { RE2JS } from '../index'
import { describe, test } from '@jest/globals'

// 1. Generate 30,000 dummy Magic: The Gathering cards
const cards = []
for (let i = 0; i < 30000; i++) {
  if (i % 100 === 0) {
    cards.push('When this creature enters the battlefield, it deals 3 damage to target player.')
  } else if (i % 2 === 0) {
    cards.push('Flying, trample. At the beginning of your upkeep, you gain 1 life.')
  } else {
    cards.push('Tap: Add 1 mana of any color. If you control a swamp, add 2 instead.')
  }
}

// Add a ReDoS poison pill to the end to prove linear time safety remains intact
cards.push('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!')

const runBenchmark = (name, pattern) => {
  const re = RE2JS.compile(pattern)

  // === WARMUP (JIT Compiler) ===
  // We run the functions a few thousand times so V8 compiles the hot paths
  for (let i = 0; i < 5000; i++) {
    const warmupStr = cards[i % cards.length]
    re.test(warmupStr)
    re.matcher(warmupStr).find()
  }

  // === LEGACY BENCHMARK (Matcher / NFA) ===
  const startLegacy = performance.now()
  let legacyMatches = 0
  for (let i = 0; i < cards.length; i++) {
    // .matcher().find() forces NFA because it tracks capture group bounds
    if (re.matcher(cards[i]).find()) {
      legacyMatches++
    }
  }
  const timeLegacy = performance.now() - startLegacy
  const legacyOpsSec = Math.round((cards.length / timeLegacy) * 1000)

  // === FAST-PATH BENCHMARK (DFA) ===
  const startFast = performance.now()
  let fastMatches = 0
  for (let i = 0; i < cards.length; i++) {
    // .test() drops capture groups and routes to the DFA
    if (re.test(cards[i])) {
      fastMatches++
    }
  }
  const timeFast = performance.now() - startFast
  const fastOpsSec = Math.round((cards.length / timeFast) * 1000)

  // === RESULTS ===
  const speedup = timeLegacy / timeFast

  // eslint-disable-next-line no-console
  console.log(`
--- Benchmarking "${name}": /${pattern}/ ---
Legacy (.matcher.find) : ${timeLegacy.toFixed(2)} ms | ${legacyOpsSec.toLocaleString()} ops/sec
Fast-Path (.test)      : ${timeFast.toFixed(2)} ms | ${fastOpsSec.toLocaleString()} ops/sec
Result                 : ${speedup.toFixed(2)}x faster
  `)

  // Safety check to ensure both paths return the exact same number of matches
  if (legacyMatches !== fastMatches) {
    throw new Error(`Mismatch in results! Legacy found ${legacyMatches}, Fast found ${fastMatches}`)
  }
}

describe('Performance Benchmark', () => {
  test.skip('Run benchmarks', () => {
    console.log(`Running benchmarks against ${cards.length.toLocaleString()} items...\n`) // eslint-disable-line no-console

    // Basic Literals & Concatenations
    runBenchmark('Simple Literal', 'damage')
    runBenchmark('Wildcard', 'enters.*battlefield')

    // Test DFA's ability to handle Alternations without backtracking
    runBenchmark('Alternation', 'damage|life|mana')

    // Test DFA's character classes and repetitions
    runBenchmark('Character Class + Repetition', '[0-9]+ mana')
    runBenchmark('Complex Char Classes', '[A-Z][a-z]+, [a-z]+')

    // Test case folding paths through the DFA
    runBenchmark('Case Insensitive', '(?i)swamp')

    // Prove DFA immunity to ReDoS style nested quantifiers targeting the poison pill string
    runBenchmark('ReDoS Attempt (Catastrophic Backtracking)', '(a+)+!')
  })
})
