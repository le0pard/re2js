import { RE2JSDfaMemoryException } from './exceptions'
import { Inst } from './Inst'

class DFAState {
  constructor(id, nfaStates, isMatch) {
    this.id = id // Stringified NFA state list (e.g., "1,4,7")
    this.nfaStates = nfaStates // Array of Instruction PCs
    this.isMatch = isMatch // Boolean
    this.nextAscii = new Array(128).fill(null) // Flat array for blisteringly fast ASCII lookups (unanchored)
    this.nextMap = new Map() // Cache of Char -> DFAState
  }
}

export class DFA {
  constructor(prog) {
    this.prog = prog
    this.stateCache = new Map() // id -> DFAState
    this.startState = null
    this.stateLimit = 10000 // Prevent memory explosion (ReDoS protection)
  }

  // Follows epsilon (empty) transitions to find all reachable states without consuming a char
  computeClosure(pcs) {
    const closure = new Set()
    const stack = [...pcs]
    let isMatch = false

    while (stack.length > 0) {
      const pc = stack.pop()
      if (closure.has(pc)) continue
      closure.add(pc)

      const inst = this.prog.getInst(pc)
      switch (inst.op) {
        case Inst.MATCH:
          isMatch = true
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
        // The AUTO engine will seamlessly fall back to the NFA.
        case Inst.EMPTY_WIDTH:
          return null
      }
    }

    const sortedPCs = Array.from(closure).sort((a, b) => a - b)
    return { pcs: sortedPCs, isMatch }
  }

  // Get or create a DFA state from a list of NFA PCs
  getState(pcs) {
    const closureResult = this.computeClosure(pcs)
    if (!closureResult) return null // Bailout to NFA required

    const id = closureResult.pcs.join(',')
    if (this.stateCache.has(id)) {
      return this.stateCache.get(id)
    }

    // Safety: prevent memory exhaustion from state explosion
    if (this.stateCache.size > this.stateLimit) {
      throw new RE2JSDfaMemoryException('DFA_OUT_OF_MEMORY')
    }

    const state = new DFAState(id, closureResult.pcs, closureResult.isMatch)
    this.stateCache.set(id, state)
    return state
  }

  // Compute the next DFA state given a current state and a character
  step(state, charCode, anchor) {
    // OPTIMIZATION: ASCII Fast-Path
    if (anchor === 0 && charCode < 128) {
      const next = state.nextAscii[charCode]
      if (next !== null) {
        return next
      }
    } else {
      const key = charCode + (anchor === 0 ? 0 : 0x100000)
      if (state.nextMap.has(key)) {
        return state.nextMap.get(key)
      }
    }

    const nextPCs = []
    for (const pc of state.nfaStates) {
      const inst = this.prog.getInst(pc)
      if (Inst.isRuneOp(inst.op) && inst.matchRune(charCode)) {
        nextPCs.push(inst.out)
      }
    }

    if (anchor === 0) {
      nextPCs.push(this.prog.start)
    }

    const nextState = this.getState(nextPCs)
    // Cache the result
    if (anchor === 0 && charCode < 128) {
      state.nextAscii[charCode] = nextState
    } else {
      const key = charCode + (anchor === 0 ? 0 : 0x100000)
      state.nextMap.set(key, nextState)
    }

    return nextState
  }

  // The hot loop: Execute the Lazy DFA
  match(input, pos, anchor) {
    if ((anchor === 1 || anchor === 2) && pos !== 0) {
      return false
    }

    if (!this.startState) {
      this.startState = this.getState([this.prog.start])
      if (!this.startState) return null // Fallback to NFA
    }

    let endPos = input.endPos()
    let currentState = this.startState
    if (currentState.isMatch) {
      if (anchor === 2) {
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

      currentState = this.step(currentState, rune, anchor)

      // If we hit an unrecoverable DFA error or bailout, signal fallback
      if (currentState === null) return null

      if (currentState.isMatch) {
        if (anchor === 2) {
          if (i + width === endPos) return true
        } else {
          return true
        }
      }

      // If we hit a dead end, and anchored, fail early
      if (currentState.nfaStates.length === 0) {
        if (anchor !== 0) return false
      }
      i += width
    }

    return false
  }
}
