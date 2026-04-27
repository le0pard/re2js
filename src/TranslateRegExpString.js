import { Utils } from './Utils'

/**
 * Transform JS regex string to RE2 regex string
 */
class TranslateRegExpString {
  static isHexadecimal(ch) {
    return ('0' <= ch && ch <= '9') || ('A' <= ch && ch <= 'F') || ('a' <= ch && ch <= 'f')
  }

  static translate(data) {
    let prefixFlags = ''

    if (data instanceof RegExp) {
      if (data.ignoreCase) prefixFlags += 'i'
      if (data.multiline) prefixFlags += 'm'
      if (data.dotAll) prefixFlags += 's'

      // execution flags ('g', 'y') are safely ignored here.
      data = data.source
    }

    if (typeof data !== 'string') {
      return data
    }

    let result = ''
    let changed = false
    let size = data.length

    if (size === 0) {
      result = '(?:)'
      changed = true
    }

    let inCharClass = false
    let i = 0

    while (i < size) {
      let ch = data[i]

      if (ch === '\\') {
        if (i + 1 < size) {
          ch = data[i + 1]
          switch (ch) {
            case '\\': {
              result += '\\\\'
              i += 2
              continue
            }
            case 'c': {
              if (i + 2 < size) {
                let nextCh = data[i + 2]
                let code = nextCh.charCodeAt(0)
                if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
                  let val = code % 32
                  result += '\\x'
                  result += (val >> 4).toString(16).toUpperCase()
                  result += (val & 15).toString(16).toUpperCase()
                  i += 3
                  changed = true
                  continue
                }
              }
              result += 'c'
              i += 2
              changed = true
              continue
            }
            case 'u': {
              if (i + 2 < size) {
                let nextCh = data[i + 2]
                if (nextCh === '{') {
                  // Must have a closing brace and at least one valid hex digit inside
                  let j = i + 3
                  let hasHex = false
                  let closed = false

                  while (j < size) {
                    const hexChar = data[j]
                    if (hexChar === '}') {
                      closed = true
                      break
                    }
                    if (!TranslateRegExpString.isHexadecimal(hexChar)) {
                      break
                    }
                    hasHex = true
                    j++
                  }

                  if (closed && hasHex) {
                    result += '\\x'
                    i += 2
                    changed = true
                    continue
                  }
                } else if (i + 5 < size) {
                  let isHex4 = true
                  for (let j = 0; j < 4; j++) {
                    if (!TranslateRegExpString.isHexadecimal(data[i + 2 + j])) {
                      isHex4 = false
                      break
                    }
                  }
                  if (isHex4) {
                    result += '\\x{' + data.substring(i + 2, i + 6) + '}'
                    i += 6
                    changed = true
                    continue
                  }
                }
              }

              // Graceful degradation for invalid/unclosed \u sequences
              result += 'u'
              i += 2
              changed = true
              continue
            }
            case 'x': {
              let isValidHex = false

              if (i + 2 < size && data[i + 2] === '{') {
                // Must have a closing brace and at least one valid hex digit inside
                let j = i + 3
                let hasHex = false
                let closed = false

                while (j < size) {
                  const hexChar = data[j]
                  if (hexChar === '}') {
                    closed = true
                    break
                  }
                  if (!TranslateRegExpString.isHexadecimal(hexChar)) {
                    break
                  }
                  hasHex = true
                  j++
                }

                if (closed && hasHex) {
                  isValidHex = true
                }
              } else if (
                i + 3 < size &&
                TranslateRegExpString.isHexadecimal(data[i + 2]) &&
                TranslateRegExpString.isHexadecimal(data[i + 3])
              ) {
                isValidHex = true
              }

              if (isValidHex) {
                result += '\\x'
                i += 2
              } else {
                result += 'x'
                i += 2
                changed = true
              }
              continue
            }
            // Whitelist of valid RE2/JS alphanumeric escapes
            case 'n':
            case 'r':
            case 't':
            case 'a':
            case 'f':
            case 'v':
            case 'd':
            case 'D':
            case 's':
            case 'S':
            case 'w':
            case 'W':
            case 'b':
            case 'B':
            case 'p':
            case 'P':
            case 'A':
            case 'z':
            case 'Q':
            case 'E':
            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7': {
              result += '\\' + ch
              i += 2
              continue
            }
            default: {
              let cp = data.codePointAt(i + 1)
              let isAlphaNum =
                (cp >= 48 && cp <= 57) || (cp >= 65 && cp <= 90) || (cp >= 97 && cp <= 122)

              if (isAlphaNum) {
                // Invalid JS alphanumeric escape sequence (e.g. \8, \9, \e, \K)
                // Gracefully degrade to the literal character to prevent RE2 syntax crashes
                let symSize = Utils.charCount(cp)
                result += data.substring(i + 1, i + 1 + symSize)
                i += symSize + 1
                changed = true
              } else {
                // Escaped symbol (e.g. \., \*, \])
                result += '\\'
                let symSize = Utils.charCount(cp)
                result += data.substring(i + 1, i + 1 + symSize)
                i += symSize + 1
              }
              continue
            }
          }
        }
      } else if (ch === '/') {
        result += '\\/'
        i += 1
        changed = true
        continue
      } else if (ch === '[') {
        // Track entry into a character class (protects syntax inside)
        inCharClass = true
      } else if (ch === ']') {
        // Track exit of a character class
        inCharClass = false
      } else if (
        !inCharClass &&
        ch === '(' &&
        i + 2 < size &&
        data[i + 1] === '?' &&
        data[i + 2] === '<'
      ) {
        if (i + 3 < size && !'=!>)'.includes(data[i + 3])) {
          result += '(?P<'
          i += 3
          changed = true
          continue
        }
      }

      let cp = data.codePointAt(i)
      let symSize = Utils.charCount(cp)
      result += data.substring(i, i + symSize)
      i += symSize
    }

    const finalResult = changed ? result : data

    // Append any extracted inline flags
    if (prefixFlags.length > 0) {
      return `(?${prefixFlags})${finalResult}`
    }

    return finalResult
  }
}

export { TranslateRegExpString }
