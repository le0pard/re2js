import unicode from '@unicode/unicode-15.0.0'
import CaseFolding from '@unicode/unicode-15.0.0/Case_Folding/C/code-points.js'
import unicodePropertyValueAliases from 'unicode-property-value-aliases'
import lodash from 'lodash'

import { CodepointRange } from './codepointRange.js'

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
  const { default: codePoints } = await import(`@unicode/unicode-15.0.0/${type}/${name}/code-points.js`)
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
  '  static memo = new Map()',
  ''
]

let categoriesCode = []
let scriptsCode = []
let foldCategoryCode = []
let foldScriptCode = []

code = [...code, "  static CASE_ORBIT = {"]

for (const [key, value] of sortedOrbits.entries()) {
  code = [...code, `    ${key}: ${value},`]
}

code = [...code, '  }']

for (const [alias, name] of aliasesToNames.entries()) {
  const codePoints = await getCodePoints('General_Category', name)
  const res = await genRanges(codePoints)
  code = [...code, `  static ${alias} = ${JSON.stringify(res)}`]
  categoriesCode = [...categoriesCode, `  group.set('${alias}', this.${alias})`]
  if (alias === 'Lu') {
    code = [...code, `  static Upper = this.${alias}`]
  }

  const foldRes = addFoldExceptions(codePoints)
  if (foldRes !== null) {
    code = [...code, `  static fold${alias} = ${JSON.stringify(foldRes)}`]
    foldCategoryCode = [...foldCategoryCode, `  group.set('${alias}', this.fold${alias})`]
  }
}

for (const name of unicode['Script']) {
  const codePoints = await getCodePoints('Script', name)
  const res = await genRanges(codePoints)
  code = [...code, `  static ${name} = ${JSON.stringify(res)}`]
  scriptsCode = [...scriptsCode, `  group.set('${name}', this.${name})`]

  const foldRes = addFoldExceptions(codePoints)
  if (foldRes !== null) {
    code = [...code, `  static fold${name} = ${JSON.stringify(foldRes)}`]
    foldScriptCode = [...foldScriptCode, `  group.set('${name}', this.fold${name})`]
  }
}

code = [
  ...code,
  '',
  '  static Categories() {',
  "    if (this.memo.has('Categories')) {",
  "      return this.memo.get('Categories')",
  '    } else {',
  '      const group = new Map()',
  ...categoriesCode,
  "      this.memo.set('Categories', group)",
  '      return group',
  '    }',
  '  }',
  ''
]

code = [
  ...code,
  '',
  '  static Scripts() {',
  "    if (this.memo.has('Scripts')) {",
  "      return this.memo.get('Scripts')",
  '    } else {',
  '      const group = new Map()',
  ...scriptsCode,
  "      this.memo.set('Scripts', group)",
  '      return group',
  '    }',
  '  }',
  ''
]

code = [
  ...code,
  '',
  '  static FoldCategory() {',
  "    if (this.memo.has('FoldCategory')) {",
  "      return this.memo.get('FoldCategory')",
  '    } else {',
  '      const group = new Map()',
  ...foldCategoryCode,
  "      this.memo.set('FoldCategory', group)",
  '      return group',
  '    }',
  '  }',
  ''
]

code = [
  ...code,
  '',
  '  static FoldScript() {',
  "    if (this.memo.has('FoldScript')) {",
  "      return this.memo.get('FoldScript')",
  '    } else {',
  '      const group = new Map()',
  ...foldScriptCode,
  "      this.memo.set('FoldScript', group)",
  '      return group',
  '    }',
  '  }',
  ''
]

code = [
  ...code,
  '}',
  '',
  'export { UnicodeTables }'
]

console.log(code.join("\n"))
