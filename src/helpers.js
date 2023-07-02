// helper to create enums
// example
// Encoding[(Encoding['UTF_16'] = 0)] = 'UTF_16'
// Encoding[(Encoding['UTF_8'] = 1)] = 'UTF_8'
export const createEnum = (values = [], initNum = 0) => {
  const enumObject = {}
  for (let i = 0; i < values.length; i++) {
    const val = values[i]
    const keyVal = initNum + i
    enumObject[val] = keyVal
    enumObject[keyVal] = val
  }
  return Object.freeze(enumObject)
}
