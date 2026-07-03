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

  static fromMachine(machine) {
    return Machine.fromRE2(machine.re2)
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

  match(input, pos, anchor) {
    const startCond = this.re2.cond
    if (startCond === Utils.EMPTY_ALL) {
      return false
    }
    if ((anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) && pos !== 0) {
      return false
    }
    this.matched = false
    this.matchcap.fill(-1)

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

    let flag
    if (currentPos === 0) {
      flag = Utils.emptyOpContext(-1, rune)
    } else {
      flag = input.context(currentPos)
    }

    while (true) {
      if (runq.isEmpty()) {
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
        // Disable Prefix Acceleration if the regex contains lookbehinds
        // Fast-forwarding the string pointer will skip over the positions where
        // the parallel lookbehind automata need to be spawned.
        if (
          this.prog.numLb === 0 &&
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

      // Optimize lookbehind spawning. Because lookbehinds are prefixed with `.*` by the compiler,
      // they only need to be spawned exactly once at the beginning of the string (currentPos === 0).
      if (currentPos === 0 && this.prog.numLb > 0) {
        for (let i = 0; i < this.prog.lbStarts.length; i++) {
          this.add(runq, this.prog.lbStarts[i], currentPos, this.matchcap, 0, flag)
        }
      }

      if (!this.matched && (currentPos === 0 || anchor === RE2Flags.UNANCHORED)) {
        // ONLY spawn the main pattern if we have reached the requested search start boundary
        if (currentPos >= matchStartPos) {
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

    while (true) {
      if (runq.isEmpty()) {
        if ((startCond & Utils.EMPTY_BEGIN_TEXT) !== 0 && currentPos !== 0) break
        if (
          (anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) &&
          currentPos !== 0
        ) {
          break
        }
      }

      // Optimize lookbehind spawning to exactly once at BOF
      if (currentPos === 0 && this.prog.numLb > 0) {
        for (let i = 0; i < this.prog.lbStarts.length; i++) {
          this.add(runq, this.prog.lbStarts[i], currentPos, this.matchcap, 0, flag)
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

export { Machine }
