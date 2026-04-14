import { Compiler } from './Compiler'
import { Parser } from './Parser'
import { Simplify } from './Simplify'
import { DFA } from './DFA'
import { Machine } from './Machine'
import { MachineInput } from './MachineInput'
import { RE2Flags } from './RE2Flags'
import { PublicFlags } from './PublicFlags'
import { RE2JSCompileException } from './exceptions'

class RE2Set {
  static UNANCHORED = RE2Flags.UNANCHORED
  static ANCHOR_START = RE2Flags.ANCHOR_START
  static ANCHOR_BOTH = RE2Flags.ANCHOR_BOTH

  constructor(anchor = RE2Set.UNANCHORED, flags = 0) {
    this.anchor = anchor
    this.jsFlags = flags

    let re2Flags = RE2Flags.PERL
    if ((flags & PublicFlags.DISABLE_UNICODE_GROUPS) !== 0) {
      re2Flags &= ~RE2Flags.UNICODE_GROUPS
    }
    if ((flags & PublicFlags.LOOKBEHINDS) !== 0) {
      re2Flags |= RE2Flags.LOOKBEHIND
    }
    this.re2Flags = re2Flags

    this.regexps = []
    this.prog = null
    this.dfa = null
    this.dummyRe2 = null
  }

  add(pattern) {
    if (this.prog) {
      throw new RE2JSCompileException('Cannot add patterns after compile')
    }

    let fregex = pattern
    if ((this.jsFlags & PublicFlags.CASE_INSENSITIVE) !== 0) {
      fregex = `(?i)${fregex}`
    }
    if ((this.jsFlags & PublicFlags.DOTALL) !== 0) {
      fregex = `(?s)${fregex}`
    }
    if ((this.jsFlags & PublicFlags.MULTILINE) !== 0) {
      fregex = `(?m)${fregex}`
    }

    const re = Parser.parse(fregex, this.re2Flags)
    this.regexps.push(Simplify.simplify(re))
    return this.regexps.length - 1
  }

  compile() {
    if (this.prog) return
    this.prog = Compiler.compileSet(this.regexps)
    this.dfa = new DFA(this.prog)
    this.dummyRe2 = {
      prog: this.prog,
      cond: this.prog.startCond(),
      prefix: '',
      prefixRune: 0,
      longest: false
    }
  }

  match(input) {
    if (!this.prog) this.compile()

    const machineInput = Array.isArray(input)
      ? MachineInput.fromUTF8(input)
      : MachineInput.fromUTF16(input)

    let internalAnchor = RE2Flags.UNANCHORED
    if (this.anchor === RE2Set.ANCHOR_START) {
      internalAnchor = RE2Flags.ANCHOR_START
    } else if (this.anchor === RE2Set.ANCHOR_BOTH) {
      internalAnchor = RE2Flags.ANCHOR_BOTH
    }

    // Fast path: Try the blistering fast DFA
    const dfaResult = this.dfa.matchSet(machineInput, 0, internalAnchor)
    if (dfaResult !== null) return dfaResult

    // Safe Fallback: Handle boundaries (\b) or massive state explosions via NFA
    const machine = Machine.fromRE2(this.dummyRe2)
    machine.init(0)
    return machine.matchSet(machineInput, 0, internalAnchor)
  }
}

export { RE2Set }
