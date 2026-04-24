import { Compiler } from './Compiler'
import { Parser } from './Parser'
import { Simplify } from './Simplify'
import { DFA } from './DFA'
import { Machine } from './Machine'
import { MachineInput } from './MachineInput'
import { RE2Flags } from './RE2Flags'
import { PublicFlags } from './PublicFlags'
import { Utils } from './Utils'
import { RE2JSCompileException } from './exceptions'

class RE2Set {
  /** @type {number} */
  static UNANCHORED = RE2Flags.UNANCHORED
  /** @type {number} */
  static ANCHOR_START = RE2Flags.ANCHOR_START
  /** @type {number} */
  static ANCHOR_BOTH = RE2Flags.ANCHOR_BOTH

  /**
   * Constructs a new RE2Set with the specified anchor mode and flags.
   * @param {number} [anchor=RE2Set.UNANCHORED] - The anchoring mode (e.g., RE2Set.UNANCHORED).
   * @param {number} [flags=0] - The public flags to apply to all patterns in the set.
   */
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

  /**
   * Adds a new regular expression pattern to the set.
   * Patterns cannot be added after the set has been compiled.
   * @param {string} pattern - The regular expression pattern to add.
   * @returns {number} The integer index assigned to the added pattern.
   * @throws {RE2JSCompileException} If patterns are added after compilation.
   */
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

  /**
   * Compiles the added patterns into a single state machine.
   * This is automatically called on the first match if not called explicitly.
   * @returns {void}
   */
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

  /**
   * Matches the input against the compiled set of regular expressions.
   * @param {string | number[] | Uint8Array} input - The input string or UTF-8 byte array to match against.
   * @returns {number[]} An array of indices representing the patterns that successfully matched the input.
   */
  match(input) {
    if (!this.prog) this.compile()

    const machineInput = Utils.isByteArray(input)
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
