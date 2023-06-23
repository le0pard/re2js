import { Pattern } from './Pattern'

class RE2JS {
  static match(regex, input) {
    const pattern = Pattern.compile(regex)
    const matcher = pattern.matcher(input)
    return matcher.matches()
  }

  static extract(regex, input) {
    const pattern = Pattern.compile(regex)
    const matcher = pattern.matcher(input)
    if (matcher.find()) {
      return matcher.group()
    }
    return null
  }

  static replace(regex, input, replacement) {
    const pattern = Pattern.compile(regex)
    const matcher = pattern.matcher(input)
    return matcher.replaceAll(replacement)
  }

  static compile(regex) {
    const pattern = Pattern.compile(regex)

    return {
      match: (input) => {
        const matcher = pattern.matcher(input)
        return matcher.matches()
      },
      extract: (input) => {
        const matcher = pattern.matcher(input)
        if (matcher.find()) {
          return matcher.group()
        }
        return null
      },
      replace: (input, replacement) => {
        const matcher = pattern.matcher(input)
        return matcher.replaceAll(replacement)
      }
    }
  }
}

export { RE2JS }
