// Shrinks a failing case (delta debugging): removes ever smaller runs of characters from its
// string fields, and of elements from its array fields, keeping each removal after which the
// case still fails, so that a report shows a minimal pattern and input.
//
// |fails| is an async predicate; strings are split by code point, so no shrink produces a lone
// surrogate that was not in the input. Stops after |maxChecks| calls to |fails|.
export const shrink = async (failing, fails, { fields, maxChecks = 4000 }) => {
  let current = failing
  let checks = 0
  let progress = true
  while (progress && checks < maxChecks) {
    progress = false
    for (const field of fields) {
      const value = current[field]
      if (value === null || value === void 0) continue
      const isString = typeof value === 'string'
      const parts = isString ? Array.from(value) : value
      for (let size = parts.length; size >= 1 && !progress; size = Math.floor(size / 2)) {
        for (let at = 0; at + size <= parts.length; at++) {
          if (checks++ >= maxChecks) return current
          const rest = [...parts.slice(0, at), ...parts.slice(at + size)]
          const candidate = { ...current, [field]: isString ? rest.join('') : rest }
          if (await fails(candidate)) {
            current = candidate
            progress = true
            break
          }
        }
      }
    }
  }
  return current
}
