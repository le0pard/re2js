import { Codepoint } from './Codepoint.js'
import { RE2Flags } from './RE2Flags.js'
import { MachineInputBase } from './MachineInput.js'
import { RE2JSInternalException } from './exceptions.js'
import { Utils } from './Utils.js'
import { Inst } from './Inst.js'

// A logical thread in the NFA.
class Thread {
  constructor() {
    this.inst = null
    this.cap = null // Initialized to Int32Array later
  }
}

// A queue is a 'sparse array' holding pending threads of execution.  See:
// research.swtch.com/2008/03/using-uninitialized-memory-for-fun-and.html
class Queue {
  constructor(numInst) {
    this.sparse = new Int32Array(numInst) // may contain stale but in-bounds values.
    this.densePcs = new Int32Array(numInst) // may contain stale pc in slots >= size
    this.denseThreads = new Array(numInst) // may contain stale Thread in slots >= size
    this.size = 0
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
    this.denseThreads[j] = null
    this.densePcs[j] = pc
    return j
  }

  clear() {
    // Prevent memory leaks by nulling out used object references
    for (let i = 0; i < this.size; i++) {
      this.denseThreads[i] = null
    }
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
  static THREADS_CHUNK_SIZE = 128

  static fromRE2(re2) {
    const m = new Machine()
    m.prog = re2.prog
    m.re2 = re2
    m.q0 = new Queue(m.prog.numInst())
    m.q1 = new Queue(m.prog.numInst())
    m.pool = []
    m.poolSize = 0
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
    this.pool = []
    this.poolSize = 0
    this.matched = false
    this.matchcap = null
    this.ncap = 0
    this.lbTable = null
  }

  // init() reinitializes an existing Machine for re-use on a new input.
  init(ncap) {
    this.ncap = ncap
    if (ncap > this.matchcap.length) {
      this.initNewCap(ncap)
    } else {
      this.resetCap()
    }

    // Initialize the Lookbehind tracking table
    if (this.prog.numLb > 0) {
      if (!this.lbTable || this.lbTable.length < this.prog.numLb + 1) {
        this.lbTable = new Int32Array(this.prog.numLb + 1)
      }
      this.lbTable.fill(-1)
    }
  }

  // Wipes existing typed array memory without reallocating
  resetCap() {
    for (let i = 0; i < this.poolSize; i++) {
      const t = this.pool[i]
      t.cap.fill(-1)
    }
  }

  initNewCap(ncap) {
    for (let i = 0; i < this.poolSize; i++) {
      const t = this.pool[i]
      t.cap = new Int32Array(ncap).fill(-1)
    }
    this.matchcap = new Int32Array(ncap).fill(-1)
  }

  submatches() {
    if (this.ncap === 0) {
      return Utils.emptyInts()
    }
    // Use subarray() to create a zero-allocation view before converting
    return Utils.toArray(this.matchcap.subarray(0, this.ncap))
  }

  // alloc() allocates a new thread with the given instruction.
  // It uses the free pool if possible.
  alloc(inst) {
    if (this.poolSize === 0) {
      const capLen = this.matchcap.length

      // Bulk allocate threads in a tight loop so the V8 engine
      // places them adjacently in the young generation heap
      for (let i = 0; i < Machine.THREADS_CHUNK_SIZE; i++) {
        const t = new Thread()
        t.cap = new Int32Array(capLen)
        this.pool[this.poolSize++] = t
      }
    }

    // Pop a thread from the top of the pool stack
    this.poolSize--
    const t = this.pool[this.poolSize]
    t.inst = inst
    return t
  }

  // Frees all threads on the thread queue, returning them to the free pool.
  freeQueue(queue, from = 0) {
    for (let i = from; i < queue.size; i++) {
      const t = queue.denseThreads[i]
      if (t !== null) {
        this.pool[this.poolSize++] = t
      }
    }
    queue.clear()
  }

  // freeThread() returns t to the free pool.
  freeThread(t) {
    this.pool[this.poolSize++] = t
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
        }
      }

      // Optimize lookbehind spawning. Because lookbehinds are prefixed with `.*` by the compiler,
      // they only need to be spawned exactly once at the beginning of the string (currentPos === 0).
      if (currentPos === 0 && this.prog.numLb > 0) {
        for (let i = 0; i < this.prog.lbStarts.length; i++) {
          this.add(runq, this.prog.lbStarts[i], currentPos, this.matchcap, flag, null)
        }
      }

      if (!this.matched && (currentPos === 0 || anchor === RE2Flags.UNANCHORED)) {
        // ONLY spawn the main pattern if we have reached the requested search start boundary
        if (currentPos >= matchStartPos) {
          if (this.ncap > 0) {
            this.matchcap[0] = currentPos
          }
          this.add(runq, this.prog.start, currentPos, this.matchcap, flag, null)
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
    this.freeQueue(nextq)
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
          this.add(runq, this.prog.lbStarts[i], currentPos, this.matchcap, flag, null)
        }
      }

      if (currentPos === 0 || anchor === RE2Flags.UNANCHORED) {
        // ONLY spawn the main pattern if we have reached the requested search start boundary
        if (currentPos >= matchStartPos) {
          this.add(runq, this.prog.start, currentPos, this.matchcap, flag, null)
        }
      }

      const nextPos = currentPos + width
      flag = input.context(nextPos)

      for (let j = 0; j < runq.size; j++) {
        let t = runq.denseThreads[j]
        if (t === null) continue

        const i = t.inst
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
            add = rune !== Codepoint.CODES.get('\n')
            break
          default:
            throw new RE2JSInternalException('bad inst')
        }
        if (add) {
          t = this.add(nextq, i.out, nextPos, t.cap, flag, t)
        }
        if (t !== null) {
          this.freeThread(t)
          runq.denseThreads[j] = null
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
    this.freeQueue(nextq)
    return Array.from(matches).sort((a, b) => a - b)
  }

  step(runq, nextq, pos, nextPos, c, nextCond, anchor, atEnd) {
    const longest = this.re2.longest
    for (let j = 0; j < runq.size; j++) {
      let t = runq.denseThreads[j]
      if (t === null) {
        continue
      }
      if (longest && this.matched && this.ncap > 0 && this.matchcap[0] < t.cap[0]) {
        this.freeThread(t)
        continue
      }

      const i = t.inst
      let add = false
      switch (i.op) {
        case Inst.MATCH:
          if (anchor === RE2Flags.ANCHOR_BOTH && !atEnd) {
            break
          }
          if (this.ncap > 0 && (!longest || !this.matched || this.matchcap[1] < pos)) {
            t.cap[1] = pos
            // Using subarray creates a fast view, avoiding a full array copy
            // until the submatches are finalized at the very end.
            this.matchcap.set(t.cap.subarray(0, this.ncap))
          }
          if (!longest) {
            this.freeQueue(runq, j + 1)
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
          add = c !== Codepoint.CODES.get('\n')
          break
        default:
          throw new RE2JSInternalException('bad inst')
      }
      if (add) {
        t = this.add(nextq, i.out, nextPos, t.cap, nextCond, t)
      }
      if (t !== null) {
        this.freeThread(t)
        runq.denseThreads[j] = null
      }
    }
    runq.clear()
  }

  add(q, pc, pos, cap, cond, t) {
    while (true) {
      if (pc === 0) {
        return t
      }
      if (q.contains(pc)) {
        return t
      }

      const d = q.add(pc)
      const inst = this.prog.inst[pc]
      switch (inst.op) {
        case Inst.FAIL:
          return t
        case Inst.ALT:
        case Inst.ALT_MATCH:
          t = this.add(q, inst.out, pos, cap, cond, t)
          pc = inst.arg // Flattened tail recursion
          continue
        case Inst.EMPTY_WIDTH:
          if ((inst.arg & ~cond) === 0) {
            pc = inst.out // Flattened tail recursion
            continue
          }
          return t
        case Inst.NOP:
          pc = inst.out // Flattened tail recursion
          continue
        case Inst.CAPTURE:
          if (inst.arg < this.ncap) {
            const opos = cap[inst.arg]
            cap[inst.arg] = pos
            this.add(q, inst.out, pos, cap, cond, null)
            cap[inst.arg] = opos
            return t
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
          return t
        case Inst.MATCH:
        case Inst.RUNE:
        case Inst.RUNE1:
        case Inst.RUNE_ANY:
        case Inst.RUNE_ANY_NOT_NL:
          if (t === null) {
            t = this.alloc(inst)
          } else {
            t.inst = inst
          }
          if (this.ncap > 0 && t.cap !== cap) {
            // Direct assignment utilizing Typed Array performance
            for (let c = 0; c < this.ncap; c++) {
              t.cap[c] = cap[c]
            }
          }
          q.denseThreads[d] = t
          t = null
          return t
        default:
          throw new Error('unhandled')
      }
    }
  }
}

export { Machine }
