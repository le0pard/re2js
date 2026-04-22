import { RE2JS } from '../index'
import RE2Node from 're2'
import { describe, test } from '@jest/globals'

// 1. Generate 30,000 dummy Magic: The Gathering cards with more complex text
const cards = []
for (let i = 0; i < 30000; i++) {
  if (i % 5 === 0) {
    cards.push('When this creature enters the battlefield, it deals 3 damage to target player.')
  } else if (i % 5 === 1) {
    cards.push('Flying, trample. At the beginning of your upkeep, you gain 1 life.')
  } else if (i % 5 === 2) {
    cards.push('Tap: Add 1 mana of any color. If you control a swamp, add 2 instead.')
  } else if (i % 5 === 3) {
    cards.push(
      'Legendary Artifact Creature - Golem. Power/Toughness: 12/12. First strike, vigilance.'
    )
  } else {
    cards.push('Instant. Counter target spell unless its controller pays 3 mana.')
  }
}

// Add a ReDoS poison pill to the end
cards.push('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!')

const runRe2NodeBenchmark = (name, pattern) => {
  const re2js = RE2JS.compile(pattern)
  const re2node = new RE2Node(pattern)

  // === WARMUP (JIT Compiler) ===
  for (let i = 0; i < 10000; i++) {
    const warmupStr = cards[i % cards.length]
    re2js.test(warmupStr)
    re2node.test(warmupStr)
  }

  const CYCLES = 10

  // === RE2JS BENCHMARK ===
  let minTimeRe2js = Infinity
  let re2jsMatches = 0
  for (let c = 0; c < CYCLES; c++) {
    let matches = 0
    const start = performance.now()
    for (let i = 0; i < cards.length; i++) {
      if (re2js.test(cards[i])) matches++
    }
    const time = performance.now() - start
    if (time < minTimeRe2js) minTimeRe2js = time
    re2jsMatches = matches // Overwrite is fine, should be same every cycle
  }

  // === RE2-NODE BENCHMARK ===
  let minTimeRe2Node = Infinity
  let re2nodeMatches = 0
  for (let c = 0; c < CYCLES; c++) {
    let matches = 0
    const start = performance.now()
    for (let i = 0; i < cards.length; i++) {
      if (re2node.test(cards[i])) matches++
    }
    const time = performance.now() - start
    if (time < minTimeRe2Node) minTimeRe2Node = time
    re2nodeMatches = matches
  }

  const re2jsOpsSec = Math.round((cards.length / minTimeRe2js) * 1000)
  const re2nodeOpsSec = Math.round((cards.length / minTimeRe2Node) * 1000)

  let speedup, winner
  if (minTimeRe2js < minTimeRe2Node) {
    speedup = minTimeRe2Node / minTimeRe2js
    winner = 're2js'
  } else {
    speedup = minTimeRe2js / minTimeRe2Node
    winner = 're2-node'
  }

  // eslint-disable-next-line no-console
  console.log(`
--- Benchmarking "${name}": /${pattern}/ ---
re2js (.test)    : ${minTimeRe2js.toFixed(2)} ms | ${re2jsOpsSec.toLocaleString()} ops/sec
re2-node (.test) : ${minTimeRe2Node.toFixed(2)} ms | ${re2nodeOpsSec.toLocaleString()} ops/sec
Result           : ${winner} is ${speedup.toFixed(2)}x faster
  `)

  if (re2jsMatches !== re2nodeMatches) {
    throw new Error(
      `Mismatch in results! re2js found ${re2jsMatches}, re2-node found ${re2nodeMatches}`
    )
  }
}

describe('Cross-Library Performance Benchmark: re2js vs re2-node', () => {
  test.skip('Run benchmarks', () => {
    // eslint-disable-next-line no-console
    console.log(`Running benchmarks against ${cards.length.toLocaleString()} items...\n`)

    // Basic Patterns
    runRe2NodeBenchmark('Simple Literal', 'damage')
    runRe2NodeBenchmark('Case Insensitive', '(?i)swamp')

    // Heavy Alternation (Tests DFA state explosion)
    runRe2NodeBenchmark(
      'Massive Alternation',
      'White|Blue|Black|Red|Green|Colorless|Artifact|Enchantment|Planeswalker|Instant|Sorcery'
    )

    // Lazy vs Greedy (Tests varying scan behaviors)
    runRe2NodeBenchmark('Greedy Wildcard', 'enters.*battlefield')
    runRe2NodeBenchmark('Lazy Wildcard', 'enters.*?battlefield')

    // Bounded Repetitions (Tests compiler's loop unrolling)
    runRe2NodeBenchmark('Bounded Repetition', '[A-Z][a-z]{5,15}')

    // Deep State Transitions
    runRe2NodeBenchmark('Deep State Machine', '([0-9]+(/[0-9]+)+)')

    // Word Boundaries (Forces RE2JS to bail out of DFA and use NFA)
    runRe2NodeBenchmark('Word Boundaries (NFA Fallback)', '\\b(Flying|First strike|vigilance)\\b')

    // Security
    runRe2NodeBenchmark('ReDoS Attempt (Catastrophic Backtracking)', '(a+)+!')
  })
})
