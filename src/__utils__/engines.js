// Runs a compiled RE2 through every matching engine directly, so tests can check each engine
// against expected results (or against each other) instead of only the engine the dispatcher
// picks for a given input size. Used by the RE2/Fowler conformance tests and the cross-engine
// consistency tests.
import { RE2Flags } from '../RE2Flags.js'
import { MachineInput } from '../MachineInput.js'
import { Backtracker } from '../Backtracker.js'
import { OnePass } from '../OnePass.js'
import { utf16IndicesToUtf8 } from './unicode.js'

// Returns [name, result] pairs for |re| on |text| (a string, or null when the input is not
// valid UTF-8) and |bytes| (its UTF-8 encoding). Submatch results are arrays of UTF-8 byte
// offsets padded like findSubmatchIndex, or null; match-only results are booleans.
// |anchor| defaults to an unanchored search.
export const runEngines = (re, text, bytes, anchor = RE2Flags.UNANCHORED) => {
  const results = []
  const ncap = re.prog.numCap
  const toUtf8 = (a) => (a === null || text === null ? a : utf16IndicesToUtf8(a, text))
  const pad = (a) => (a === null || a === void 0 ? null : re.pad(Array.from(a)))

  const inputs = []
  if (text !== null) {
    inputs.push(['utf16', () => MachineInput.fromUTF16(text), toUtf8])
    if (anchor === RE2Flags.UNANCHORED) {
      results.push(['findSubmatchIndex', toUtf8(re.findSubmatchIndex(text))])
      results.push(['match', re.match(text)])
    }
  }
  inputs.push(['utf8', () => MachineInput.fromUTF8(bytes), (a) => a])
  if (anchor === RE2Flags.UNANCHORED) {
    results.push(['findUTF8SubmatchIndex', re.findUTF8SubmatchIndex(bytes)])
    results.push(['matchUTF8', re.matchUTF8(bytes)])
  }

  for (const [enc, makeInput, convert] of inputs) {
    results.push([`${enc} nfa`, convert(pad(re.doExecuteNFA(makeInput(), 0, anchor, ncap)))])

    const input = makeInput()
    if (
      re.prog.numLb === 0 &&
      Backtracker.shouldBacktrack(re.prog) &&
      input.endPos() <= Backtracker.maxBitStateLen(re.prog)
    ) {
      results.push([
        `${enc} backtracker`,
        convert(pad(Backtracker.execute(re, input, 0, anchor, ncap)))
      ])
    }
    if (re.onepass !== null) {
      results.push([
        `${enc} onepass`,
        convert(pad(OnePass.execute(re, makeInput(), 0, anchor, ncap)))
      ])
    }
    const dfa = re.dfa.match(makeInput(), 0, anchor)
    if (dfa !== null) {
      results.push([`${enc} dfa`, dfa])
    }
  }
  return results
}
