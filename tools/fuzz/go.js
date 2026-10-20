// Differential fuzzer against Go's regexp package, the closest relative of re2js (re2js is a
// port of re2j, itself a port of Go's regexp). It needs the Go toolchain to build the oracle in
// tools/fuzz/go-oracle; without it the fuzzer is skipped.
//
// For each random pattern (POSIX syntax in some, leftmost-longest in a fifth, sometimes with a
// match limit) and random bytes (often invalid UTF-8), Go and re2js must agree on whether the
// pattern is rejected, on every match with its groups (on the bytes and, when they are valid
// UTF-8, on the equivalent string), on match(), on the group count and names, and on quoteMeta.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { RE2 } from '../../src/RE2.js'
import { RE2Flags } from '../../src/RE2Flags.js'
import { Utils } from '../../src/Utils.js'
import { makeBytes, makePattern } from './generate.js'

const ORACLE_SOURCE = join(dirname(fileURLToPath(import.meta.url)), 'go-oracle')

// Differences from Go that are intended, each with its reason. A failure they explain is not
// reported.
const KNOWN_DIFFERENCES = [
  {
    // Recent Go releases accept a group name used twice; RE2 and re2j reject it, and so does re2js
    explains: ({ re2jsError, go }) =>
      !go.err && /duplicate capture group name/.test(re2jsError?.message ?? '')
  }
]

const hex = (bytes) => Buffer.from(bytes).toString('hex')
const decoder = new TextDecoder('utf-8', { fatal: true })
const decodeUTF8 = (bytes) => {
  try {
    return decoder.decode(Uint8Array.from(bytes))
  } catch {
    return null // not valid UTF-8
  }
}

// UTF-16 match positions of |text| as UTF-8 offsets, as Go reports them
const toUTF8Offsets = (text, matches) =>
  matches === null
    ? null
    : matches.map((match) =>
        match.map((i) => (i < 0 ? i : Utils.stringToUtf8ByteArray(text.slice(0, i)).length))
      )

let oracle = null
let workDir = null

const startOracle = (binary) => {
  const child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'inherit'] })
  const pending = []
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    pending.shift().resolve(JSON.parse(line))
  })
  child.on('exit', (code) => {
    for (const { reject } of pending.splice(0)) reject(new Error(`the Go oracle exited (${code})`))
  })
  return {
    ask: (request) =>
      new Promise((resolve, reject) => {
        pending.push({ resolve, reject })
        child.stdin.write(`${JSON.stringify(request)}\n`)
      }),
    close: () => child.stdin.end()
  }
}

export const goFuzzer = {
  name: 'go',
  fields: ['pattern', 'bytes'],

  // Builds and starts the oracle; returns why the fuzzer is skipped, if it is
  setup() {
    const version = spawnSync('go', ['version'], { encoding: 'utf8' })
    if (version.error || version.status !== 0) return 'the Go toolchain is not installed'
    workDir = mkdtempSync(join(tmpdir(), 're2js-fuzz-'))
    const binary = join(workDir, 'go-oracle')
    const build = spawnSync('go', ['build', '-o', binary, '.'], {
      cwd: ORACLE_SOURCE,
      encoding: 'utf8'
    })
    if (build.status !== 0) throw new Error(`cannot build the Go oracle:\n${build.stderr}`)
    oracle = startOracle(binary)
    return null
  },

  teardown() {
    oracle?.close()
    if (workDir !== null) rmSync(workDir, { recursive: true, force: true })
  },

  generate(random) {
    const posix = random.chance(0.15)
    return {
      pattern: makePattern(random, { junk: true }),
      posix,
      longest: posix || random.chance(0.2),
      limit: random.pick([-1, -1, -1, 1, 2]),
      bytes: makeBytes(random)
    }
  },

  async check(c) {
    const go = await oracle.ask({
      p: c.pattern,
      t: hex(c.bytes),
      longest: c.longest,
      posix: c.posix,
      n: c.limit
    })
    let re = null
    let re2jsError = null
    try {
      re = RE2.compileImpl(c.pattern, c.posix ? RE2Flags.POSIX : RE2Flags.PERL, c.longest)
    } catch (e) {
      re2jsError = e
    }
    if (KNOWN_DIFFERENCES.some((d) => d.explains({ c, re2jsError, go }))) return null
    if (go.err !== (re === null)) {
      return go.err
        ? 'Go rejects the pattern, re2js accepts it'
        : `re2js rejects the pattern (${re2jsError.message}), Go accepts it`
    }
    if (re === null) return null

    const bytes = Uint8Array.from(c.bytes)
    const all = re.findAllUTF8SubmatchIndex(bytes, c.limit)
    if (JSON.stringify(all) !== JSON.stringify(go.all)) {
      return `findAllUTF8SubmatchIndex gives ${JSON.stringify(all)}, Go ${JSON.stringify(go.all)}`
    }
    if (re.matchUTF8(bytes) !== (go.all !== null)) {
      return `matchUTF8 gives ${re.matchUTF8(bytes)}, Go ${go.all !== null}`
    }
    if (re.numberOfCapturingGroups() !== go.numSub) {
      return `the group count is ${re.numberOfCapturingGroups()}, Go ${go.numSub}`
    }
    const names = {}
    go.names.forEach((name, i) => {
      if (name !== '' && !(name in names)) names[name] = i
    })
    if (JSON.stringify({ ...re.namedGroups }) !== JSON.stringify(names)) {
      return `the named groups are ${JSON.stringify({ ...re.namedGroups })}, Go ${JSON.stringify(names)}`
    }

    const text = decodeUTF8(c.bytes)
    if (text !== null) {
      const all16 = toUTF8Offsets(text, re.findAllSubmatchIndex(text, c.limit))
      if (JSON.stringify(all16) !== JSON.stringify(go.all)) {
        return `findAllSubmatchIndex on the string gives ${JSON.stringify(all16)}, Go ${JSON.stringify(go.all)}`
      }
      if (re.match(text) !== (go.all !== null)) {
        return `match gives ${re.match(text)}, Go ${go.all !== null}`
      }
      const quoted = hex(Utils.stringToUtf8ByteArray(Utils.quoteMeta(text)))
      if (quoted !== go.quote) return `quoteMeta differs from Go's QuoteMeta`
    }
    return null
  }
}
