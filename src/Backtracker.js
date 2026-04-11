import { Inst } from './Inst'
import { MachineInputBase } from './MachineInput'
import { Utils } from './Utils'
import { RE2Flags } from './RE2Flags'

const VISITED_BITS = 32
const MAX_BACKTRACK_PROG = 500
const MAX_BACKTRACK_VECTOR = 256 * 1024

class BitState {
  constructor() {
    this.end = 0
    this.cap = new Int32Array(0)
    this.matchcap = new Int32Array(0)
    this.ncap = 0

    // Parallel arrays acting as the backtrack job stack
    this.jobPc = new Int32Array(256)
    this.jobArg = new Uint8Array(256)
    this.jobPos = new Int32Array(256)
    this.jobLen = 0

    this.visited = new Uint32Array(0)
  }

  reset(prog, end, ncap) {
    this.end = end
    this.jobLen = 0
    this.ncap = ncap

    const visitedSize = Math.floor((prog.numInst() * (end + 1) + VISITED_BITS - 1) / VISITED_BITS)
    if (this.visited.length < visitedSize) {
      this.visited = new Uint32Array(visitedSize)
    } else {
      this.visited.fill(0, 0, visitedSize)
    }

    if (this.cap.length < ncap) {
      // Must explicitly fill with -1 as Int32Array defaults to 0
      this.cap = new Int32Array(ncap).fill(-1)
    } else {
      this.cap.fill(-1, 0, ncap)
    }

    if (this.matchcap.length < ncap) {
      this.matchcap = new Int32Array(ncap).fill(-1)
    } else {
      this.matchcap.fill(-1, 0, ncap)
    }
  }

  shouldVisit(pc, pos) {
    const n = pc * (this.end + 1) + pos
    const idx = Math.floor(n / VISITED_BITS)
    const mask = 1 << (n & (VISITED_BITS - 1))
    if ((this.visited[idx] & mask) !== 0) {
      return false
    }
    this.visited[idx] |= mask
    return true
  }

  push(re2, pc, pos, arg) {
    if (re2.prog.getInst(pc).op !== Inst.FAIL && (arg || this.shouldVisit(pc, pos))) {
      if (this.jobLen >= this.jobPc.length) {
        const newSize = this.jobPc.length * 2

        const newPc = new Int32Array(newSize)
        newPc.set(this.jobPc)
        this.jobPc = newPc

        const newArg = new Uint8Array(newSize)
        newArg.set(this.jobArg)
        this.jobArg = newArg

        const newPos = new Int32Array(newSize)
        newPos.set(this.jobPos)
        this.jobPos = newPos
      }
      this.jobPc[this.jobLen] = pc
      this.jobArg[this.jobLen] = arg ? 1 : 0
      this.jobPos[this.jobLen] = pos
      this.jobLen++
    }
  }

  tryBacktrack(re2, input, pc, pos, anchor) {
    const longest = re2.longest
    this.push(re2, pc, pos, false)

    while (this.jobLen > 0) {
      this.jobLen--
      let currentPc = this.jobPc[this.jobLen]
      let arg = this.jobArg[this.jobLen] === 1
      let currentPos = this.jobPos[this.jobLen]

      let skipShouldVisit = true

      while (true) {
        if (!skipShouldVisit) {
          if (!this.shouldVisit(currentPc, currentPos)) {
            break
          }
        }
        skipShouldVisit = false

        const inst = re2.prog.getInst(currentPc)

        switch (inst.op) {
          case Inst.FAIL: {
            throw new Error('unexpected InstFail')
          }
          case Inst.ALT: {
            if (arg) {
              arg = false
              currentPc = inst.arg
              continue
            } else {
              this.push(re2, currentPc, currentPos, true)
              currentPc = inst.out
              continue
            }
          }
          case Inst.ALT_MATCH: {
            const outInst = re2.prog.getInst(inst.out)
            if (Inst.isRuneOp(outInst.op)) {
              this.push(re2, inst.arg, currentPos, false)
              currentPc = inst.out
              continue
            }
            this.push(re2, inst.out, this.end, false)
            currentPc = inst.arg
            continue
          }

          case Inst.RUNE: {
            const r = input.step(currentPos)
            if (r === MachineInputBase.EOF()) break
            if (!inst.matchRune(r >> 3)) break
            currentPos += r & 7
            currentPc = inst.out
            continue
          }

          case Inst.RUNE1: {
            const r = input.step(currentPos)
            if (r === MachineInputBase.EOF()) break
            if (r >> 3 !== inst.runes[0]) break
            currentPos += r & 7
            currentPc = inst.out
            continue
          }

          case Inst.RUNE_ANY_NOT_NL: {
            const r = input.step(currentPos)
            if (r === MachineInputBase.EOF()) break
            if (r >> 3 === 10) break
            currentPos += r & 7
            currentPc = inst.out
            continue
          }

          case Inst.RUNE_ANY: {
            const r = input.step(currentPos)
            if (r === MachineInputBase.EOF()) break
            currentPos += r & 7
            currentPc = inst.out
            continue
          }

          case Inst.CAPTURE: {
            if (arg) {
              this.cap[inst.arg] = currentPos
              break
            } else {
              if (inst.arg < this.ncap) {
                this.push(re2, currentPc, this.cap[inst.arg], true)
                this.cap[inst.arg] = currentPos
              }
              currentPc = inst.out
              continue
            }
          }
          case Inst.EMPTY_WIDTH: {
            const flag = input.context(currentPos)
            if ((inst.arg & ~flag) !== 0) break
            currentPc = inst.out
            continue
          }

          case Inst.NOP: {
            currentPc = inst.out
            continue
          }

          case Inst.MATCH: {
            if (anchor === RE2Flags.ANCHOR_BOTH && currentPos !== this.end) {
              break
            }
            if (this.ncap === 0) return true

            if (this.ncap > 1) {
              this.cap[1] = currentPos
            }

            const old = this.matchcap[1]
            if (old === -1 || (longest && currentPos > 0 && currentPos > old)) {
              this.matchcap.set(this.cap)
            }

            if (!longest) return true
            if (currentPos === this.end) return true
            break
          }
          default: {
            throw new Error('bad inst')
          }
        }
        break
      }
    }
    return longest && this.matchcap.length > 1 && this.matchcap[1] >= 0
  }
}

const bitStatePool = []

export class Backtracker {
  static shouldBacktrack(prog) {
    return prog.numInst() <= MAX_BACKTRACK_PROG
  }

  static maxBitStateLen(prog) {
    if (!Backtracker.shouldBacktrack(prog)) {
      return 0
    }
    return Math.floor(MAX_BACKTRACK_VECTOR / prog.numInst())
  }

  static execute(re2, input, pos, anchor, ncap) {
    const startCond = re2.cond
    if (startCond === Utils.EMPTY_ALL) {
      return null
    }

    if ((anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) && pos !== 0) {
      return null
    }

    if ((startCond & Utils.EMPTY_BEGIN_TEXT) !== 0 && pos !== 0) {
      return null
    }

    const b = bitStatePool.length > 0 ? bitStatePool.pop() : new BitState()
    const end = input.endPos()
    b.reset(re2.prog, end, ncap)

    let matched = false

    if (
      (startCond & Utils.EMPTY_BEGIN_TEXT) !== 0 ||
      anchor === RE2Flags.ANCHOR_START ||
      anchor === RE2Flags.ANCHOR_BOTH
    ) {
      if (b.ncap > 0) {
        b.cap[0] = pos
      }
      if (b.tryBacktrack(re2, input, re2.prog.start, pos, anchor)) {
        matched = true
      }
    } else {
      let width = -1
      for (; pos <= end && width !== 0; pos += width) {
        if (re2.prefix.length > 0) {
          const advance = input.index(re2, pos)
          if (advance < 0) {
            break
          }
          pos += advance
        }

        if (b.ncap > 0) {
          b.cap[0] = pos
        }
        if (b.tryBacktrack(re2, input, re2.prog.start, pos, anchor)) {
          matched = true
          break
        }
        const r = input.step(pos)
        width = r === MachineInputBase.EOF() ? 0 : r & 7
      }
    }

    if (!matched) {
      bitStatePool.push(b)
      return null
    }

    // Must slice so we don't accidentally leak trailing arrays from previously recycled typed arrays
    const result = ncap === 0 ? [] : Array.from(b.matchcap.subarray(0, ncap))
    bitStatePool.push(b)
    return result
  }
}
