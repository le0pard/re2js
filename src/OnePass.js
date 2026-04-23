import { Inst } from './Inst'
import { Unicode } from './Unicode'
import { RE2Flags } from './RE2Flags'
import { Utils } from './Utils'
import { MachineInputBase } from './MachineInput'
import { RE2JSInternalException } from './exceptions'

class QueueOnePass {
  constructor(size) {
    this.sparse = new Uint32Array(size)
    this.dense = new Uint32Array(size)
    this.size = 0
    this.nextIndex = 0
  }
  empty() {
    return this.nextIndex >= this.size
  }
  next() {
    return this.dense[this.nextIndex++]
  }
  clear() {
    this.size = 0
    this.nextIndex = 0
  }
  contains(u) {
    return u < this.sparse.length && this.sparse[u] < this.size && this.dense[this.sparse[u]] === u
  }
  insert(u) {
    if (!this.contains(u)) this.insertNew(u)
  }
  insertNew(u) {
    if (u >= this.sparse.length) return
    this.sparse[u] = this.size
    this.dense[this.size] = u
    this.size++
  }
}

const mergeRuneSets = (leftRunes, rightRunes, leftPC, rightPC) => {
  const leftLen = leftRunes.length
  const rightLen = rightRunes.length
  let lx = 0,
    rx = 0
  const merged = []
  const next = []
  let ok = true

  let ix = -1
  const extend = (isLeft) => {
    const newArray = isLeft ? leftRunes : rightRunes
    const low = isLeft ? lx : rx
    const pc = isLeft ? leftPC : rightPC

    if (ix > 0 && newArray[low] <= merged[ix]) return false

    merged.push(newArray[low], newArray[low + 1])
    if (isLeft) lx += 2
    else rx += 2
    ix += 2
    next.push(pc)
    return true
  }

  while (lx < leftLen || rx < rightLen) {
    if (rx >= rightLen) {
      ok = extend(true)
    } else if (lx >= leftLen) {
      ok = extend(false)
    } else if (rightRunes[rx] < leftRunes[lx]) {
      ok = extend(false)
    } else {
      ok = extend(true)
    }
    if (!ok) return null
  }
  return { merged, next }
}

class OnePassProg {
  constructor(prog) {
    this.start = prog.start
    this.numCap = prog.numCap
    this.inst = new Array(prog.inst.length)
    for (let i = 0; i < prog.inst.length; i++) {
      const orig = prog.inst[i]
      const inst = new Inst(orig.op)
      inst.out = orig.out
      inst.arg = orig.arg
      inst.runes = orig.runes ? orig.runes.slice() : []
      inst.next = null
      this.inst[i] = inst
    }
  }
}

const onePassCopy = (prog) => {
  const p = new OnePassProg(prog)

  // Rewrites one or more common Prog constructs that enable some otherwise
  // non-onepass Progs to be onepass.
  for (let pc = 0; pc < p.inst.length; pc++) {
    const inst = p.inst[pc]
    if (inst.op !== Inst.ALT && inst.op !== Inst.ALT_MATCH) continue

    let pAOther = 'out'
    let pAAlt = 'arg'

    let instAlt = p.inst[inst[pAAlt]]
    if (instAlt.op !== Inst.ALT && instAlt.op !== Inst.ALT_MATCH) {
      pAOther = 'arg'
      pAAlt = 'out'
      instAlt = p.inst[inst[pAAlt]]
      if (instAlt.op !== Inst.ALT && instAlt.op !== Inst.ALT_MATCH) continue
    }

    const instOther = p.inst[inst[pAOther]]
    if (instOther.op === Inst.ALT || instOther.op === Inst.ALT_MATCH) continue

    let pBAlt = 'out'
    let pBOther = 'arg'
    let patch = false

    if (instAlt.out === pc) {
      patch = true
    } else if (instAlt.arg === pc) {
      patch = true
      pBAlt = 'arg'
      pBOther = 'out'
    }

    if (patch) instAlt[pBAlt] = inst[pAOther]
    if (inst[pAOther] === instAlt[pBAlt]) inst[pAAlt] = instAlt[pBOther]
  }
  return p
}

const makeOnePass = (p) => {
  if (p.inst.length >= 1000) return null

  const instQueue = new QueueOnePass(p.inst.length)
  const visitQueue = new QueueOnePass(p.inst.length)
  const onePassRunes = new Array(p.inst.length)
  const m = new Array(p.inst.length).fill(false)

  const check = (pc) => {
    let ok = true
    const inst = p.inst[pc]
    if (visitQueue.contains(pc)) return true
    visitQueue.insert(pc)

    switch (inst.op) {
      case Inst.ALT:
      case Inst.ALT_MATCH: {
        ok = check(inst.out) && check(inst.arg)
        let matchOut = m[inst.out]
        let matchArg = m[inst.arg]
        if (matchOut && matchArg) return false

        if (matchArg) {
          const tempOut = inst.out
          inst.out = inst.arg
          inst.arg = tempOut
          const tempMatch = matchOut
          matchOut = matchArg
          matchArg = tempMatch
        }
        if (matchOut) {
          m[pc] = true
          inst.op = Inst.ALT_MATCH
        }

        const leftRunes = onePassRunes[inst.out] || []
        const rightRunes = onePassRunes[inst.arg] || []
        const mergeRes = mergeRuneSets(leftRunes, rightRunes, inst.out, inst.arg)

        if (!mergeRes) return false

        onePassRunes[pc] = mergeRes.merged
        inst.next = new Uint32Array(mergeRes.next)
        break
      }
      case Inst.CAPTURE:
      case Inst.EMPTY_WIDTH:
      case Inst.NOP: {
        ok = check(inst.out)
        m[pc] = m[inst.out]

        onePassRunes[pc] = onePassRunes[inst.out] ? onePassRunes[inst.out].slice() : []

        inst.next = new Uint32Array(Math.floor(onePassRunes[pc].length / 2) + 1).fill(inst.out)
        break
      }
      case Inst.MATCH:
      case Inst.FAIL: {
        m[pc] = inst.op === Inst.MATCH
        break
      }
      case Inst.RUNE: {
        m[pc] = false
        if (inst.next && inst.next.length > 0) break
        instQueue.insert(inst.out)
        if (!inst.runes || inst.runes.length === 0) {
          onePassRunes[pc] = []
          inst.next = new Uint32Array([inst.out])
          break
        }
        let runes = []
        if (inst.runes.length === 1 && (inst.arg & RE2Flags.FOLD_CASE) !== 0) {
          const r0 = inst.runes[0]
          runes.push(r0, r0)
          for (let r1 = Unicode.simpleFold(r0); r1 !== r0; r1 = Unicode.simpleFold(r1)) {
            runes.push(r1, r1)
          }
          runes.sort((a, b) => a - b)
        } else {
          for (let j = 0; j < inst.runes.length; j++) {
            runes.push(inst.runes[j])
          }
        }
        onePassRunes[pc] = runes
        inst.next = new Uint32Array(Math.floor(runes.length / 2) + 1).fill(inst.out)
        inst.op = Inst.RUNE
        break
      }
      case Inst.RUNE1: {
        m[pc] = false
        if (inst.next && inst.next.length > 0) break
        instQueue.insert(inst.out)
        let runes = []
        if ((inst.arg & RE2Flags.FOLD_CASE) !== 0) {
          const r0 = inst.runes[0]
          runes.push(r0, r0)
          for (let r1 = Unicode.simpleFold(r0); r1 !== r0; r1 = Unicode.simpleFold(r1)) {
            runes.push(r1, r1)
          }
          runes.sort((a, b) => a - b)
        } else {
          runes.push(inst.runes[0], inst.runes[0])
        }
        onePassRunes[pc] = runes
        inst.next = new Uint32Array(Math.floor(runes.length / 2) + 1).fill(inst.out)
        inst.op = Inst.RUNE
        break
      }
      case Inst.RUNE_ANY: {
        m[pc] = false
        if (inst.next && inst.next.length > 0) break
        instQueue.insert(inst.out)
        onePassRunes[pc] = [0, Unicode.MAX_RUNE]
        inst.next = new Uint32Array([inst.out])
        break
      }
      case Inst.RUNE_ANY_NOT_NL: {
        m[pc] = false
        if (inst.next && inst.next.length > 0) break
        instQueue.insert(inst.out)
        onePassRunes[pc] = [0, 9, 11, Unicode.MAX_RUNE] // \n is 10
        inst.next = new Uint32Array(Math.floor(onePassRunes[pc].length / 2) + 1).fill(inst.out)
        break
      }
    }
    return ok
  }

  instQueue.clear()
  instQueue.insert(p.start)

  while (!instQueue.empty()) {
    visitQueue.clear()
    const pc = instQueue.next()
    if (!check(pc)) return null
  }

  for (let i = 0; i < p.inst.length; i++) {
    if (onePassRunes[i]) p.inst[i].runes = onePassRunes[i]
  }
  return p
}

const cleanupOnePass = (p, original) => {
  for (let ix = 0; ix < original.inst.length; ix++) {
    const instOriginal = original.inst[ix]
    switch (instOriginal.op) {
      case Inst.ALT:
      case Inst.ALT_MATCH:
      case Inst.RUNE:
        break
      case Inst.CAPTURE:
      case Inst.EMPTY_WIDTH:
      case Inst.NOP:
      case Inst.MATCH:
      case Inst.FAIL:
        p.inst[ix].next = null
        break
      case Inst.RUNE1:
      case Inst.RUNE_ANY:
      case Inst.RUNE_ANY_NOT_NL:
        p.inst[ix].next = null
        p.inst[ix].op = instOriginal.op
        p.inst[ix].runes = instOriginal.runes ? instOriginal.runes.slice() : []
        break
    }
  }
}

export class OnePass {
  static compile(prog) {
    if (prog.start === 0) return null
    // OnePass cannot evaluate Lookbehinds
    if (prog.numLb > 0) return null

    const startInst = prog.inst[prog.start]
    // onepass regexps must be strictly anchored
    if (startInst.op !== Inst.EMPTY_WIDTH || (startInst.arg & Utils.EMPTY_BEGIN_TEXT) === 0) {
      return null
    }

    let hasAlt = false
    for (let i = 0; i < prog.inst.length; i++) {
      if (prog.inst[i].op === Inst.ALT || prog.inst[i].op === Inst.ALT_MATCH) {
        hasAlt = true
        break
      }
    }

    for (let i = 0; i < prog.inst.length; i++) {
      const inst = prog.inst[i]
      const opOut = prog.inst[inst.out].op
      switch (inst.op) {
        case Inst.ALT:
        case Inst.ALT_MATCH:
          if (opOut === Inst.MATCH || prog.inst[inst.arg].op === Inst.MATCH) {
            return null
          }
          break
        case Inst.EMPTY_WIDTH:
          if (opOut === Inst.MATCH) {
            if ((inst.arg & Utils.EMPTY_END_TEXT) === Utils.EMPTY_END_TEXT) {
              continue
            }
            return null
          }
          break
        default:
          if (opOut === Inst.MATCH && hasAlt) {
            return null
          }
          break
      }
    }

    let p = onePassCopy(prog)
    p = makeOnePass(p)
    if (p !== null) {
      cleanupOnePass(p, prog)
    }
    return p
  }

  static next(inst, r) {
    const nextIdx = inst.matchRunePos(r)
    if (nextIdx >= 0) return inst.next[nextIdx]
    if (inst.op === Inst.ALT_MATCH) return inst.out
    return 0 // fail
  }

  static execute(re2, input, pos, anchor, ncap) {
    const onepass = re2.onepass
    if (!onepass) return null

    const matchcap = new Int32Array(ncap).fill(-1)
    let matched = false

    let r = input.step(pos)
    let rune = r >> 3
    let width = r & 7
    let r1 = MachineInputBase.EOF()
    let rune1 = -1
    let width1 = 0

    if (r !== MachineInputBase.EOF()) {
      r1 = input.step(pos + width)
      if (r1 !== MachineInputBase.EOF()) {
        rune1 = r1 >> 3
        width1 = r1 & 7
      }
    }

    let flag = pos === 0 ? Utils.emptyOpContext(-1, rune) : input.context(pos)
    let pc = onepass.start
    let inst

    while (true) {
      inst = onepass.inst[pc]
      pc = inst.out

      switch (inst.op) {
        case Inst.MATCH: {
          // Verify ANCHOR_BOTH constraint before accepting the match
          if (anchor === RE2Flags.ANCHOR_BOTH && pos !== input.endPos()) {
            return null
          }

          matched = true
          if (matchcap.length > 0) {
            matchcap[0] = 0
            matchcap[1] = pos
          }
          return ncap === 0 ? [] : Array.from(matchcap)
        }
        case Inst.RUNE:
          if (!inst.matchRune(rune)) return null
          break
        case Inst.RUNE1:
          if (rune !== inst.runes[0]) return null
          break
        case Inst.RUNE_ANY:
          break
        case Inst.RUNE_ANY_NOT_NL:
          if (rune === 10) return null
          break
        case Inst.ALT:
        case Inst.ALT_MATCH:
          pc = OnePass.next(inst, rune)
          continue
        case Inst.FAIL:
          return null
        case Inst.NOP:
          continue
        case Inst.EMPTY_WIDTH:
          if ((inst.arg & ~flag) !== 0) return null
          continue
        case Inst.CAPTURE:
          if (inst.arg < matchcap.length) {
            matchcap[inst.arg] = pos
          }
          continue
        default:
          throw new RE2JSInternalException('bad inst')
      }

      if (width === 0) break

      flag = Utils.emptyOpContext(rune, rune1)
      pos += width
      rune = rune1
      width = width1

      if (rune !== -1) {
        r1 = input.step(pos + width)
        if (r1 !== MachineInputBase.EOF()) {
          rune1 = r1 >> 3
          width1 = r1 & 7
        } else {
          rune1 = -1
          width1 = 0
        }
      }
    }

    if (!matched) return null
    return ncap === 0 ? [] : Array.from(matchcap)
  }
}
