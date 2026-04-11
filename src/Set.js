import { Compiler } from './Compiler'
import { Parser } from './Parser'
import { Simplify } from './Simplify'
import { DFA } from './DFA'
import { Machine } from './Machine'
import { MachineInput } from './MachineInput'
import { RE2Flags } from './RE2Flags'
import { RE2JSCompileException } from './exceptions'

class RE2Set {
  constructor(anchor = RE2Flags.UNANCHORED, flags = RE2Flags.PERL) {
    this.anchor = anchor
    this.flags = flags
    this.regexps = []
    this.prog = null
    this.dfa = null
    this.dummyRe2 = null
  }

  add(pattern) {
    if (this.prog) {
      throw new RE2JSCompileException('Cannot add patterns after compile')
    }
    const re = Parser.parse(pattern, this.flags)
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

    // Fast path: Try the blistering fast DFA
    const dfaResult = this.dfa.matchSet(machineInput, 0, this.anchor)
    if (dfaResult !== null) return dfaResult

    // Safe Fallback: Handle boundaries (\b) or massive state explosions via NFA
    const machine = Machine.fromRE2(this.dummyRe2)
    machine.init(0)
    return machine.matchSet(machineInput, 0, this.anchor)
  }
}

export { RE2Set }
