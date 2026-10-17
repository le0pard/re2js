import { Inst } from './Inst.js'
import { RE2Flags } from './RE2Flags.js'
import { Unicode } from './Unicode.js'

// FNV-1a 32-bit hash for an array of integers.
// Extremely fast, allocates no memory, and produces good distribution.
const hashPCs = (pcs) => {
  let h = -2128831035 // 0x811c9dc5 (32-bit signed offset basis)
  for (let i = 0; i < pcs.length; i++) {
    h ^= pcs[i]
    h = Math.imul(h, 16777619) // 0x01000193 (FNV prime)
  }
  return h
}

// Zero-allocation array comparison for hash collision resolution
const arraysEqual = (a, b) => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

class DFAState {
  constructor(nfaStates, isMatch, matchIDs) {
    this.nfaStates = nfaStates // Int32Array of Instruction PCs
    this.isMatch = isMatch // Boolean
    this.matchIDs = matchIDs // Array of integers indicating which Set patterns matched
    // Transitions, indexed by rune class (see DFA.runeClass); one table per anchoring mode,
    // allocated on first use and charged to the memory budget.
    this.next = null
    this.nextAnchored = null
  }
}

// A lazily built DFA over the Unicode code points of the input.
//
// Transitions are indexed by rune class rather than by rune: the program's rune ranges split
// the code point space into intervals within which every instruction either matches all runes
// or none (RE2 does the same at byte level with Prog::ComputeByteMap), so a state needs one
// table entry per class instead of per character and no per-rune lookup structure.
//
// Memory is bounded like RE2's mem_budget_: every state and transition table is charged its
// approximate size against |maxMem|. When the budget is exhausted the cache is reset and the
// search goes on from the current state; if a search keeps exhausting the cache without making
// progress (RE2: fewer than 10 bytes per cached state since the last reset) it gives up and
// returns null, and the caller falls back to the NFA for that search only.
class DFA {
  // Approximate bytes charged per state (object, instruction list header, hash bucket entry)
  // and per transition table, on top of their elements.
  static STATE_OVERHEAD = 160
  static TABLE_OVERHEAD = 16
  // Bail out of a search when fewer than this many characters were processed per cached state
  // since the previous cache reset (RE2: 10 bytes per state).
  static PROGRESS_PER_STATE = 10

  // maxMem - the maximum memory in bytes to use for the DFA (default 8MB)
  constructor(prog, maxMem = 8388608) {
    this.prog = prog
    this.maxMem = maxMem
    this.stateCache = new Map() // hash(number) -> DFAState[]
    this.stateCount = 0
    this.startState = null
    // Structurally unsupported: empty-width assertions and lookbehinds depend on the position
    // in the input, which a state of this DFA does not track. The NFA handles those programs.
    this.failed = false
    for (let pc = 0; pc < prog.numInst(); pc++) {
      const op = prog.getInst(pc).op
      if (op === Inst.EMPTY_WIDTH || op === Inst.LB_WRITE || op === Inst.LB_CHECK) {
        this.failed = true
        break
      }
    }
    this.computeRuneClasses()
    this.stateBudget = maxMem
    this.memBudget = maxMem
  }

  // Splits the code point space at every boundary of every rune instruction, so that runes in
  // the same class are indistinguishable to the program. Case-insensitive literals contribute
  // their whole fold orbit, as Inst.matchRune compares against it.
  computeRuneClasses() {
    const bounds = new Set()
    const addRune = (r) => {
      bounds.add(r)
      bounds.add(r + 1)
    }
    for (let pc = 0; pc < this.prog.numInst(); pc++) {
      const inst = this.prog.getInst(pc)
      switch (inst.op) {
        case Inst.RUNE:
        case Inst.RUNE1:
          if (inst.runes.length === 1) {
            addRune(inst.runes[0])
            if ((inst.arg & RE2Flags.FOLD_CASE) !== 0) {
              for (
                let f = Unicode.simpleFold(inst.runes[0]);
                f !== inst.runes[0];
                f = Unicode.simpleFold(f)
              ) {
                addRune(f)
              }
            }
          } else {
            for (let j = 0; j < inst.runes.length; j += 2) {
              bounds.add(inst.runes[j])
              bounds.add(inst.runes[j + 1] + 1)
            }
          }
          break
        case Inst.RUNE_ANY_NOT_NL:
          addRune(10) // '\n'
          break
        default:
          break
      }
    }
    bounds.delete(0)
    this.classBounds = Int32Array.from(bounds).sort()
    this.numClasses = this.classBounds.length + 1
    // Precomputed classes for Latin-1 runes, the common case in the search loop.
    const latin1Class = new Int32Array(Unicode.MAX_LATIN1 + 1)
    for (let r = 0; r <= Unicode.MAX_LATIN1; r++) {
      latin1Class[r] = this.searchClass(r)
    }
    this.latin1Class = latin1Class
  }

  // Returns the class of rune |r|: the number of class boundaries at or below it.
  runeClass(r) {
    if (r <= Unicode.MAX_LATIN1) {
      return this.latin1Class[r]
    }
    return this.searchClass(r)
  }

  // Binary search of the class boundaries for rune |r|.
  searchClass(r) {
    const bounds = this.classBounds
    let lo = 0
    let hi = bounds.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (bounds[mid] <= r) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    return lo
  }

  // Follows epsilon (empty) transitions to find all reachable states without consuming a char
  computeClosure(pcs) {
    const closure = new Set()
    const stack = [...pcs]
    let isMatch = false
    const matchIDs = new Set()

    while (stack.length > 0) {
      const pc = stack.pop()
      if (closure.has(pc)) continue
      closure.add(pc)

      const inst = this.prog.getInst(pc)
      switch (inst.op) {
        case Inst.MATCH:
          isMatch = true
          matchIDs.add(inst.arg)
          break
        case Inst.ALT:
        case Inst.ALT_MATCH:
          stack.push(inst.out)
          stack.push(inst.arg)
          break
        case Inst.NOP:
        case Inst.CAPTURE:
          stack.push(inst.out)
          break
        case Inst.EMPTY_WIDTH:
        case Inst.LB_WRITE:
        case Inst.LB_CHECK:
          // Not representable in this DFA (see the constructor); the engine falls back to the NFA.
          return null
      }
    }

    const sortedPCs = Int32Array.from(closure).sort()
    const ids = Array.from(matchIDs).sort((a, b) => a - b)
    return { pcs: sortedPCs, isMatch, matchIDs: ids }
  }

  // Get or create a DFA state from a list of NFA PCs.
  // Returns null when the state would not fit in the memory budget (or the program is unsupported).
  getState(pcs) {
    const closureResult = this.computeClosure(pcs)
    if (!closureResult) return null

    const sortedPCs = closureResult.pcs
    const hash = hashPCs(sortedPCs)

    // Lookup hash bucket
    let bucket = this.stateCache.get(hash)
    if (bucket) {
      // Resolve potential hash collisions
      for (let i = 0; i < bucket.length; i++) {
        const state = bucket[i]
        if (arraysEqual(state.nfaStates, sortedPCs)) {
          return state
        }
      }
    }

    const cost = DFA.STATE_OVERHEAD + 4 * sortedPCs.length + 8 * closureResult.matchIDs.length
    if (this.memBudget < cost) {
      return null // out of memory: the caller resets the cache or gives up
    }
    this.memBudget -= cost

    if (!bucket) {
      bucket = []
      this.stateCache.set(hash, bucket)
    }
    const state = new DFAState(sortedPCs, closureResult.isMatch, closureResult.matchIDs)
    bucket.push(state)
    this.stateCount++
    return state
  }

  // Allocates the transition table of |state| for the given anchoring, charging the budget.
  // Returns null when it does not fit.
  allocTable(state, anchor) {
    const cost = DFA.TABLE_OVERHEAD + 8 * this.numClasses
    if (this.memBudget < cost) {
      return null
    }
    this.memBudget -= cost
    const table = new Array(this.numClasses).fill(null)
    if (anchor === RE2Flags.UNANCHORED) {
      state.next = table
    } else {
      state.nextAnchored = table
    }
    return table
  }

  // Drops every cached state and restores the budget (RE2: DFA::ResetCache).
  clearCache() {
    this.stateCache.clear()
    this.stateCount = 0
    this.startState = null
    this.memBudget = this.stateBudget
  }

  // Resets the cache and re-creates |current| so the search can continue from it. Returns the
  // re-created state, or null if even that does not fit.
  resetCache(current) {
    this.clearCache()
    return this.getState(current.nfaStates)
  }

  // Compute the next DFA state given a current state and a rune of class |cls|.
  // Returns null when the transition cannot be cached within the memory budget.
  step(state, cls, rune, anchor) {
    let table = anchor === RE2Flags.UNANCHORED ? state.next : state.nextAnchored
    if (table !== null) {
      const cached = table[cls]
      if (cached !== null) return cached
    } else {
      table = this.allocTable(state, anchor)
      if (table === null) return null
    }

    const nextPCs = []
    for (let i = 0; i < state.nfaStates.length; i++) {
      const pc = state.nfaStates[i]
      const inst = this.prog.getInst(pc)
      if (Inst.isRuneOp(inst.op) && inst.matchRune(rune)) {
        nextPCs.push(inst.out)
      }
    }

    if (anchor === RE2Flags.UNANCHORED) {
      nextPCs.push(this.prog.start)
    }

    const nextState = this.getState(nextPCs)
    if (nextState === null) return null

    table[cls] = nextState
    return nextState
  }

  // Returns the start state, creating it if needed; null if the program is unsupported or the
  // budget cannot hold it.
  start() {
    if (this.startState === null) {
      this.startState = this.getState([this.prog.start])
      if (this.startState === null && !this.failed) {
        // The cache is full (e.g. an earlier search gave up): start over with an empty one.
        this.clearCache()
        this.startState = this.getState([this.prog.start])
      }
    }
    return this.startState
  }

  // Runs the search loop from |state| over input[pos, endPos), calling onState(state, nextPos)
  // after each transition; onState returns true to stop with a result. Returns the result of
  // onState, |noMatch| when the input is exhausted, or null when the DFA gives up on this search.
  run(input, pos, anchor, state, onState, noMatch) {
    const endPos = input.endPos()
    const latin1Class = this.latin1Class
    let resetPos = -1
    let i = pos
    while (i < endPos) {
      const r = input.step(i)
      const rune = r >> 3
      const width = r & 7
      if (width === 0) break // prevent infinite loop on EOF

      const cls = rune <= Unicode.MAX_LATIN1 ? latin1Class[rune] : this.runeClass(rune)
      let next = anchor === RE2Flags.UNANCHORED && state.next !== null ? state.next[cls] : null
      if (next === null) {
        next = this.step(state, cls, rune, anchor)
        if (next === null) {
          // Out of memory. Give up if the cache keeps filling without progress, otherwise reset
          // it and continue from the current state (RE2: InlinedSearchLoop / ResetCache).
          if (resetPos >= 0 && i - resetPos < DFA.PROGRESS_PER_STATE * this.stateCount) {
            return null
          }
          resetPos = i
          state = this.resetCache(state)
          if (state === null) return null
          next = this.step(state, cls, rune, anchor)
          if (next === null) return null
        }
      }
      state = next
      i += width

      const result = onState(state, i)
      if (result !== null) return result

      // If we hit a dead end, and anchored, fail early
      if (state.nfaStates.length === 0 && anchor !== RE2Flags.UNANCHORED) {
        return noMatch
      }
    }
    return noMatch
  }

  // The hot loop: Execute the Lazy DFA. Returns true/false, or null to fall back to the NFA.
  match(input, pos, anchor) {
    if (this.failed) return null
    if ((anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) && pos !== 0) {
      return false
    }

    const startState = this.start()
    if (startState === null) return null

    const endPos = input.endPos()
    if (startState.isMatch && (anchor !== RE2Flags.ANCHOR_BOTH || pos === endPos)) {
      return true
    }

    return this.run(
      input,
      pos,
      anchor,
      startState,
      (state, nextPos) => {
        if (state.isMatch && (anchor !== RE2Flags.ANCHOR_BOTH || nextPos === endPos)) {
          return true
        }
        return null
      },
      false
    )
  }

  // The hot loop for evaluating Multi-Pattern Sets. Returns the sorted matching pattern ids,
  // or null to fall back to the NFA.
  matchSet(input, pos, anchor) {
    if (this.failed) return null
    if ((anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) && pos !== 0) {
      return []
    }

    const startState = this.start()
    if (startState === null) return null

    const endPos = input.endPos()
    const matches = new Set()
    const collect = (state, currentPos) => {
      if (state.isMatch && (anchor !== RE2Flags.ANCHOR_BOTH || currentPos === endPos)) {
        for (let k = 0; k < state.matchIDs.length; k++) {
          matches.add(state.matchIDs[k])
        }
      }
      return null // keep scanning: later positions may match other patterns
    }

    collect(startState, pos)
    const result = this.run(input, pos, anchor, startState, collect, false)
    if (result === null) return null

    return Array.from(matches).sort((a, b) => a - b)
  }
}

export { DFA }
