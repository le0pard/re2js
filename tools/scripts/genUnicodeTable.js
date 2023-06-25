import unicode from '@unicode/unicode-15.1.0'
import CommonCaseFolding from '@unicode/unicode-15.1.0/Case_Folding/C/code-points.js'
import SimpleCaseFolding from '@unicode/unicode-15.1.0/Case_Folding/S/code-points.js'
// import TurkishCaseFolding from '@unicode/unicode-15.1.0/Case_Folding/T/code-points.js'
import unicodePropertyValueAliases from 'unicode-property-value-aliases'
import lodash from 'lodash'

import { CodepointRange } from './codepointRange.js'

const MAX_CODE_POINT = 0x10FFFF

const SKIP_CATEGORIES = [
  'cntrl',
  'Cn',
  'LC',
  'Combining_Mark',
  'digit',
  'punct'
]

const aliasesToNames = unicodePropertyValueAliases.get('General_Category')

const toUpperCase = (codepoint) => {
  const s = String.fromCodePoint(codepoint).toUpperCase()
  if (s.length > 1) {
    return codepoint
  }
  const sOrigin = String.fromCodePoint(s.codePointAt(0)).toLowerCase()
  if (sOrigin.length > 1 || sOrigin.codePointAt(0) !== codepoint) {
    return codepoint
  }
  return s.codePointAt(0)
}
const toLowerCase = (codepoint) => {
  const s = String.fromCodePoint(codepoint).toLowerCase()
  if (s.length > 1) {
    return codepoint
  }
  const sOrigin = String.fromCodePoint(s.codePointAt(0)).toUpperCase()
  if (sOrigin.length > 1 || sOrigin.codePointAt(0) !== codepoint) {
    return codepoint
  }
  return s.codePointAt(0)
}

const generateCaseFoldOrbits = () => {
  let orbits = new Map()

  for (let i = 0; i < MAX_CODE_POINT; i++) {
    if (!CommonCaseFolding.has(i) && !SimpleCaseFolding.has(i)) {
      continue
    }

    const f = CommonCaseFolding.get(i) || SimpleCaseFolding.get(i)

    let orbit = orbits.get(f) || new Set()
    orbit.add(f)
    orbit.add(i)
    orbits.set(f, orbit)
  }

  for (let i = 0; i < MAX_CODE_POINT; i++) {
    if(!orbits.has(i)) {
      continue
    }

    let orb = orbits.get(i)
    let u = toUpperCase(i)
    let l = toLowerCase(i)

    if (orb.size === 1 && u === i && l === i) {
      orbits.delete(i)
    } else if (orb.size === 2) {
      const [first, second] = Array.from(orb)
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
    orbitWithKey = Array.from(orbitWithKey).sort((a, b) => a - b)

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

  const diff = lodash.difference(Array.from(exceptionCodepoints), codepoints)
  if (diff.length !== 0) {
    const range = new CodepointRange()
    range.addAll(diff)
    return range.finish()
  }

  return null
};

const getCodePoints =  async (type, name) => {
  const { default: codePoints } = await import(`@unicode/unicode-15.1.0/${type}/${name}/code-points.js`)
  return codePoints
}

const genRanges = async (codePoints) => {
  const gen = new CodepointRange()
  gen.addAll(codePoints)
  return gen.finish()
}

let code = [
  'class UnicodeTables {',
  '',
  ''
]

let categoriesCode = []
let scriptsCode = []
let foldCategoryCode = []
let foldScriptCode = []

code = [...code, "  static CASE_ORBIT = new Map(["]

for (const [key, value] of sortedOrbits.entries()) {
  code = [...code, `    [${key}, ${value}],`]
}

code = [...code, '  ])']

for (const [alias, name] of aliasesToNames.entries()) {
  if (SKIP_CATEGORIES.includes(alias)) {
    continue
  }

  const codePoints = await getCodePoints('General_Category', name)
  const res = await genRanges(codePoints)
  code = [...code, `  static ${alias} = ${JSON.stringify(res)}`]
  categoriesCode = [...categoriesCode, `  ['${alias}', UnicodeTables.${alias}],`]
  if (alias === 'Lu') {
    code = [...code, `  static Upper = this.${alias}`]
  }

  const foldRes = addFoldExceptions(codePoints)
  if (foldRes !== null) {
    code = [...code, `  static fold${alias} = ${JSON.stringify(foldRes)}`]
    foldCategoryCode = [...foldCategoryCode, `  ['${alias}', UnicodeTables.fold${alias}],`]
  }
}

for (const name of unicode['Script']) {
  const codePoints = await getCodePoints('Script', name)
  const res = await genRanges(codePoints)

  code = [...code, `  static ${name} = ${JSON.stringify(res)}`]
  scriptsCode = [...scriptsCode, `  ['${name}', UnicodeTables.${name}],`]

  const foldRes = addFoldExceptions(codePoints)
  if (foldRes !== null) {
    code = [...code, `  static fold${name} = ${JSON.stringify(foldRes)}`]
    foldScriptCode = [...foldScriptCode, `  ['${name}', UnicodeTables.fold${name}],`]
  }
}

code = [
  ...code,
  '',
  '  static CATEGORIES = new Map([',
  ...categoriesCode,
  '  ])',
  ''
]

code = [
  ...code,
  '',
  '  static SCRIPTS = new Map([',
  ...scriptsCode,
  '  ])',
  ''
]

code = [
  ...code,
  '',
  '  static FOLD_CATEGORIES = new Map([',
  ...foldCategoryCode,
  '  ])',
  ''
]

code = [
  ...code,
  '',
  '  static FOLD_SCRIPT = new Map([',
  ...foldScriptCode,
  '  ])',
  ''
]

code = [
  ...code,
  '}',
  '',
  'export { UnicodeTables }'
]

console.log(code.join("\n"))
