// Self-consistency fuzzer: the matching engines must agree with each other. No other
// implementation is needed, so it covers re2js-only features (lookbehinds) too.
//
// For each random pattern (with lookbehinds in a quarter of them, leftmost-longest in a fifth):
// - every engine (bit-state backtracker, one-pass, lazy DFA, public API) gives the Pike VM's
//   answer for every anchoring, on a string (with unpaired surrogates) and on raw bytes (with
//   invalid UTF-8);
// - the lazy DFA under tiny memory budgets, which force cache resets and give-ups mid-search,
//   gives the Pike VM's answer or declines;
// - an input that starts and ends inside a buffer matches like that slice on its own.
import { RE2 } from '../../src/RE2.js'
import { RE2Flags } from '../../src/RE2Flags.js'
import { DFA } from '../../src/DFA.js'
import { MachineInput } from '../../src/MachineInput.js'
import { Backtracker } from '../../src/Backtracker.js'
import { OnePass } from '../../src/OnePass.js'
import { Utils } from '../../src/Utils.js'
import { RE2JSCompileException, RE2JSSyntaxException } from '../../src/exceptions.js'
import { runEngines } from '../../src/__utils__/engines.js'
import { makeBytes, makePattern, makeText } from './generate.js'

const ANCHORS = [RE2Flags.UNANCHORED, RE2Flags.ANCHOR_START, RE2Flags.ANCHOR_BOTH]
const DFA_BUDGETS = [4000, 1200]

const compile = (c) => {
  const flags = RE2Flags.PERL | (c.lookbehinds ? RE2Flags.LOOKBEHIND : 0)
  try {
    return RE2.compileImpl(c.pattern, flags, c.longest)
  } catch (e) {
    if (e instanceof RE2JSSyntaxException || e instanceof RE2JSCompileException) return null
    throw e
  }
}

// Every engine against the Pike VM on |text| (null for bytes only) and |bytes|
const enginesAgree = (re, text, bytes, anchor) => {
  const results = runEngines(re, text, bytes, anchor)
  const reference = results.find(([name]) => name === 'utf8 nfa')[1]
  for (const [engine, have] of results) {
    const same =
      typeof have === 'boolean'
        ? have === (reference !== null)
        : JSON.stringify(have) === JSON.stringify(reference)
    if (!same) {
      return `${engine} gives ${JSON.stringify(have)}, the Pike VM ${JSON.stringify(reference)} (anchor ${anchor})`
    }
  }
  return null
}

// The engines run directly on one MachineInput, for the slice check
const runOn = (re, makeInput, anchor) => {
  const ncap = 2 * (1 + re.numSubexp)
  const results = [['nfa', re.doExecuteNFA(makeInput(), 0, anchor, ncap)]]
  const input = makeInput()
  if (re.prog.numLb === 0 && input.endPos() <= Backtracker.maxBitStateLen(re.prog)) {
    results.push(['backtracker', Backtracker.execute(re, input, 0, anchor, ncap)])
  }
  if (re.onepass !== null) {
    results.push(['onepass', OnePass.execute(re, makeInput(), 0, anchor, ncap)])
  }
  results.push(['dfa', re.dfa.match(makeInput(), 0, anchor)])
  return results
}

// The UTF-16 offsets of the code point boundaries of |text|
const boundaries = (text) => {
  const offsets = [0]
  for (const c of text) offsets.push(offsets[offsets.length - 1] + c.length)
  return offsets
}

export const enginesFuzzer = {
  name: 'engines',
  fields: ['pattern', 'text', 'bytes'],

  generate(random) {
    const lookbehinds = random.chance(0.25)
    return {
      pattern: makePattern(random, { lookbehinds }),
      lookbehinds,
      longest: random.chance(0.2),
      text: makeText(random, { loneSurrogates: true }),
      bytes: makeBytes(random),
      // The DFA start position and the slice, as fractions of the text
      dfaStart: random.next(),
      slice: [random.next(), random.next()]
    }
  },

  check(c) {
    const re = compile(c)
    if (re === null) return null

    const text = c.text
    const textBytes = Utils.stringToUtf8ByteArray(text)
    for (const anchor of ANCHORS) {
      const failure = enginesAgree(re, text, textBytes, anchor)
      if (failure !== null) return `${failure}, on the string`
    }
    const bytes = Uint8Array.from(c.bytes)
    for (const anchor of ANCHORS) {
      const failure = enginesAgree(re, null, bytes, anchor)
      if (failure !== null) return `${failure}, on the bytes`
    }

    const offsets = boundaries(text)
    const pos = offsets[Math.floor(c.dfaStart * offsets.length)]
    for (const budget of DFA_BUDGETS) {
      for (const anchor of ANCHORS) {
        const want = re.doExecuteNFA(MachineInput.fromUTF16(text), pos, anchor, 0) !== null
        const have = new DFA(re.prog, budget).match(MachineInput.fromUTF16(text), pos, anchor)
        if (have !== null && have !== want) {
          return `a DFA with a ${budget}-byte budget gives ${have} from position ${pos}, the Pike VM ${want} (anchor ${anchor})`
        }
      }
    }

    const start = offsets[Math.floor(c.slice[0] * offsets.length)]
    const later = offsets.filter((o) => o >= start)
    const end = later[Math.floor(c.slice[1] * later.length)]
    const part = text.slice(start, end)
    for (const anchor of ANCHORS) {
      const want = runOn(re, () => MachineInput.fromUTF16(part), anchor)
      const have = runOn(re, () => MachineInput.fromUTF16(text, start, end), anchor)
      if (JSON.stringify(have) !== JSON.stringify(want)) {
        return `the slice [${start}, ${end}) gives ${JSON.stringify(have)}, the same text alone ${JSON.stringify(want)} (anchor ${anchor})`
      }
    }
    return null
  }
}
