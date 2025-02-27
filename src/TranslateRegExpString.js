/**
 * Transform JS regex string to RE2 regex string
 */
class TranslateRegExpString {
  static isUpperCaseAlpha(ch) {
    return 'A' <= ch && ch <= 'Z'
  }

  static isHexadecimal(ch) {
    return ('0' <= ch && ch <= '9') || ('A' <= ch && ch <= 'F') || ('a' <= ch && ch <= 'f')
  }

  static getUtf8CharSize(ch) {
    const code = ch.charCodeAt(0)
    if (code < 0x80) return 1 // 1-byte (ASCII)
    if (code < 0x800) return 2 // 2-byte
    if (code < 0x10000) return 3 // 3-byte
    return 4 // 4-byte (surrogate pairs, rare characters)
  }

  static translate(data) {
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
                if (TranslateRegExpString.isUpperCaseAlpha(nextCh)) {
                  result += '\\x'
                  result += ((nextCh.charCodeAt(0) - 64) >> 4).toString(16).toUpperCase()
                  result += ((nextCh.charCodeAt(0) - 64) & 15).toString(16).toUpperCase()
                  i += 3
                  changed = true
                  continue
                }
              }
              result += '\\c'
              i += 2
              continue
            }
            case 'u': {
              if (i + 2 < size) {
                let nextCh = data[i + 2]
                if (TranslateRegExpString.isHexadecimal(nextCh)) {
                  result += '\\x{' + nextCh
                  i += 3
                  for (let j = 0; j < 3 && i < size; ++i, ++j) {
                    nextCh = data[i]
                    if (!TranslateRegExpString.isHexadecimal(nextCh)) {
                      break
                    }
                    result += nextCh
                  }
                  result += '}'
                  changed = true
                  continue
                } else if (nextCh === '{') {
                  result += '\\x'
                  i += 2
                  changed = true
                  continue
                }
              }
              result += '\\u'
              i += 2
              continue
            }
            default: {
              result += '\\'
              let symSize = TranslateRegExpString.getUtf8CharSize(ch)
              result += data.substring(i + 1, i + 1 + symSize)
              i += symSize + 1
              continue
            }
          }
        }
      } else if (ch === '/') {
        result += '\\/'
        i += 1
        changed = true
        continue
      } else if (ch === '(' && i + 2 < size && data[i + 1] === '?' && data[i + 2] === '<') {
        if (i + 3 >= size || (data[i + 3] !== '=' && data[i + 3] !== '!')) {
          result += '(?P<'
          i += 3
          changed = true
          continue
        }
      }

      let symSize = TranslateRegExpString.getUtf8CharSize(ch)
      result += data.substring(i, i + symSize)
      i += symSize
    }

    return changed ? result : data
  }
}

export { TranslateRegExpString }
