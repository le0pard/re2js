import { describe, bench, test, expect } from 'vitest'
import { RE2JS } from '../index.js'

let RE2Node = null
try {
  // eslint-disable-next-line import/no-unresolved
  const re2Module = await import('re2')
  RE2Node = re2Module.default || re2Module
} catch {
  // eslint-disable-next-line no-console
  console.warn('\n⚠️  "re2" (C++ binding) is not installed. Skipping comparison benchmarks.')
  // eslint-disable-next-line no-console
  console.warn('👉 To run comparisons: yarn add -D re2 && yarn bench\n')
}

// Generate 30,000 dummy Magic: The Gathering cards with more complex text
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

const patterns = [
  ['Simple Literal', 'damage'],
  ['Case Insensitive', '(?i)swamp'],
  [
    'Massive Alternation',
    'White|Blue|Black|Red|Green|Colorless|Artifact|Enchantment|Planeswalker|Instant|Sorcery'
  ],
  ['Greedy Wildcard', 'enters.*battlefield'],
  ['Lazy Wildcard', 'enters.*?battlefield'],
  ['Bounded Repetition', '[A-Z][a-z]{5,15}'],
  ['Deep State Machine', '([0-9]+(/[0-9]+)+)'],
  ['Word Boundaries (NFA Fallback)', '\\b(Flying|First strike|vigilance)\\b'],
  ['ReDoS Attempt', '(a+)+!']
]

describe('Cross-Library Performance Benchmark: re2js vs re2-node', () => {
  for (const [name, pattern] of patterns) {
    describe(`Benchmark: ${name}`, () => {
      const re2js = RE2JS.compile(pattern)
      let re2node = null

      // Only instantiate if the C++ library was found
      if (RE2Node) re2node = new RE2Node(pattern)

      // Parity Check: Ensure they both find the exact same number of matches
      test.skipIf(!RE2Node)('Parity Check', () => {
        let re2jsMatches = 0
        let re2nodeMatches = 0
        for (let i = 0; i < cards.length; i++) {
          if (re2js.test(cards[i])) re2jsMatches++
          if (re2node.test(cards[i])) re2nodeMatches++
        }
        expect(re2jsMatches).toBe(re2nodeMatches)
      })

      // Vitest Benchmark for RE2JS
      bench('re2js', () => {
        for (let i = 0; i < cards.length; i++) {
          re2js.test(cards[i])
        }
      })

      // Vitest Benchmark for RE2-Node (C++)
      bench.skipIf(!RE2Node)('re2-node', () => {
        for (let i = 0; i < cards.length; i++) {
          re2node.test(cards[i])
        }
      })
    })
  }
})
