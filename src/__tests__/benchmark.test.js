import { RE2 } from '../RE2'
import { RE2Flags } from '../RE2Flags'
import { MachineInput } from '../MachineInput'
import { describe, test } from '@jest/globals'

// Generate 30,000 dummy Magic: The Gathering cards
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
  const re = RE2.compile(pattern)

  // === NFA BENCHMARK (Legacy) ===
  const startNFA = performance.now()
  let nfaMatches = 0
  for (let i = 0; i < cards.length; i++) {
    const input = MachineInput.fromUTF16(cards[i])
    if (re.doExecuteNFA(input, 0, RE2Flags.UNANCHORED, 0) !== null) {
      nfaMatches++
    }
  }
  const timeNFA = performance.now() - startNFA

  // === DFA BENCHMARK (New ASCII Fast-Path) ===
  const startDFA = performance.now()
  let dfaMatches = 0
  for (let i = 0; i < cards.length; i++) {
    const input = MachineInput.fromUTF16(cards[i])
    // Calling the DFA directly to bypass the executeEngine heuristic
    if (re.dfa.match(input, 0, RE2Flags.UNANCHORED) === true) {
      dfaMatches++
    }
  }
  const timeDFA = performance.now() - startDFA

  // === RESULTS ===
  const speedup = timeNFA / timeDFA
  // eslint-disable-next-line no-console
  console.log(`
--- Benchmarking: /${pattern}/ ---
NFA (Legacy) : ${timeNFA.toFixed(2)} ms (${nfaMatches} matches)
DFA (New)    : ${timeDFA.toFixed(2)} ms (${dfaMatches} matches)
Speedup      : ${speedup.toFixed(2)}x faster
  `)
}

describe('Performance Benchmark', () => {
  test.skip('Run benchmarks', () => {
    console.log('Generating 30,000 card database...\n') // eslint-disable-line no-console
    runBenchmark('Simple Literal', 'damage')
    runBenchmark('Wildcard', 'enters.*battlefield')
    runBenchmark('ReDoS Poison Pill', '^([a-zA-Z0-9]+\\s*)*$')
  })
})
