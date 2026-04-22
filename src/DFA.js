import { Inst } from './Inst'
import { RE2Flags } from './RE2Flags'
import { Unicode } from './Unicode'

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
  constructor(nfaStates, isMatch, matchIDs = []) {
    this.nfaStates = nfaStates // Int32Array of Instruction PCs
    this.isMatch = isMatch // Boolean
    this.matchIDs = matchIDs // Array of integers indicating which Set patterns matched
    this.nextAscii = new Array(Unicode.MAX_ASCII + 1).fill(null) // Flat array for blisteringly fast ASCII lookups
    this.nextMap = new Map() // Cache of Char -> DFAState
    this.lastSeen = 0 // Track when this state was last used for LRU eviction
  }
}

class DFA {
  static MAX_CACHE_CLEARS = 5

  constructor(prog) {
    this.prog = prog
    this.stateCache = new Map() // hash(number) -> DFAState[]
    this.stateCount = 0 // Tracks total states for memory limits
    this.startState = null
    this.stateLimit = 10000 // Prevent memory explosion (ReDoS protection)
    this.cacheClears = 0 // Track thrashing
    this.failed = false // mark if DFA cannot work with provided prog
    this.clock = 0 // Global clock for LRU eviction
  }

  // Follows epsilon (empty) transitions to find all reachable states without consuming a char
  computeClosure(pcs) {
    const closure = new Set()
    const stack = [...pcs]
    let isMatch = false
    const matchIDs = []

    while (stack.length > 0) {
      const pc = stack.pop()
      if (closure.has(pc)) continue
      closure.add(pc)

      const inst = this.prog.getInst(pc)
      switch (inst.op) {
        case Inst.MATCH:
          isMatch = true
          if (!matchIDs.includes(inst.arg)) matchIDs.push(inst.arg)
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
        // Bailing out on complex empty-width assertions to keep DFA fast.
        // Engine will seamlessly fall back to the NFA.
        case Inst.EMPTY_WIDTH:
        case Inst.LB_WRITE:
        case Inst.LB_CHECK:
          return null
      }
    }

    const sortedPCs = Int32Array.from(closure).sort()
    matchIDs.sort((a, b) => a - b)
    return { pcs: sortedPCs, isMatch, matchIDs }
  }

  // Get or create a DFA state from a list of NFA PCs
  getState(pcs) {
    const closureResult = this.computeClosure(pcs)
    if (!closureResult) return null // Bailout to NFA required

    const sortedPCs = closureResult.pcs
    const hash = hashPCs(sortedPCs)

    // Lookup hash bucket
    let bucket = this.stateCache.get(hash)
    if (bucket) {
      // Resolve potential hash collisions
      for (let i = 0; i < bucket.length; i++) {
        const state = bucket[i]
        if (arraysEqual(state.nfaStates, sortedPCs)) {
          state.lastSeen = ++this.clock
          return state
        }
      }
    } else {
      bucket = []
      this.stateCache.set(hash, bucket)
    }

    // DFA already failed once - exit
    if (this.failed) return null

    // Safety: prevent memory exhaustion from state explosion
    // We prune the cache to keep the newest 50%
    if (this.stateCount >= this.stateLimit) {
      this.cacheClears++

      // If this regex causes continuous cache thrashing, permanently fall back to NFA
      // to avoid spending CPU cycles constantly rebuilding the DFA tree.
      if (this.cacheClears >= DFA.MAX_CACHE_CLEARS) {
        this.failed = true
        this.stateCache.clear()
        this.stateCount = 0
        this.startState = null
        return null
      }

      this.evictCache()

      // After eviction, the bucket reference might be stale or empty.
      // We must re-fetch or re-create the bucket.
      bucket = this.stateCache.get(hash)
      if (!bucket) {
        bucket = []
        this.stateCache.set(hash, bucket)
      }
    }

    // State not found, create it and add to bucket
    const state = new DFAState(sortedPCs, closureResult.isMatch, closureResult.matchIDs)
    state.lastSeen = ++this.clock
    bucket.push(state)
    this.stateCount++
    return state
  }

  evictCache() {
    const allStates = []
    for (const bucket of this.stateCache.values()) {
      for (let i = 0; i < bucket.length; i++) {
        allStates.push(bucket[i])
      }
    }

    // Sort ascending by lastSeen (oldest first)
    allStates.sort((a, b) => a.lastSeen - b.lastSeen)

    // Keep the newest 50%
    const keepCount = Math.floor(this.stateLimit / 2)
    const startIndex = allStates.length - keepCount
    const survivorsArray = allStates.slice(startIndex)
    const survivors = new Set(survivorsArray)

    this.stateCache.clear()
    this.stateCount = 0

    for (let i = 0; i < survivorsArray.length; i++) {
      const state = survivorsArray[i]

      // Sever ties to all states to prevent memory leaks and dangling pointers
      state.nextAscii.fill(null)
      state.nextMap.clear()

      const hash = hashPCs(state.nfaStates)
      let bucket = this.stateCache.get(hash)
      if (!bucket) {
        bucket = []
        this.stateCache.set(hash, bucket)
      }
      bucket.push(state)
      this.stateCount++
    }

    // Start state must either be preserved or nullified so it gets re-created
    if (this.startState && !survivors.has(this.startState)) {
      this.startState = null
    }
  }

  // Compute the next DFA state given a current state and a character
  step(state, charCode, anchor) {
    // OPTIMIZATION: ASCII Fast-Path
    if (anchor === RE2Flags.UNANCHORED && charCode <= Unicode.MAX_ASCII) {
      const next = state.nextAscii[charCode]
      if (next !== null) {
        return next
      }
    } else {
      const key = charCode + (anchor === RE2Flags.UNANCHORED ? 0 : Unicode.MAX_RUNE + 1)
      if (state.nextMap.has(key)) {
        return state.nextMap.get(key)
      }
    }

    const nextPCs = []
    for (let i = 0; i < state.nfaStates.length; i++) {
      const pc = state.nfaStates[i]
      const inst = this.prog.getInst(pc)
      if (Inst.isRuneOp(inst.op) && inst.matchRune(charCode)) {
        nextPCs.push(inst.out)
      }
    }

    if (anchor === RE2Flags.UNANCHORED) {
      nextPCs.push(this.prog.start)
    }

    const nextState = this.getState(nextPCs)

    // Cache the result
    if (anchor === RE2Flags.UNANCHORED && charCode <= Unicode.MAX_ASCII) {
      state.nextAscii[charCode] = nextState
    } else {
      const key = charCode + (anchor === RE2Flags.UNANCHORED ? 0 : Unicode.MAX_RUNE + 1)
      state.nextMap.set(key, nextState)
    }

    return nextState
  }

  // The hot loop: Execute the Lazy DFA
  match(input, pos, anchor) {
    if ((anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) && pos !== 0) {
      return false
    }

    if (!this.startState) {
      this.startState = this.getState([this.prog.start])
      if (!this.startState) return null // Fallback to NFA
    }

    let endPos = input.endPos()
    let currentState = this.startState
    if (currentState.isMatch) {
      if (anchor === RE2Flags.ANCHOR_BOTH) {
        if (pos === endPos) return true
      } else {
        return true
      }
    }

    let i = pos

    while (i < endPos) {
      const r = input.step(i)
      const rune = r >> 3
      const width = r & 7

      // prevent infinite loop on EOF
      if (width === 0) {
        break
      }

      currentState =
        (anchor === RE2Flags.UNANCHORED &&
          rune <= Unicode.MAX_ASCII &&
          currentState.nextAscii[rune]) ||
        this.step(currentState, rune, anchor)

      // If we hit an unrecoverable DFA error or bailout, signal fallback
      if (currentState === null) return null

      currentState.lastSeen = ++this.clock

      if (currentState.isMatch) {
        if (anchor === RE2Flags.ANCHOR_BOTH) {
          if (i + width === endPos) return true
        } else {
          return true
        }
      }

      // If we hit a dead end, and anchored, fail early
      if (currentState.nfaStates.length === 0) {
        if (anchor !== RE2Flags.UNANCHORED) return false
      }
      i += width
    }

    return false
  }

  // The hot loop for evaluating Multi-Pattern Sets
  matchSet(input, pos, anchor) {
    if ((anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) && pos !== 0) {
      return []
    }

    if (!this.startState) {
      this.startState = this.getState([this.prog.start])
      if (!this.startState) return null // Fallback to NFA
    }

    let endPos = input.endPos()
    let currentState = this.startState
    const matches = new Set()

    const checkMatch = (state, currentPos) => {
      if (state.isMatch) {
        if (anchor === RE2Flags.ANCHOR_BOTH) {
          if (currentPos === endPos) {
            state.matchIDs.forEach((id) => matches.add(id))
          }
        } else {
          state.matchIDs.forEach((id) => matches.add(id))
        }
      }
    }

    checkMatch(currentState, pos)

    let i = pos
    while (i < endPos) {
      const r = input.step(i)
      const rune = r >> 3
      const width = r & 7

      if (width === 0) break

      currentState =
        (anchor === RE2Flags.UNANCHORED &&
          rune <= Unicode.MAX_ASCII &&
          currentState.nextAscii[rune]) ||
        this.step(currentState, rune, anchor)

      if (currentState === null) return null // Bailout to NFA

      currentState.lastSeen = ++this.clock

      i += width
      checkMatch(currentState, i)

      if (currentState.nfaStates.length === 0) {
        if (anchor !== RE2Flags.UNANCHORED) break
      }
    }

    return Array.from(matches).sort((a, b) => a - b)
  }
}

export { DFA }
