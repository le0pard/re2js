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

  free$quickstart_Machine_Queue(queue) {
    this.free$quickstart_Machine_Queue$int(queue, 0)
  }

  free$quickstart_Machine_Queue$int(queue, from) {
    const numberOfThread = queue.size - from
    const requiredPoolLength = this.poolSize + numberOfThread
    if (this.pool.length < requiredPoolLength) {
      this.pool = /* copyOf */ this.pool.slice(
        0,
        Math.max(this.pool.length * 2, requiredPoolLength)
      )
    }
    for (let i = from; i < queue.size; ++i) {
      {
        const t = queue.denseThreads[i]
        if (t != null) {
          this.pool[this.poolSize] = t
          this.poolSize++
        }
      }
    }
    queue.clear()
  }

  free(queue, from) {
    if (
      ((queue != null && queue instanceof Machine.Queue) || queue === null) &&
      (typeof from === 'number' || from === null)
    ) {
      return this.free$quickstart_Machine_Queue$int(queue, from)
    } else if (
      ((queue != null && queue instanceof Machine.Queue) || queue === null) &&
      from === undefined
    ) {
      return this.free$quickstart_Machine_Queue(queue)
    } else if (
      ((queue != null && queue instanceof Machine.Thread) || queue === null) &&
      from === undefined
    ) {
      return this.free$quickstart_Machine_Thread(queue)
    } else {
      throw new Error('invalid overload')
    }
  }

  free$quickstart_Machine_Thread(t) {
    if (this.pool.length <= this.poolSize) {
      this.pool = /* copyOf */ this.pool.slice(0, this.pool.length * 2)
    }
    this.pool[this.poolSize] = t
    this.poolSize++
  }

  match(__in, pos, anchor) {
    const startCond = this.re2.cond
    if (startCond === Utils.EMPTY_ALL) {
      return false
    }
    if ((anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) && pos !== 0) {
      return false
    }
    this.matched = false
    /* fill */
    ;((a, start, end, v) => {
      for (let i = start; i < end; i++) {
        a[i] = v
      }
    })(this.matchcap, 0, this.prog.numCap, -1)

    let runq = this.q0
    let nextq = this.q1
    let r = __in.step(pos)
    let rune = r >> 3
    let width = r & 7
    let rune1 = -1
    let width1 = 0
    if (r !== MachineInputBase.EOF()) {
      r = __in.step(pos + width)
      rune1 = r >> 3
      width1 = r & 7
    }
    let flag
    if (pos === 0) {
      flag = Utils.emptyOpContext(-1, rune)
    } else {
      flag = __in.context(pos)
    }
    for (;;) {
      {
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
            __in.canCheckPrefix()
          ) {
            const advance = __in.index(this.re2, pos)
            if (advance < 0) {
              break
            }
            pos += advance
            r = __in.step(pos)
            rune = r >> 3
            width = r & 7
            r = __in.step(pos + width)
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
        flag = __in.context(nextPos)
        this.step(runq, nextq, pos, nextPos, rune, flag, anchor, pos === __in.endPos())
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
          r = __in.step(pos + width)
          rune1 = r >> 3
          width1 = r & 7
        }
        const tmpq = runq
        runq = nextq
        nextq = tmpq
      }
    }
    this.free$quickstart_Machine_Queue(nextq)
    return this.matched
  }

  step(runq, nextq, pos, nextPos, c, nextCond, anchor, atEnd) {
    const longest = this.re2.longest
    for (let j = 0; j < runq.size; ++j) {
      {
        let t = runq.denseThreads[j]
        if (t == null) {
          continue
        }
        if (longest && this.matched && this.ncap > 0 && this.matchcap[0] < t.cap[0]) {
          this.free$quickstart_Machine_Thread(t)
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
              ;((srcPts, srcOff, dstPts, dstOff, size) => {
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
              this.free$quickstart_Machine_Queue$int(runq, j + 1)
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
            throw Object.defineProperty(new Error('bad inst'), '__classes', {
              configurable: true,
              value: [
                'java.lang.Throwable',
                'java.lang.IllegalStateException',
                'java.lang.Object',
                'java.lang.RuntimeException',
                'java.lang.Exception'
              ]
            })
        }
        if (add) {
          t = this.add(nextq, i.out, nextPos, t.cap, nextCond, t)
        }
        if (t != null) {
          this.free$quickstart_Machine_Thread(t)
          runq.denseThreads[j] = null
        }
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
      default:
        throw Object.defineProperty(new Error('unhandled'), '__classes', {
          configurable: true,
          value: [
            'java.lang.Throwable',
            'java.lang.IllegalStateException',
            'java.lang.Object',
            'java.lang.RuntimeException',
            'java.lang.Exception'
          ]
        })
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
    }
    return t
  }
}

export { Machine }
