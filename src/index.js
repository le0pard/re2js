import { Pattern } from './Pattern'

const Flags = {
  CASE_INSENSITIVE: Pattern.CASE_INSENSITIVE,
  DOTALL: Pattern.DOTALL,
  MULTILINE: Pattern.MULTILINE,
  DISABLE_UNICODE_GROUPS: Pattern.DISABLE_UNICODE_GROUPS,
  LONGEST_MATCH: Pattern.LONGEST_MATCH
}

class RE2JS {
  static compile(regex, flags = 0) {
    const pattern = Pattern.compile(regex, flags)

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
      replaceFirst: (input, replacement) => {
        const matcher = pattern.matcher(input)
        return matcher.replaceFirst(replacement)
      },
      replaceAll: (input, replacement) => {
        const matcher = pattern.matcher(input)
        return matcher.replaceAll(replacement)
      }
    }
  }
}

export { RE2JS, Flags }
