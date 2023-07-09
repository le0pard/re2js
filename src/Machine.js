/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
import { RE2Flags } from './RE2Flags'
import { MachineInputBase } from './MachineInput'
import { Utils } from './Utils'
import { Inst } from './Inst'

// A logical thread in the NFA.
class Thread {
  constructor(n) {
    this.inst = null
    this.cap = Array(n).fill(0)
  }
}

// A queue is a 'sparse array' holding pending threads of execution.  See:
// research.swtch.com/2008/03/using-uninitialized-memory-for-fun-and.html
class Queue {
  constructor() {
    this.sparse = [] // may contain stale but in-bounds values.
    this.densePcs = [] // may contain stale pc in slots >= size
    this.denseThreads = [] // may contain stale Thread in slots >= size
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
    this.sparse = []
    this.densePcs = []
    this.denseThreads = []
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
    m.pool = []
    m.poolSize = 0
    m.matched = false
    m.matchcap = Array(m.prog.numCap < 2 ? 2 : m.prog.numCap).fill(0)
    m.ncap = 0
    return m
  }

  static fromMachine(machine) {
    const m = new Machine()
    m.re2 = machine.re2
    m.prog = machine.prog
    m.q0 = machine.q0
    m.q1 = machine.q1
    m.pool = machine.pool
    m.poolSize = machine.poolSize
    m.matched = machine.matched
    m.matchcap = machine.matchcap
    m.ncap = machine.ncap
    return m
  }

  // init() reinitializes an existing Machine for re-use on a new input.
  init(ncap) {
    this.ncap = ncap
    if (ncap > this.matchcap.length) {
      this.initNewCap(ncap)
    } else {
      this.resetCap(ncap)
    }
  }

  resetCap(ncap) {
    for (let i = 0; i < this.poolSize; i++) {
      const t = this.pool[i]
      t.cap = Array(ncap).fill(0)
    }
  }

  initNewCap(ncap) {
    for (let i = 0; i < this.poolSize; i++) {
      const t = this.pool[i]
      t.cap = Array(ncap).fill(0)
    }
    this.matchcap = Array(ncap).fill(0)
  }

  submatches() {
    if (this.ncap === 0) {
      return Utils.emptyInts()
    }
    return this.matchcap.slice(0, this.ncap)
  }

  // alloc() allocates a new thread with the given instruction.
  // It uses the free pool if possible.
  alloc(inst) {
    let t
    if (this.poolSize > 0) {
      this.poolSize--
      t = this.pool[this.poolSize]
    } else {
      t = new Thread(this.matchcap.length)
    }
    t.inst = inst
    return t
  }

  // Frees all threads on the thread queue, returning them to the free pool.
  freeQueue(queue, from = 0) {
    const numberOfThread = queue.size - from
    const requiredPoolLength = this.poolSize + numberOfThread
    if (this.pool.length < requiredPoolLength) {
      this.pool = this.pool.slice(
        0,
        Math.max(this.pool.length * 2, requiredPoolLength)
      )
    }
    for (let i = from; i < queue.size; i++) {
      const t = queue.denseThreads[i]
      if (t !== null) {
        this.pool[this.poolSize] = t
        this.poolSize++
      }
    }
    queue.clear()
  }

  // freeThread() returns t to the free pool.
  freeThread(t) {
    if (this.pool.length <= this.poolSize) {
      this.pool = this.pool.slice(0, this.pool.length * 2)
    }
    this.pool[this.poolSize] = t
    this.poolSize++
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
    this.matchcap = Array(this.prog.numCap).fill(-1)

    let runq = this.q0
    let nextq = this.q1
    let r = input.step(pos)
    let rune = r >> 3
    let width = r & 7
    let rune1 = -1
    let width1 = 0
    if (r !== MachineInputBase.EOF()) {
      r = input.step(pos + width)
      rune1 = r >> 3
      width1 = r & 7
    }
    let flag
    if (pos === 0) {
      flag = Utils.emptyOpContext(-1, rune)
    } else {
      flag = input.context(pos)
    }
    while (true) {
      if (runq.isEmpty()) {
        if ((startCond & Utils.EMPTY_BEGIN_TEXT) !== 0 && pos !== 0) {
          break
        }
        if (this.matched) {
          break
        }
        if (
          !(this.re2.prefix.length === 0) &&
          rune1 !== this.re2.prefixRune &&
          input.canCheckPrefix()
        ) {
          const advance = input.index(this.re2, pos)
          if (advance < 0) {
            break
          }
          pos += advance
          r = input.step(pos)
          rune = r >> 3
          width = r & 7
          r = input.step(pos + width)
          rune1 = r >> 3
          width1 = r & 7
        }
      }
      if (!this.matched && (pos === 0 || anchor === RE2Flags.UNANCHORED)) {
        if (this.ncap > 0) {
          this.matchcap[0] = pos
        }
        this.add(runq, this.prog.start, pos, this.matchcap, flag, null)
      }
      const nextPos = pos + width
      flag = input.context(nextPos)
      this.step(runq, nextq, pos, nextPos, rune, flag, anchor, pos === input.endPos())
      if (width === 0) {
        break
      }
      if (this.ncap === 0 && this.matched) {
        break
      }
      pos += width
      rune = rune1
      width = width1
      if (rune !== -1) {
        r = input.step(pos + width)
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

  step(runq, nextq, pos, nextPos, c, nextCond, anchor, atEnd) {
    const longest = this.re2.longest
    for (let j = 0; j < runq.size; ++j) {
      let t = runq.denseThreads[j]
      if (t == null) {
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
              /* arraycopy */
              ; ((srcPts, srcOff, dstPts, dstOff, size) => {
                if (srcPts !== dstPts || dstOff >= srcOff + size) {
                  while (--size >= 0) {
                    dstPts[dstOff++] = srcPts[srcOff++]
                  }
                } else {
                  let tmp = srcPts.slice(srcOff, srcOff + size)
                  for (let i = 0; i < size; i++) {
                    dstPts[dstOff++] = tmp[i]
                  }
                }
              })(t.cap, 0, this.matchcap, 0, this.ncap)
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
          add = c !== '\n'.codePointAt(0)
          break
        default:
          throw new Error('bad inst')
      }
      if (add) {
        t = this.add(nextq, i.out, nextPos, t.cap, nextCond, t)
      }
      if (t != null) {
        this.freeThread(t)
        runq.denseThreads[j] = null
      }
    }
    runq.clear()
  }

  add(q, pc, pos, cap, cond, t) {
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
        break
      case Inst.ALT:
      case Inst.ALT_MATCH:
        t = this.add(q, inst.out, pos, cap, cond, t)
        t = this.add(q, inst.arg, pos, cap, cond, t)
        break
      case Inst.EMPTY_WIDTH:
        if ((inst.arg & ~cond) === 0) {
          t = this.add(q, inst.out, pos, cap, cond, t)
        }
        break
      case Inst.NOP:
        t = this.add(q, inst.out, pos, cap, cond, t)
        break
      case Inst.CAPTURE:
        if (inst.arg < this.ncap) {
          const opos = cap[inst.arg]
          cap[inst.arg] = pos
          this.add(q, inst.out, pos, cap, cond, null)
          cap[inst.arg] = opos
        } else {
          t = this.add(q, inst.out, pos, cap, cond, t)
        }
        break
      case Inst.MATCH:
      case Inst.RUNE:
      case Inst.RUNE1:
      case Inst.RUNE_ANY:
      case Inst.RUNE_ANY_NOT_NL:
        if (t == null) {
          t = this.alloc(inst)
        } else {
          t.inst = inst
        }
        if (this.ncap > 0 && t.cap !== cap) {
          /* arraycopy */ ;((srcPts, srcOff, dstPts, dstOff, size) => {
            if (srcPts !== dstPts || dstOff >= srcOff + size) {
              while (--size >= 0) {
                dstPts[dstOff++] = srcPts[srcOff++]
              }
            } else {
              let tmp = srcPts.slice(srcOff, srcOff + size)
              for (let i = 0; i < size; i++) {
                dstPts[dstOff++] = tmp[i]
              }
            }
          })(cap, 0, t.cap, 0, this.ncap)
        }
        q.denseThreads[d] = t
        t = null
        break
      default:
        throw new Error('unhandled')
    }
    return t
  }
}

export { Machine }
