// Seeded pseudo-random numbers for the fuzzers (mulberry32). Every case is generated from its
// own seed, derived from the run's seed, so a failing case can be replayed on its own.

export const makeRandom = (seed) => {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n) => Math.floor(next() * n)
  return {
    next,
    int,
    pick: (items) => items[int(items.length)],
    chance: (p) => next() < p
  }
}

// The seed of case |index| of fuzzer |name| in a run with seed |seed| (FNV-1a)
export const caseSeed = (seed, name, index) => {
  let h = (0x811c9dc5 ^ seed) >>> 0
  for (const c of `${name}:${index}`) {
    h = Math.imul(h ^ c.charCodeAt(0), 0x01000193)
  }
  return h >>> 0
}
