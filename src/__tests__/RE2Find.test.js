import { expect, test } from '@jest/globals'
import { FIND_TESTS, utf16IndicesToUtf8 } from '../__fixtures__/find'
import { RE2 } from '../RE2'

// helpers

const testSubmatch = ({ testPattern, result, pos = 0 } = {}) => {
  const submatches = testPattern.matches[pos]
  expect(submatches.length).toEqual(result.length * 2)

  for (let k = 0; k < submatches.length; k += 2) {
    if (submatches[k] === -1) {
      expect(result[k / 2]).toBe(null)
      continue
    }

    const expected = testPattern.submatchString(pos, k / 2)
    expect(expected).toEqual(result[k / 2])
  }
}

const testSubmatchBytes = ({ testPattern, result, pos = 0 } = {}) => {
  const submatches = testPattern.matches[pos]
  expect(submatches.length).toEqual(result.length * 2)

  for (let k = 0; k < result.length; k++) {
    if (submatches[k * 2] === -1) {
      expect(result[k]).toBe(null)
      continue
    }

    const expected = testPattern.submatchBytes(pos, k)
    expect(expected).toEqual(result[k])
  }
}

const testSubmatchIndices = ({
  testPattern,
  result,
  pos = 0,
  resultIndicesAreUTF8 = false
} = {}) => {
  const expected = testPattern.matches[pos]
  expect(expected.length).toEqual(result.length)

  if (!resultIndicesAreUTF8) {
    result = utf16IndicesToUtf8(result, testPattern.text)
  }

  for (let k = 0; k < expected.length; k++) {
    expect(expected[k]).toEqual(result[k])
  }
}

// tests

test.concurrent.each(FIND_TESTS)('findUTF8 %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findUTF8(testPattern.textUTF8)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    expect(result).toEqual(testPattern.submatchBytes(0, 0))
  }
})

test.concurrent.each(FIND_TESTS)('find %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.find(testPattern.text)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    expect(result).toEqual(testPattern.submatchString(0, 0))
  }
})

test.concurrent.each(FIND_TESTS)('findUTF8Index %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findUTF8Index(testPattern.textUTF8)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    const expected = testPattern.matches[0]
    expect(expected[0]).toEqual(result[0])
    expect(expected[1]).toEqual(result[1])
  }
})

test.concurrent.each(FIND_TESTS)('findIndex %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findIndex(testPattern.text)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    const resultUtf8 = utf16IndicesToUtf8(result, testPattern.text)
    const expected = testPattern.matches[0]

    expect(expected[0]).toEqual(resultUtf8[0])
    expect(expected[1]).toEqual(resultUtf8[1])
  }
})

test.concurrent.each(FIND_TESTS)('findAllUTF8 %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findAllUTF8(testPattern.textUTF8, -1)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    expect(result.length).toEqual(testPattern.matches.length)

    for (let i = 0; i < testPattern.matches.length; i++) {
      expect(testPattern.submatchBytes(i, 0)).toEqual(result[i])
    }
  }
})

test.concurrent.each(FIND_TESTS)('findAll %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findAll(testPattern.text, -1)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    expect(result.length).toEqual(testPattern.matches.length)

    for (let i = 0; i < testPattern.matches.length; i++) {
      expect(testPattern.submatchString(i, 0)).toEqual(result[i])
    }
  }
})

test.concurrent.each(FIND_TESTS)('findAllUTF8Index %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findAllUTF8Index(testPattern.textUTF8, -1)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    expect(result.length).toEqual(testPattern.matches.length)

    for (let i = 0; i < testPattern.matches.length; i++) {
      const m = testPattern.matches[i]
      const r = result[i]
      expect(m[0]).toEqual(r[0])
      expect(m[1]).toEqual(r[1])
    }
  }
})

test.concurrent.each(FIND_TESTS)('findAllIndex %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findAllIndex(testPattern.text, -1)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    expect(result.length).toEqual(testPattern.matches.length)

    for (let i = 0; i < testPattern.matches.length; i++) {
      const m = testPattern.matches[i]
      const resultUtf8 = utf16IndicesToUtf8(result[i], testPattern.text)
      expect(m[0]).toEqual(resultUtf8[0])
      expect(m[1]).toEqual(resultUtf8[1])
    }
  }
})

test.concurrent.each(FIND_TESTS)('findUTF8Submatch %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findUTF8Submatch(testPattern.textUTF8)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    testSubmatchBytes({ testPattern, result, pos: 0 })
  }
})

test.concurrent.each(FIND_TESTS)('findSubmatch %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findSubmatch(testPattern.text)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    testSubmatch({ testPattern, result, pos: 0 })
  }
})

test.concurrent.each(FIND_TESTS)('findUTF8SubmatchIndex %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findUTF8SubmatchIndex(testPattern.textUTF8)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    testSubmatchIndices({ testPattern, result, pos: 0, resultIndicesAreUTF8: true })
  }
})

test.concurrent.each(FIND_TESTS)('findSubmatchIndex %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findSubmatchIndex(testPattern.text)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    testSubmatchIndices({ testPattern, result, pos: 0, resultIndicesAreUTF8: false })
  }
})

test.concurrent.each(FIND_TESTS)('findAllUTF8Submatch %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findAllUTF8Submatch(testPattern.textUTF8, -1)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    for (let k = 0; k < testPattern.matches.length; k++) {
      testSubmatchBytes({ testPattern, result: result[k], pos: k })
    }
  }
})

test.concurrent.each(FIND_TESTS)('findAllSubmatch %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findAllSubmatch(testPattern.text, -1)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    for (let k = 0; k < testPattern.matches.length; k++) {
      testSubmatch({ testPattern, result: result[k], pos: k })
    }
  }
})

test.concurrent.each(FIND_TESTS)('findAllUTF8SubmatchIndex %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findAllUTF8SubmatchIndex(testPattern.textUTF8, -1)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    for (let k = 0; k < testPattern.matches.length; k++) {
      testSubmatchIndices({ testPattern, result: result[k], pos: k, resultIndicesAreUTF8: true })
    }
  }
})

test.concurrent.each(FIND_TESTS)('findAllSubmatchIndex %s', (testPattern) => {
  const re = RE2.compile(testPattern.pat)
  const result = re.findAllSubmatchIndex(testPattern.text, -1)

  if (testPattern.matches.length === 0 && (result === null || result.length === 0)) {
    // ok
  } else {
    for (let k = 0; k < testPattern.matches.length; k++) {
      testSubmatchIndices({ testPattern, result: result[k], pos: k, resultIndicesAreUTF8: false })
    }
  }
})
