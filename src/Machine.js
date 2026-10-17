import { RE2Flags } from './RE2Flags.js'
import { MachineInputBase } from './MachineInput.js'
import { RE2JSInternalException } from './exceptions.js'
import { Utils } from './Utils.js'
import { Inst } from './Inst.js'

// The 'Thread' class wrapper has been entirely removed.
// In a single-threaded runtime environment like V8, allocating separate class objects
// for parallel paths causes significant Garbage Collection thrashing.
// A logical path is now tracked purely by its integer index (slot) inside the Queue's parallel arrays.

// A queue is a 'sparse array' holding pending threads of execution.  See:
// https://research.swtch.com/sparse
class Queue {
  constructor(numInst) {
    this.sparse = new Int32Array(numInst) // may contain stale but in-bounds values.
    this.densePcs = new Int32Array(numInst) // may contain stale pc in slots >= size
    this.denseCaps = null // Allocated on demand based on ncap
    this.size = 0
    this.ncap = 0
    // Number of queued instructions of the main pattern that can still consume input or report a
    // match. Lookbehind automata are excluded: they stay alive for the whole input and must never
    // keep a search running on their own.
    this.mainThreads = 0
  }

  init(ncap) {
    this.ncap = ncap
    const needed = this.densePcs.length * ncap
    if (!this.denseCaps || this.denseCaps.length < needed) {
      this.denseCaps = new Int32Array(needed)
    }
  }

  contains(pc) {
    const j = this.sparse[pc]
    return j < this.size && this.densePcs[j] === pc
  }

  isEmpty() {
    return this.size === 0
  }

  add(pc) {
    const j = this.size++
    this.sparse[pc] = j
    this.densePcs[j] = pc
    return j
  }

  clear() {
    // The sparse set logic safely ignores stale integers in Typed Arrays.
    this.size = 0
    this.mainThreads = 0
  }

  toString() {
    let out = '{'
    for (let i = 0; i < this.size; i++) {
      if (i !== 0) {
        out += ', '
      }
      out += this.densePcs[i]
    }
    out += '}'
    return out
  }
}

// Lookbehind state carried between successive searches over the same input.
//
// Lookbehinds are evaluated by automata that run in lockstep with the main pattern. Because they
// are prefixed with `.*?` (see Compiler.lookBehind) they must be started at the beginning of the
// input and observe every character before the position where the main pattern is searched for.
// Restarting them from offset 0 on every call makes a find() loop quadratic in the input length.
//
// Callers that search the same input repeatedly (Matcher, RE2.allMatches, RE2.replaceAllFunc) keep
// one LookbehindState instead. After each search it holds the live lookbehind threads and the
// lookbehind table at the position where that search started looking for the main pattern; the next
// search resumes from there whenever its own start position is not earlier. The state depends only on
// the program and the input text, so it stays valid for any later search over the same input.
class LookbehindState {
  constructor(prog) {
    // Input position of the saved threads, or -1 when nothing has been saved yet.
    this.pos = -1
    // Live lookbehind instruction pointers at |pos|, in queue (priority) order.
    this.pcs = new Int32Array(prog.numInst())
    this.size = 0
    // Copy of Machine.lbTable at |pos|.
    this.lbTable = new Int32Array(prog.numLb + 1)
  }

  reset() {
    this.pos = -1
    this.size = 0
  }
}

// A Machine matches an input string of Unicode characters against an
// RE2 instance using a simple NFA.
//
// Called by RE2.doExecute.
class Machine {
  static fromRE2(re2) {
    const m = new Machine()
    m.prog = re2.prog
    m.re2 = re2
    m.q0 = new Queue(m.prog.numInst())
    m.q1 = new Queue(m.prog.numInst())
    m.matched = false
    // Use Int32Array instead of standard JS array
    m.matchcap = new Int32Array(m.prog.numCap < 2 ? 2 : m.prog.numCap)
    m.ncap = 0
    return m
  }

  constructor() {
    this.prog = null
    this.re2 = null
    this.q0 = null
    this.q1 = null
    this.matched = false
    this.matchcap = null
    this.ncap = 0
    this.lbTable = null
  }

  // init() reinitializes an existing Machine for re-use on a new input.
  init(ncap) {
    this.ncap = ncap
    if (ncap > this.matchcap.length) {
      this.matchcap = new Int32Array(ncap).fill(-1)
    } else {
      this.matchcap.fill(-1)
    }

    this.q0.init(ncap)
    this.q1.init(ncap)

    // Initialize the Lookbehind tracking table
    if (this.prog.numLb > 0) {
      if (!this.lbTable || this.lbTable.length < this.prog.numLb + 1) {
        this.lbTable = new Int32Array(this.prog.numLb + 1)
      }
      this.lbTable.fill(-1)
    }
  }

  submatches() {
    if (this.ncap === 0) {
      return Utils.emptyInts()
    }
    // Use subarray() to create a zero-allocation view before converting
    return Utils.toArray(this.matchcap.subarray(0, this.ncap))
  }

  // Runs the NFA over |input| and reports whether the main pattern matched; submatches() returns
  // the capture positions afterwards. The search for the main pattern starts at |pos|. When the
  // program contains lookbehinds, their automata are either resumed from |lbState| (saved by an
  // earlier search over the same input) or started at the beginning of the input, and the state at
  // |pos| is saved back into |lbState| for the next search.
  match(input, pos, anchor, lbState = null) {
    const startCond = this.re2.cond
    if (startCond === Utils.EMPTY_ALL) {
      return false
    }
    if ((anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) && pos !== 0) {
      return false
    }
    this.matched = false
    this.matchcap.fill(-1)

    const hasLookbehinds = this.prog.numLb > 0
    // The main pattern is only spawned once the scan reaches the requested start position.
    const matchStartPos = pos
    // Lookbehind automata must have observed every character before matchStartPos. Resume them
    // from the saved state when it is not past the requested start, otherwise start them at the
    // beginning of the input.
    let currentPos = pos
    let resumeLookbehinds = false
    if (hasLookbehinds) {
      if (lbState !== null && lbState.pos >= 0 && lbState.pos <= pos) {
        currentPos = lbState.pos
        resumeLookbehinds = true
      } else {
        currentPos = 0
      }
    }
    let saveLookbehinds = hasLookbehinds && lbState !== null

    let runq = this.q0
    let nextq = this.q1
    let r = input.step(currentPos)
    let rune = r >> 3
    let width = r & 7
    let rune1 = -1
    let width1 = 0

    if (r !== MachineInputBase.EOF()) {
      r = input.step(currentPos + width)
      rune1 = r >> 3
      width1 = r & 7
    }

    let flag
    if (currentPos === 0) {
      flag = Utils.emptyOpContext(-1, rune)
    } else {
      flag = input.context(currentPos)
    }

    // Lookbehind threads are queued before any main-pattern thread. The main pattern relies on this
    // order: lookbehind writes for a position happen before the checks that read them, and a match
    // only cuts off the lower-priority threads that follow it in the queue.
    if (hasLookbehinds) {
      if (resumeLookbehinds) {
        this.restoreLookbehinds(lbState, runq, flag)
      } else {
        this.spawnLookbehinds(runq, currentPos, flag)
      }
    }

    while (true) {
      // Only the main pattern's threads decide whether the search may stop or skip ahead; the
      // lookbehind automata stay alive until the end of the input.
      if (runq.mainThreads === 0) {
        if ((startCond & Utils.EMPTY_BEGIN_TEXT) !== 0 && currentPos !== 0) {
          break
        }
        if (
          (anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) &&
          currentPos !== 0
        ) {
          break
        }
        if (this.matched) {
          break
        }
        // Prefix acceleration jumps the string pointer to the next occurrence of the literal prefix.
        // It is disabled when the regex contains lookbehinds, whose automata must observe every
        // character, and it requires a completely empty queue: stale epsilon entries would shadow
        // the threads spawned at the new position.
        if (
          this.prog.numLb === 0 &&
          runq.isEmpty() &&
          !(this.re2.prefix.length === 0) &&
          rune1 !== this.re2.prefixRune &&
          input.canCheckPrefix()
        ) {
          const advance = input.index(this.re2, currentPos)
          if (advance < 0) {
            break
          }
          currentPos += advance
          r = input.step(currentPos)
          rune = r >> 3
          width = r & 7
          r = input.step(currentPos + width)
          rune1 = r >> 3
          width1 = r & 7
          flag = input.context(currentPos)
        }
      }

      // ONLY spawn the main pattern once we have reached the requested search start boundary
      if (currentPos >= matchStartPos) {
        if (saveLookbehinds) {
          this.saveLookbehinds(lbState, runq, currentPos)
          saveLookbehinds = false
        }
        if (!this.matched && (currentPos === 0 || anchor === RE2Flags.UNANCHORED)) {
          if (this.ncap > 0) {
            this.matchcap[0] = currentPos
          }
          this.add(runq, this.prog.start, currentPos, this.matchcap, 0, flag)
        }
      }

      const nextPos = currentPos + width
      flag = input.context(nextPos)
      this.step(runq, nextq, currentPos, nextPos, rune, flag, anchor, currentPos === input.endPos())

      if (width === 0) {
        break
      }
      if (this.ncap === 0 && this.matched) {
        break
      }

      currentPos += width
      rune = rune1
      width = width1
      if (rune !== -1) {
        r = input.step(currentPos + width)
        rune1 = r >> 3
        width1 = r & 7
      }
      const tmpq = runq
      runq = nextq
      nextq = tmpq
    }
    // The search may stop while lookbehind threads are still queued.
    runq.clear()
    nextq.clear()
    return this.matched
  }

  matchSet(input, pos, anchor) {
    const startCond = this.re2.cond
    if (startCond === Utils.EMPTY_ALL) return []
    if ((anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) && pos !== 0) {
      return []
    }

    // Lookbehinds must scan from the beginning of the string to build their state table,
    // even if the main pattern search is requested to start mid-string.
    let currentPos = this.prog.numLb > 0 ? 0 : pos
    let matchStartPos = pos

    let runq = this.q0
    let nextq = this.q1
    let r = input.step(currentPos)
    let rune = r >> 3
    let width = r & 7
    let rune1 = -1
    let width1 = 0

    if (r !== MachineInputBase.EOF()) {
      r = input.step(currentPos + width)
      rune1 = r >> 3
      width1 = r & 7
    }

    let flag = currentPos === 0 ? Utils.emptyOpContext(-1, rune) : input.context(currentPos)
    const matches = new Set()

    if (this.prog.numLb > 0) {
      this.spawnLookbehinds(runq, currentPos, flag)
    }

    while (true) {
      if (runq.mainThreads === 0) {
        if ((startCond & Utils.EMPTY_BEGIN_TEXT) !== 0 && currentPos !== 0) break
        if (
          (anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) &&
          currentPos !== 0
        ) {
          break
        }
      }

      if (currentPos === 0 || anchor === RE2Flags.UNANCHORED) {
        // ONLY spawn the main pattern if we have reached the requested search start boundary
        if (currentPos >= matchStartPos) {
          this.add(runq, this.prog.start, currentPos, this.matchcap, 0, flag)
        }
      }

      const nextPos = currentPos + width
      flag = input.context(nextPos)

      for (let j = 0; j < runq.size; j++) {
        const pc = runq.densePcs[j]
        const i = this.prog.inst[pc]
        const capOffset = j * this.ncap

        let add = false
        switch (i.op) {
          case Inst.MATCH:
            if (anchor === RE2Flags.ANCHOR_BOTH && currentPos !== input.endPos()) break
            matches.add(i.arg) // Record the matched Set ID
            break
          case Inst.RUNE:
            add = i.matchRune(rune)
            break
          case Inst.RUNE1:
            add = rune === i.runes[0]
            break
          case Inst.RUNE_ANY:
            add = true
            break
          case Inst.RUNE_ANY_NOT_NL:
            add = rune !== 10 // codepoint for '\n'
            break
          default:
            continue // Ignored by step, as handled by add()
        }
        if (add) {
          this.add(nextq, i.out, nextPos, runq.denseCaps, capOffset, flag)
        }
      }
      runq.clear()

      if (width === 0) break

      currentPos += width
      rune = rune1
      width = width1
      if (rune !== -1) {
        r = input.step(currentPos + width)
        rune1 = r >> 3
        width1 = r & 7
      }
      const tmpq = runq
      runq = nextq
      nextq = tmpq
    }
    nextq.clear()
    return Array.from(matches).sort((a, b) => a - b)
  }

  step(runq, nextq, pos, nextPos, c, nextCond, anchor, atEnd) {
    const longest = this.re2.longest
    for (let j = 0; j < runq.size; j++) {
      const pc = runq.densePcs[j]
      const capOffset = j * this.ncap

      if (
        longest &&
        this.matched &&
        this.ncap > 0 &&
        this.matchcap[0] < runq.denseCaps[capOffset]
      ) {
        continue
      }

      const i = this.prog.inst[pc]
      let add = false
      switch (i.op) {
        case Inst.MATCH:
          if (anchor === RE2Flags.ANCHOR_BOTH && !atEnd) {
            break
          }
          if (this.ncap > 0 && (!longest || !this.matched || this.matchcap[1] < pos)) {
            runq.denseCaps[capOffset + 1] = pos
            for (let k = 0; k < this.ncap; k++) {
              this.matchcap[k] = runq.denseCaps[capOffset + k]
            }
          }
          if (!longest) {
            // First-match mode: cut off all lower-priority threads.
            runq.size = 0 // Clear the queue by resetting size, skipping remaining items
          }

          this.matched = true
          break
        case Inst.RUNE:
          add = i.matchRune(c)
          break
        case Inst.RUNE1:
          add = c === i.runes[0]
          break
        case Inst.RUNE_ANY:
          add = true
          break
        case Inst.RUNE_ANY_NOT_NL:
          add = c !== 10 // codepoint for '\n'
          break
        default:
          continue // Ignored by step, as handled by add()
      }
      if (add) {
        this.add(nextq, i.out, nextPos, runq.denseCaps, capOffset, nextCond)
      }
    }
    runq.clear()
  }

  // Starts one automaton per lookbehind at |pos|. The compiler prefixes them with `.*?`, so a
  // single start is enough for them to begin matching at any later position.
  spawnLookbehinds(q, pos, flag) {
    for (let i = 0; i < this.prog.lbStarts.length; i++) {
      this.add(q, this.prog.lbStarts[i], pos, this.matchcap, 0, flag)
    }
  }

  // Re-queues the lookbehind threads recorded by saveLookbehinds(), in their original order.
  restoreLookbehinds(lbState, q, flag) {
    this.lbTable.set(lbState.lbTable)
    for (let j = 0; j < lbState.size; j++) {
      this.add(q, lbState.pcs[j], lbState.pos, this.matchcap, 0, flag)
    }
  }

  // Records the lookbehind threads of |q|, which holds the threads at |pos|, together with the
  // lookbehind table. Only rune instructions are kept: they are the complete live state, whereas
  // restoring epsilon entries would re-run their closures (LB_WRITE/LB_CHECK) out of order.
  saveLookbehinds(lbState, q, pos) {
    let size = 0
    for (let j = 0; j < q.size; j++) {
      const pc = q.densePcs[j]
      if (this.prog.lbInst[pc] === 1 && Inst.isRuneOp(this.prog.inst[pc].op)) {
        lbState.pcs[size++] = pc
      }
    }
    lbState.size = size
    lbState.pos = pos
    lbState.lbTable.set(this.lbTable)
  }

  add(q, pc, pos, capArray, capOffset, cond) {
    while (true) {
      if (pc === 0) {
        return
      }
      if (q.contains(pc)) {
        return
      }

      const d = q.add(pc)
      const inst = this.prog.inst[pc]
      switch (inst.op) {
        case Inst.FAIL:
          return
        case Inst.ALT:
        case Inst.ALT_MATCH:
          this.add(q, inst.out, pos, capArray, capOffset, cond)
          pc = inst.arg // Flattened tail recursion
          continue
        case Inst.EMPTY_WIDTH:
          if ((inst.arg & ~cond) === 0) {
            pc = inst.out // Flattened tail recursion
            continue
          }
          return
        case Inst.NOP:
          pc = inst.out // Flattened tail recursion
          continue
        case Inst.CAPTURE:
          if (inst.arg < this.ncap) {
            const opos = capArray[capOffset + inst.arg]
            capArray[capOffset + inst.arg] = pos
            this.add(q, inst.out, pos, capArray, capOffset, cond)
            capArray[capOffset + inst.arg] = opos
            return
          } else {
            pc = inst.out // Flattened tail recursion
            continue
          }
        case Inst.LB_WRITE:
          this.lbTable[Math.abs(inst.arg)] = pos
          pc = inst.out
          continue
        case Inst.LB_CHECK:
          if (inst.arg > 0) {
            // Positive Lookbehind
            if (this.lbTable[inst.arg] === pos) {
              pc = inst.out // Flattened tail recursion
              continue
            }
          } else if (this.lbTable[-inst.arg] !== pos) {
            // Negative Lookbehind
            pc = inst.out // Flattened tail recursion
            continue
          }
          return
        case Inst.MATCH:
        case Inst.RUNE:
        case Inst.RUNE1:
        case Inst.RUNE_ANY:
        case Inst.RUNE_ANY_NOT_NL:
          if (this.prog.lbInst[pc] === 0) {
            q.mainThreads++
          }
          if (this.ncap > 0) {
            // Direct assignment utilizing Typed Array performance
            const destOffset = d * this.ncap
            for (let c = 0; c < this.ncap; c++) {
              q.denseCaps[destOffset + c] = capArray[capOffset + c]
            }
          }
          return
        default:
          throw new RE2JSInternalException('unhandled')
      }
    }
  }
}

export { Machine, LookbehindState }
