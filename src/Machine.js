import { RE2Flags } from './RE2Flags'
import { Inst } from './Inst'
import { MachineInput } from './MachineInput'
import { Utils } from './Utils'

class Machine {
  // Thread class
  static Thread = class {
    constructor(n) {
      this.cap = new Array(n)
      this.inst = null
    }
  }

  // Queue class
  static Queue = class {
    constructor(n) {
      this.sparse = new Array(n)
      this.densePcs = new Array(n)
      this.denseThreads = new Array(n)
      this.size = 0
    }

    contains(pc) {
      let j = this.sparse[pc]
      return j < this.size && this.densePcs[j] === pc
    }

    isEmpty() {
      return this.size === 0
    }

    add(pc) {
      let j = this.size++
      this.sparse[pc] = j
      this.denseThreads[j] = null
      this.densePcs[j] = pc
      return j
    }

    clear() {
      this.size = 0
    }

    toString() {
      let out = '{'
      for (let i = 0; i < this.size; ++i) {
        if (i !== 0) {
          out += ', '
        }
        out += this.densePcs[i]
      }
      out += '}'
      return out
    }
  }

  constructor(re2) {
    this.prog = re2.prog
    this.re2 = re2
    this.q0 = new Machine.Queue(this.prog.numInst())
    this.q1 = new Machine.Queue(this.prog.numInst())
    this.matchcap = new Array(this.prog.numCap < 2 ? 2 : this.prog.numCap)
    this.pool = new Array(10)
    this.poolSize = 0
    this.matched = false
    this.ncap = 0
    this.next = null
  }

  // The methods init, resetCap, initNewCap, submatches, alloc, free, match, step, and add would follow
  // Here a skeleton is shown, you need to fill the logic inside

  init(ncap) {
    // length change need new arrays
    this.ncap = ncap
    if (ncap > this.matchcap.length) {
      this.initNewCap(ncap)
    } else {
      this.resetCap(ncap)
    }
  }

  resetCap(ncap) {
    // same size just reset to 0
    for (let i = 0; i < this.poolSize; i++) {
      let t = this.pool[i]
      t.cap.fill(0, 0, ncap)
    }
  }

  initNewCap(ncap) {
    for (let i = 0; i < this.poolSize; i++) {
      let t = this.pool[i]
      t.cap = new Array(ncap).fill(0)
    }
    this.matchcap = new Array(ncap).fill(0)
  }

  // Assuming that the `Utils` class has a static `EMPTY_INTS` constant in Java
  // which is an empty array, we will use `[]` for the same in JavaScript.
  submatches() {
    if (this.ncap === 0) {
      return Utils.EMPTY_INTS
    }
    return this.matchcap.slice(0, this.ncap) // Equivalent of Arrays.copyOf() in Java
  }

  // For the alloc() method, we assume the `Thread` class in Java is represented
  // as a JavaScript function or class. Here I'm using a function for the same.
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

  // For the free() method, we need the Queue class. This Queue class needs to
  // have a `size` property and `denseThreads` & `clear` methods. Here, I'm
  // assuming it's a class with those properties and methods.
  free(queue, from = 0) {
    let numberOfThread = queue.size - from
    let requiredPoolLength = this.poolSize + numberOfThread
    if (this.pool.length < requiredPoolLength) {
      // This operation expands the array if needed
      this.pool.length = Math.max(this.pool.length * 2, requiredPoolLength)
    }

    for (let i = from; i < queue.size; ++i) {
      let t = queue.denseThreads[i]
      if (t !== null) {
        this.pool[this.poolSize] = t
        this.poolSize++
      }
    }
    queue.clear()
  }

  match(inpt, pos, anchor) {
    let startCond = this.re2.cond
    if (startCond === Utils.EMPTY_ALL) { // impossible
      return false
    }
    if ((anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) && pos !== 0) {
      return false
    }
    this.matched = false
    this.matchcap.fill(-1, 0, this.prog.numCap)
    let runq = this.q0, nextq = this.q1
    let r = inpt.step(pos)
    let rune = r >> 3
    let width = r & 7
    let rune1 = -1
    let width1 = 0
    if (r !== MachineInput.EOF) {
      r = inpt.step(pos + width)
      rune1 = r >> 3
      width1 = r & 7
    }
    let flag // bitmask of EMPTY_* flags
    if (pos === 0) {
      flag = Utils.emptyOpContext(-1, rune)
    } else {
      flag = inpt.context(pos)
    }
    while (true) {
      if (runq.isEmpty()) {
        if ((startCond & Utils.EMPTY_BEGIN_TEXT) !== 0 && pos !== 0) {
          // Anchored match, past beginning of text.
          break
        }
        if (this.matched) {
          // Have match; finished exploring alternatives.
          break
        }
        if (!this.re2.prefix.isEmpty() && rune1 !== this.re2.prefixRune && inpt.canCheckPrefix()) {
          // Match requires literal prefix; fast search for it.
          let advance = inpt.index(this.re2, pos)
          if (advance < 0) {
            break
          }
          pos += advance
          r = inpt.step(pos)
          rune = r >> 3
          width = r & 7
          r = inpt.step(pos + width)
          rune1 = r >> 3
          width1 = r & 7
        }
      }
      if (!this.matched && (pos === 0 || anchor === RE2Flags.UNANCHORED)) {
        // If we are anchoring at begin then only add threads that begin
        // at |pos| = 0.
        if (this.ncap > 0) {
          this.matchcap[0] = pos
        }
        this.add(runq, this.prog.start, pos, this.matchcap, flag, null)
      }
      let nextPos = pos + width
      flag = inpt.context(nextPos)
      this.step(runq, nextq, pos, nextPos, rune, flag, anchor, pos === inpt.endPos())
      if (width === 0) { // EOF
        break
      }
      if (this.ncap === 0 && this.matched) {
        // Found a match and not paying attention
        // to where it is, so any match will do.
        break
      }
      pos += width
      rune = rune1
      width = width1
      if (rune !== -1) {
        r = inpt.step(pos + width)
        rune1 = r >> 3
        width1 = r & 7
      }
      let tmpq = runq
      runq = nextq
      nextq = tmpq
    }
    this.free(nextq)
    return this.matched
  }

  step(runq, nextq, pos, nextPos, c, nextCond, anchor, atEnd) {
    const longest = this.re2.longest
    for (let j = 0; j < runq.size; j++) {
      let t = runq.denseThreads[j]
      if (t === null) {
        continue
      }
      if (longest && this.matched && this.ncap > 0 && this.matchcap[0] < t.cap[0]) {
        this.free(t)
        continue
      }
      const i = t.inst
      let add = false
      switch (i.op) {
        case Inst.MATCH:
          if (anchor === RE2Flags.ANCHOR_BOTH && !atEnd) {
            // Don't match if we anchor at both start and end and those
            // expectations aren't met.
            break
          }
          if (this.ncap > 0 && (!longest || !this.matched || this.matchcap[1] < pos)) {
            t.cap[1] = pos
            t.cap.slice(0, this.ncap).forEach((val, index) => {
              this.matchcap[index] = val
            })
          }
          if (!longest) {
            this.free(runq, j + 1)
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
          add = c !== '\n'
          break

        default:
          throw new Error('bad inst')
      }
      if (add) {
        t = this.add(nextq, i.out, nextPos, t.cap, nextCond, t)
      }
      if (t !== null) {
        this.free(t)
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
      default:
        throw new Error('unhandled')

      case Inst.FAIL:
        break // nothing

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
        if (t === null) {
          t = this.alloc(inst)
        } else {
          t.inst = inst
        }
        if (this.ncap > 0 && t.cap !== cap) {
          cap.slice(0, this.ncap).forEach((val, index) => {
            t.cap[index] = val
          })
        }
        q.denseThreads[d] = t
        t = null
        break
    }
    return t
  }
}

export { Machine }
