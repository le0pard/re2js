import unicode from '@unicode/unicode-15.0.0'
import CaseFolding from '@unicode/unicode-15.0.0/Case_Folding/C/code-points.js'
import unicodePropertyValueAliases from 'unicode-property-value-aliases'
import lodash from 'lodash'

import { CodepointRange } from './codepointRange.js'

const { difference } = lodash

const aliasesToNames = unicodePropertyValueAliases.get('General_Category')

const toUpperCase = (codepoint) => String.fromCodePoint(codepoint).toUpperCase().codePointAt(0)
const toLowerCase = (codepoint) => String.fromCodePoint(codepoint).toLowerCase().codePointAt(0)

const generateCaseFoldOrbits = () => {
  let orbits = new Map()

  for (let i = 0; i < 0x10FFFF; i++) {
    if (!CaseFolding.has(i)) {
      continue
    }

    const f = CaseFolding.get(i)

    let orbit = orbits.get(f) || new Set()
    orbit.add(f)
    orbit.add(i)
    orbits.set(f, orbit)
  }

  for (let i = 0; i < 0x10FFFF; i++) {
    if(!orbits.has(i)) {
      continue
    }

    let orb = orbits.get(i)
    let u = toUpperCase(i)
    let l = toLowerCase(i)

    if (orb.size === 1 && u === i && l === i) {
      orbits.delete(i)
    } else if (orb.size === 2) {
      const [first, second] = Array.from(orb).sort()
      if (toLowerCase(first) === second && toUpperCase(second) === first) {
        orbits.delete(i)
      }
      if (toUpperCase(first) === second && toLowerCase(second) === first) {
        orbits.delete(i)
      }
    }
  }

  let finalResult = new Map()
  for (let [key, value] of orbits) {
    let orbitWithKey = new Set(value)
    orbitWithKey.add(key)
    orbitWithKey = Array.from(orbitWithKey).sort()

    let a = orbitWithKey[0]
    for (let i of orbitWithKey.slice(1)) {
      finalResult.set(a, i)
      a = i
    }
    finalResult.set(orbitWithKey[orbitWithKey.length - 1], orbitWithKey[0])
  }

  return finalResult
}

const sortedOrbits = generateCaseFoldOrbits()

const addFoldExceptions = (codepoints) => {
  const exceptionCodepoints = new Set()
  for (let codepoint of codepoints) {
    if (!sortedOrbits.has(codepoint)) {
      // Just uppercase and lowercase.
      const u = toLowerCase(codepoint)
      if (u !== codepoint) {
        exceptionCodepoints.add(u)
      }
      const l = toUpperCase(codepoint)
      if (l !== codepoint) {
        exceptionCodepoints.add(l)
      }
      exceptionCodepoints.add(codepoint)
    } else {
      let start = codepoint
      do {
        exceptionCodepoints.add(codepoint)
        codepoint = sortedOrbits.get(codepoint)
      } while (codepoint !== start)
    }
  }

  const diff = difference(Array.from(exceptionCodepoints), Array.from(codepoints))
  if (diff.length !== 0) {
    const range = new CodepointRange()
    range.addAll(diff)
    return range.finish()
  }

  return null
};

const getCodePoints =  async (type, name) => {
  const { default: codePoints } = await import(`@unicode/unicode-15.0.0/${type}/${name}/code-points.js`)
  return codePoints
}

const genRanges = async (type, name) => {
  const codePoints = await getCodePoints(type, name)
  const gen = new CodepointRange()
  gen.addAll(codePoints)
  return gen.finish()
}

let code = []

code = [...code, "const CASE_ORBIT = {"]

for (const [key, value] of sortedOrbits.entries()) {
  code = [...code, `${key}: ${value},`]
}

code = [...code, '}']

for (const [alias, name] of aliasesToNames.entries()) {
  const res = await genRanges('General_Category', name)
  code = [...code, `const ${alias} = ${JSON.stringify(res)}`]
}

for (const name of unicode['Script']) {
  const res = await genRanges('Script', name)
  code = [...code, `const ${name} = ${JSON.stringify(res)}`]
}

for (const [alias, name] of aliasesToNames.entries()) {
  const res = await getCodePoints('General_Category', name)
  const foldRes = addFoldExceptions(res)
  if (foldRes !== null) {
    code = [...code, `const fold${alias} = ${JSON.stringify(foldRes)}`]
  }
}

for (const name of unicode['Script']) {
  const res = await getCodePoints('Script', name)
  const foldRes = addFoldExceptions(res)
  if (foldRes !== null) {
    code = [...code, `const fold${name} = ${JSON.stringify(foldRes)}`]
  }
}

console.log(code.join("\n"))
