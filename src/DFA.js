import { Inst } from './Inst.js'
import { RE2Flags } from './RE2Flags.js'
import { Unicode } from './Unicode.js'
import { Utils } from './Utils.js'

// FNV-1a 32-bit hash of a state's identity: its instruction list, flag word and match ids.
// Extremely fast, allocates no memory, and produces good distribution.
const hashState = (pcs, flag, ids) => {
  let h = -2128831035 // 0x811c9dc5 (32-bit signed offset basis)
  for (let i = 0; i < pcs.length; i++) {
    h ^= pcs[i]
    h = Math.imul(h, 16777619) // 0x01000193 (FNV prime)
  }
  h ^= flag
  h = Math.imul(h, 16777619)
  for (let i = 0; i < ids.length; i++) {
    h ^= ids[i]
    h = Math.imul(h, 16777619)
  }
  return h
}

// Zero-allocation array comparison for hash collision resolution
const arraysEqual = (a, b) => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

const NO_IDS = []

// Pseudo-rune for the imaginary character after the end of the input (RE2: kByteEndText). The
// last transition of every search reads it so that $, \z, a final \b and the one-character
// match delay (see DFA) resolve at the end of the text.
const END_TEXT = -1

class DFAState {
  constructor(nfaStates, flag, matchIDs) {
    this.nfaStates = nfaStates // Int32Array of instruction PCs, sorted
    this.flag = flag // see DFA.FLAG_*
    this.isMatch = (flag & DFA.FLAG_MATCH) !== 0
    // For sets: the patterns that matched just before the character that led to this state
    this.matchIDs = matchIDs
    // Transitions, indexed by rune class (see DFA.runeClass) with one extra slot for
    // END_TEXT; one table per anchoring mode, allocated on first use and charged to the
    // memory budget.
    this.next = null
    this.nextAnchored = null
  }
}

// A lazily built DFA over the Unicode code points of the input, a port of RE2's dfa.cc for the
// questions this engine answers: does the program match (match), and which patterns of a set
// match (matchSet). Leftmost-first priority does not matter for either, so a state is an
// unordered set of instructions.
//
// Empty-width assertions (^, $, \A, \z, \b, \B) are handled as in RE2. A state carries a flag
// word: the assertions already known to hold at its position, FLAG_MATCH, FLAG_LAST_WORD and,
// shifted by FLAG_NEED_SHIFT, the assertions its pending EMPTY_WIDTH instructions need. On each
// character the transition derives the assertions holding before it (from the stored flags, the
// previous character's word status and the character itself) and after it, re-follows pending
// assertions that became true, then consumes the character. Because a match is only known once
// the assertions after its last character are known, matches are reported one character late,
// and every search ends with a transition on END_TEXT.
//
// Transitions are indexed by rune class rather than by rune: the program's rune ranges (plus the
// newline and the word characters when assertions need them) split the code point space into
// intervals the program cannot tell apart (RE2 does the same at byte level with
// Prog::ComputeByteMap), so a state needs one table entry per class.
//
// Memory is bounded like RE2's mem_budget_: every state and transition table is charged its
// approximate size against |maxMem|. When the budget is exhausted the cache is reset and the
// search goes on from the current state; if a search keeps exhausting the cache without making
// progress (RE2: fewer than 10 bytes per cached state since the last reset) it gives up and
// returns null, and the caller falls back to the NFA for that search only.
class DFA {
  // Flag word layout (RE2: kFlagEmptyMask, kFlagMatch, kFlagLastWord, kFlagNeedShift)
  static FLAG_EMPTY_MASK = 0xff // Utils.EMPTY_* assertions known to hold at this position
  static FLAG_MATCH = 0x100 // the program matched just before the last character
  static FLAG_LAST_WORD = 0x200 // the last character was a word character (for \b, \B)
  static FLAG_NEED_SHIFT = 16 // assertions needed by pending EMPTY_WIDTH instructions

  // Approximate bytes charged per state (object, instruction list header, hash bucket entry)
  // and per transition table, on top of their elements.
  static STATE_OVERHEAD = 160
  static TABLE_OVERHEAD = 16
  // Bail out of a search when fewer than this many characters were processed per cached state
  // since the previous cache reset (RE2: 10 bytes per state).
  static PROGRESS_PER_STATE = 10

  // maxMem - the maximum memory in bytes to use for the DFA (default 8MB)
  constructor(prog, maxMem = 8388608) {
    this.prog = prog
    this.maxMem = maxMem
    this.stateCache = new Map() // hash(number) -> DFAState[]
    this.stateCount = 0
    this.startStates = new Map() // start flags -> DFAState
    // Lookbehinds depend on automata running alongside the main program, which this DFA does
    // not model; the NFA handles those programs.
    this.failed = false
    for (let pc = 0; pc < prog.numInst(); pc++) {
      const op = prog.getInst(pc).op
      if (op === Inst.LB_WRITE || op === Inst.LB_CHECK) {
        this.failed = true
        break
      }
    }
    this.computeRuneClasses()
    this.stateBudget = maxMem
    this.memBudget = maxMem
  }

  // Splits the code point space at every boundary of every rune instruction, so that runes in
  // the same class are indistinguishable to the program. Case-insensitive literals contribute
  // their whole fold orbit, as Inst.matchRune compares against it. Like RE2's byte map, the
  // newline gets its own class when the program has line assertions, and the word characters
  // when it has word-boundary assertions, because transitions on them set different flags.
  computeRuneClasses() {
    const bounds = new Set()
    const addRange = (lo, hi) => {
      bounds.add(lo)
      bounds.add(hi + 1)
    }
    for (let pc = 0; pc < this.prog.numInst(); pc++) {
      const inst = this.prog.getInst(pc)
      switch (inst.op) {
        case Inst.RUNE:
        case Inst.RUNE1:
          if (inst.runes.length === 1) {
            addRange(inst.runes[0], inst.runes[0])
            if ((inst.arg & RE2Flags.FOLD_CASE) !== 0) {
              for (
                let f = Unicode.simpleFold(inst.runes[0]);
                f !== inst.runes[0];
                f = Unicode.simpleFold(f)
              ) {
                addRange(f, f)
              }
            }
          } else {
            for (let j = 0; j < inst.runes.length; j += 2) {
              addRange(inst.runes[j], inst.runes[j + 1])
            }
          }
          break
        case Inst.RUNE_ANY_NOT_NL:
          addRange(10, 10) // '\n'
          break
        case Inst.EMPTY_WIDTH:
          if ((inst.arg & (Utils.EMPTY_BEGIN_LINE | Utils.EMPTY_END_LINE)) !== 0) {
            addRange(10, 10) // '\n'
          }
          if ((inst.arg & (Utils.EMPTY_WORD_BOUNDARY | Utils.EMPTY_NO_WORD_BOUNDARY)) !== 0) {
            // The ASCII word characters [0-9A-Za-z_]
            addRange(0x30, 0x39)
            addRange(0x41, 0x5a)
            addRange(0x5f, 0x5f)
            addRange(0x61, 0x7a)
          }
          break
        default:
          break
      }
    }
    bounds.delete(0)
    this.classBounds = Int32Array.from(bounds).sort()
    this.numClasses = this.classBounds.length + 1
    // Precomputed classes for Latin-1 runes, the common case in the search loop.
    const latin1Class = new Int32Array(Unicode.MAX_LATIN1 + 1)
    for (let r = 0; r <= Unicode.MAX_LATIN1; r++) {
      latin1Class[r] = this.searchClass(r)
    }
    this.latin1Class = latin1Class
  }

  // Returns the class of rune |r|: the number of class boundaries at or below it.
  runeClass(r) {
    if (r <= Unicode.MAX_LATIN1) {
      return this.latin1Class[r]
    }
    return this.searchClass(r)
  }

  // Binary search of the class boundaries for rune |r|.
  searchClass(r) {
    const bounds = this.classBounds
    let lo = 0
    let hi = bounds.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (bounds[mid] <= r) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    return lo
  }

  // Follows the empty arrows from |pcs|, passing an EMPTY_WIDTH instruction only when all of its
  // assertions are in |flag| (RE2: AddToQueue). Returns the sorted set of instructions reached
  // (EMPTY_WIDTH instructions included, so that a later flag can re-follow them) and the union
  // of the assertions their EMPTY_WIDTH instructions need.
  closure(pcs, flag) {
    const closure = new Set()
    const stack = Array.from(pcs)
    let needflags = 0

    while (stack.length > 0) {
      const pc = stack.pop()
      if (pc === 0 || closure.has(pc)) continue
      closure.add(pc)

      const inst = this.prog.getInst(pc)
      switch (inst.op) {
        case Inst.ALT:
        case Inst.ALT_MATCH:
          stack.push(inst.out)
          stack.push(inst.arg)
          break
        case Inst.NOP:
        case Inst.CAPTURE:
          stack.push(inst.out)
          break
        case Inst.EMPTY_WIDTH:
          needflags |= inst.arg
          if ((inst.arg & ~flag) === 0) {
            stack.push(inst.out)
          }
          break
        default:
          // MATCH, FAIL and the rune instructions end a path
          break
      }
    }

    return { pcs: Int32Array.from(closure).sort(), needflags }
  }

  // Get or create the state for the instruction set |pcs| with flag word |flag| and set match
  // ids |ids| (RE2: WorkqToCachedState + CachedState). Returns null when the state would not
  // fit in the memory budget.
  getState(pcs, flag, ids) {
    const hash = hashState(pcs, flag, ids)

    let bucket = this.stateCache.get(hash)
    if (bucket) {
      for (let i = 0; i < bucket.length; i++) {
        const state = bucket[i]
        if (
          state.flag === flag &&
          arraysEqual(state.nfaStates, pcs) &&
          arraysEqual(state.matchIDs, ids)
        ) {
          return state
        }
      }
    }

    const cost = DFA.STATE_OVERHEAD + 4 * pcs.length + 8 * ids.length
    if (this.memBudget < cost) {
      return null // out of memory: the caller resets the cache or gives up
    }
    this.memBudget -= cost

    if (!bucket) {
      bucket = []
      this.stateCache.set(hash, bucket)
    }
    const state = new DFAState(pcs, flag, ids)
    bucket.push(state)
    this.stateCount++
    return state
  }

  // Builds the state for the closure of |pcs| under the assertions in |flag|, which also carries
  // FLAG_MATCH and FLAG_LAST_WORD. If no EMPTY_WIDTH instruction is pending, the assertion and
  // word bits cannot affect anything and are dropped, which keeps the number of distinct states
  // down (RE2: "if (needflags == 0) flag &= kFlagMatch").
  makeState(pcs, flag, ids) {
    const closure = this.closure(pcs, flag & DFA.FLAG_EMPTY_MASK)
    let stateFlag = flag
    if (closure.needflags === 0) {
      stateFlag &= DFA.FLAG_MATCH
    }
    stateFlag |= closure.needflags << DFA.FLAG_NEED_SHIFT
    return this.getState(closure.pcs, stateFlag, ids)
  }

  // Allocates the transition table of |state| for the given anchoring, charging the budget.
  // Returns null when it does not fit.
  allocTable(state, anchor) {
    const size = this.numClasses + 1 // + 1 for END_TEXT
    const cost = DFA.TABLE_OVERHEAD + 8 * size
    if (this.memBudget < cost) {
      return null
    }
    this.memBudget -= cost
    const table = new Array(size).fill(null)
    if (anchor === RE2Flags.UNANCHORED) {
      state.next = table
    } else {
      state.nextAnchored = table
    }
    return table
  }

  // Drops every cached state and restores the budget (RE2: DFA::ResetCache).
  clearCache() {
    this.stateCache.clear()
    this.stateCount = 0
    this.startStates.clear()
    this.memBudget = this.stateBudget
  }

  // Resets the cache and re-creates |current| so the search can continue from it. Returns the
  // re-created state, or null if even that does not fit.
  resetCache(current) {
    this.clearCache()
    return this.getState(current.nfaStates, current.flag, current.matchIDs)
  }

  // Returns the state reached from |state| on |rune| (of class |cls|, or END_TEXT), creating and
  // caching it if needed (RE2: RunStateOnByte). Returns null when the transition cannot be
  // cached within the memory budget.
  step(state, cls, rune, anchor) {
    let table = anchor === RE2Flags.UNANCHORED ? state.next : state.nextAnchored
    if (table !== null) {
      const cached = table[cls]
      if (cached !== null) return cached
    } else {
      table = this.allocTable(state, anchor)
      if (table === null) return null
    }

    // The assertions holding before and after this character.
    const needflag = state.flag >>> DFA.FLAG_NEED_SHIFT
    const oldbeforeflag = state.flag & DFA.FLAG_EMPTY_MASK
    let beforeflag = oldbeforeflag
    let afterflag = 0
    if (rune === 10) {
      // Implicit $ and ^ around '\n'
      beforeflag |= Utils.EMPTY_END_LINE
      afterflag |= Utils.EMPTY_BEGIN_LINE
    }
    if (rune === END_TEXT) {
      // Implicit $ and \z before the end of the text
      beforeflag |= Utils.EMPTY_END_LINE | Utils.EMPTY_END_TEXT
    }
    const islastword = (state.flag & DFA.FLAG_LAST_WORD) !== 0
    const isword = rune !== END_TEXT && Utils.isWordRune(rune)
    beforeflag |= isword === islastword ? Utils.EMPTY_NO_WORD_BOUNDARY : Utils.EMPTY_WORD_BOUNDARY

    // Re-follow the pending assertions that now hold (RE2: RunWorkqOnEmptyString), only when
    // there are new flags a pending EMPTY_WIDTH instruction needs.
    let pcs = state.nfaStates
    if ((beforeflag & ~oldbeforeflag & needflag) !== 0) {
      pcs = this.closure(pcs, beforeflag).pcs
    }

    // Consume the character (RE2: RunWorkqOnByte). A MATCH reached so far means the program
    // matched just before this character.
    const nextPCs = []
    let ismatch = false
    let ids = NO_IDS
    for (let i = 0; i < pcs.length; i++) {
      const inst = this.prog.getInst(pcs[i])
      if (inst.op === Inst.MATCH) {
        if (!ismatch) {
          ismatch = true
          ids = []
        }
        ids.push(inst.arg)
      } else if (rune !== END_TEXT && Inst.isRuneOp(inst.op) && inst.matchRune(rune)) {
        nextPCs.push(inst.out)
      }
    }
    if (ids.length > 1) {
      ids.sort((a, b) => a - b)
    }

    // An unanchored search can also start a new match right after this character.
    if (anchor === RE2Flags.UNANCHORED && rune !== END_TEXT) {
      nextPCs.push(this.prog.start)
    }

    let flag = afterflag
    if (ismatch) flag |= DFA.FLAG_MATCH
    if (isword) flag |= DFA.FLAG_LAST_WORD
    const nextState = this.makeState(nextPCs, flag, ids)
    if (nextState === null) return null

    table[cls] = nextState
    return nextState
  }

  // Returns the start state for a search beginning at |pos|, creating it if needed; null if the
  // budget cannot hold it (RE2: AnalyzeSearch). The start state depends on the context before
  // |pos|: the beginning of the text, the beginning of a line, or after a word character.
  start(input, pos) {
    const context = input.context(pos)
    let flags
    if ((context & Utils.EMPTY_BEGIN_TEXT) !== 0) {
      flags = Utils.EMPTY_BEGIN_TEXT | Utils.EMPTY_BEGIN_LINE
    } else if ((context & Utils.EMPTY_BEGIN_LINE) !== 0) {
      flags = Utils.EMPTY_BEGIN_LINE
    } else {
      // The context tells whether pos is a word boundary; together with the character at pos
      // that gives the word status of the character before it.
      const r = input.step(pos)
      const nextIsWord = r >= 0 && Utils.isWordRune(r >> 3)
      const boundary = (context & Utils.EMPTY_WORD_BOUNDARY) !== 0
      flags = boundary !== nextIsWord ? DFA.FLAG_LAST_WORD : 0
    }

    let state = this.startStates.get(flags)
    if (state === void 0) {
      state = this.makeState([this.prog.start], flags, NO_IDS)
      if (state === null) {
        // The cache is full (e.g. an earlier search gave up): start over with an empty one.
        this.clearCache()
        state = this.makeState([this.prog.start], flags, NO_IDS)
        if (state === null) return null
      }
      this.startStates.set(flags, state)
    }
    return state
  }

  // Returns the state reached from |state| on |rune|, like step(), but on running out of memory
  // resets the cache and retries, or gives up (returns null) when the cache keeps filling
  // without progress: fewer than PROGRESS_PER_STATE characters per cached state since the
  // previous reset, recorded in |search.resetPos| (RE2: InlinedSearchLoop / ResetCache).
  stepOrReset(state, cls, rune, anchor, pos, search) {
    let next = this.step(state, cls, rune, anchor)
    if (next !== null) return next
    if (search.resetPos >= 0 && pos - search.resetPos < DFA.PROGRESS_PER_STATE * this.stateCount) {
      return null
    }
    search.resetPos = pos
    const restored = this.resetCache(state)
    if (restored === null) return null
    next = this.step(restored, cls, rune, anchor)
    return next
  }

  // Runs the search loop from |state| over input[pos, end) and then on END_TEXT (RE2:
  // InlinedSearchLoop), calling onMatch(state, atEnd) for each matching state reached; onMatch
  // returns true to stop. Returns true if onMatch stopped the search, false when the input is
  // exhausted, or null when the DFA gives up on this search.
  run(input, pos, anchor, state, onMatch) {
    const endPos = input.endPos()
    const latin1Class = this.latin1Class
    const unanchored = anchor === RE2Flags.UNANCHORED
    const search = { resetPos: -1 }
    let i = pos
    while (i < endPos) {
      const r = input.step(i)
      const rune = r >> 3
      const width = r & 7
      if (width === 0) break // prevent infinite loop on EOF

      const cls = rune <= Unicode.MAX_LATIN1 ? latin1Class[rune] : this.runeClass(rune)
      let next = unanchored && state.next !== null ? state.next[cls] : null
      if (next === null) {
        next = this.stepOrReset(state, cls, rune, anchor, i, search)
        if (next === null) return null
      }
      state = next

      if (state.isMatch && onMatch(state, false)) {
        return true
      }
      // A dead state cannot match any more (RE2: DeadState)
      if (!unanchored && state.nfaStates.length === 0) {
        return false
      }
      i += width
    }

    // Matches are reported one character late: one more transition, on END_TEXT, reports a
    // match that ends at the end of the text.
    state = this.stepOrReset(state, this.numClasses, END_TEXT, anchor, i, search)
    if (state === null) return null
    return state.isMatch && onMatch(state, true)
  }

  // The hot loop: Execute the Lazy DFA. Returns true/false, or null to fall back to the NFA.
  match(input, pos, anchor) {
    if (this.failed) return null
    if ((anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) && pos !== 0) {
      return false
    }

    const startState = this.start(input, pos)
    if (startState === null) return null

    // A match is reported one character after its end, so a match at the end of the text is
    // the one reported on END_TEXT.
    return this.run(
      input,
      pos,
      anchor,
      startState,
      (state, atEnd) => anchor !== RE2Flags.ANCHOR_BOTH || atEnd
    )
  }

  // The hot loop for evaluating Multi-Pattern Sets. Returns the sorted matching pattern ids,
  // or null to fall back to the NFA.
  matchSet(input, pos, anchor) {
    if (this.failed) return null
    if ((anchor === RE2Flags.ANCHOR_START || anchor === RE2Flags.ANCHOR_BOTH) && pos !== 0) {
      return []
    }

    const startState = this.start(input, pos)
    if (startState === null) return null

    const matches = new Set()
    const collect = (state, atEnd) => {
      if (anchor !== RE2Flags.ANCHOR_BOTH || atEnd) {
        for (let k = 0; k < state.matchIDs.length; k++) {
          matches.add(state.matchIDs[k])
        }
      }
      return false // keep scanning: later positions may match other patterns
    }

    const result = this.run(input, pos, anchor, startState, collect)
    if (result === null) return null

    return Array.from(matches).sort((a, b) => a - b)
  }
}

export { DFA }
