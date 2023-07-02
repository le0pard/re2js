/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
import { RE2Flags } from './RE2Flags'
import { MachineInput } from './MachineInput'
import { Utils } from './Utils'
import { Inst } from './Inst'

export class Machine {
  constructor(re2) {
    if ((re2 != null && re2.constructor['__class'] === 'quickstart.RE2') || re2 === null) {
      let __args = arguments
      if (this.re2 === undefined) {
        this.re2 = null
      }
      if (this.prog === undefined) {
        this.prog = null
      }
      if (this.q0 === undefined) {
        this.q0 = null
      }
      if (this.q1 === undefined) {
        this.q1 = null
      }
      if (this.poolSize === undefined) {
        this.poolSize = 0
      }
      if (this.matched === undefined) {
        this.matched = false
      }
      if (this.matchcap === undefined) {
        this.matchcap = null
      }
      if (this.ncap === undefined) {
        this.ncap = 0
      }
      if (this.next === undefined) {
        this.next = null
      }
      this.pool = []
      this.prog = re2.prog
      this.re2 = re2
      this.q0 = new Machine.Queue(this.prog.numInst())
      this.q1 = new Machine.Queue(this.prog.numInst())
      this.matchcap = ((s) => {
        let a = []
        while (s-- > 0) {
          a.push(0)
        }
        return a
      })(this.prog.numCap < 2 ? 2 : this.prog.numCap)
    } else if ((re2 != null && re2 instanceof Machine) || re2 === null) {
      let __args = arguments
      let copy = __args[0]
      if (this.re2 === undefined) {
        this.re2 = null
      }
      if (this.prog === undefined) {
        this.prog = null
      }
      if (this.q0 === undefined) {
        this.q0 = null
      }
      if (this.q1 === undefined) {
        this.q1 = null
      }
      if (this.poolSize === undefined) {
        this.poolSize = 0
      }
      if (this.matched === undefined) {
        this.matched = false
      }
      if (this.matchcap === undefined) {
        this.matchcap = null
      }
      if (this.ncap === undefined) {
        this.ncap = 0
      }
      if (this.next === undefined) {
        this.next = null
      }
      this.pool = []
      this.re2 = copy.re2
      this.prog = copy.prog
      this.q0 = copy.q0
      this.q1 = copy.q1
      this.pool = copy.pool
      this.poolSize = copy.poolSize
      this.matched = copy.matched
      this.matchcap = copy.matchcap
      this.ncap = copy.ncap
    } else {
      throw new Error('invalid overload')
    }
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
      {
        const t = this.pool[i]
        /* fill */ ;((a, start, end, v) => {
          for (let i = start; i < end; i++) {
            a[i] = v
          }
        })(t.cap, 0, ncap, 0)
      }
    }
  }
  initNewCap(ncap) {
    for (let i = 0; i < this.poolSize; i++) {
      {
        const t = this.pool[i]
        t.cap = ((s) => {
          let a = []
          while (s-- > 0) {
            a.push(0)
          }
          return a
        })(ncap)
      }
    }
    this.matchcap = ((s) => {
      let a = []
      while (s-- > 0) {
        a.push(0)
      }
      return a
    })(ncap)
  }
  submatches() {
    if (this.ncap === 0) {
      return Utils.emptyInts()
    }
    return /* copyOf */ this.matchcap.slice(0, this.ncap)
  }
  alloc(inst) {
    let t
    if (this.poolSize > 0) {
      this.poolSize--
      t = this.pool[this.poolSize]
    } else {
      t = new Machine.Thread(this.matchcap.length)
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
    if (r !== MachineInput.EOF_$LI$()) {
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
        this.step(runq, nextq, pos, nextPos, rune, flag, anchor, pos == __in.endPos())
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
          /* arraycopy */ ((srcPts, srcOff, dstPts, dstOff, size) => {
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
Machine['__class'] = 'quickstart.Machine'
;(function(Machine) {
  class Thread {
    constructor(n) {
      if (this.cap === undefined) {
        this.cap = null
      }
      if (this.inst === undefined) {
        this.inst = null
      }
      this.cap = ((s) => {
        let a = []
        while (s-- > 0) {
          a.push(0)
        }
        return a
      })(n)
    }
  }
  Machine.Thread = Thread
  Thread['__class'] = 'quickstart.Machine.Thread'
  class Queue {
    constructor(n) {
      if (this.denseThreads === undefined) {
        this.denseThreads = null
      }
      if (this.densePcs === undefined) {
        this.densePcs = null
      }
      if (this.sparse === undefined) {
        this.sparse = null
      }
      if (this.size === undefined) {
        this.size = 0
      }
      this.sparse = ((s) => {
        let a = []
        while (s-- > 0) {
          a.push(0)
        }
        return a
      })(n)
      this.densePcs = ((s) => {
        let a = []
        while (s-- > 0) {
          a.push(0)
        }
        return a
      })(n)
      this.denseThreads = ((s) => {
        let a = []
        while (s-- > 0) {
          a.push(null)
        }
        return a
      })(n)
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
      this.size = 0
    }
    /**
     *
     * @return {string}
     */
    toString() {
      let out = '{'
      for (let i = 0; i < this.size; ++i) {
        {
          if (i !== 0) {
            out += ', '
          }
          out += this.densePcs[i]
        }
      }
      out += '}'
      return out
    }
  }
  Machine.Queue = Queue
  Queue['__class'] = 'quickstart.Machine.Queue'
})(Machine || (Machine = {}))
