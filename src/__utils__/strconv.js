// Port of Go's strconv.Unquote for double-quoted string literals, as used by the RE2 test data
// (re2-search.txt, re2-exhaustive.txt) and by re2j's Strconv.unquote.
//
// Escapes produce bytes, as in Go: \xhh and \ooo are single bytes, \uhhhh and \Uhhhhhhhh are
// UTF-8 encoded code points, \a \b \f \n \r \t \v \\ \' \" are the usual control and quote
// characters. Any other character, including raw control characters other than newline, stands
// for itself. The result is the UTF-8 byte sequence of the literal.
const SIMPLE_ESCAPES = {
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  v: 0x0b,
  '\\': 0x5c,
  "'": 0x27,
  '"': 0x22
}

const isHex = (s) => /^[0-9A-Fa-f]+$/.test(s)

export const unquoteBytes = (s) => {
  if (s.length < 2 || s[0] !== '"' || s[s.length - 1] !== '"') {
    throw new SyntaxError(`invalid quoted string: ${s}`)
  }
  const body = s.slice(1, -1)
  if (body.includes('\n')) {
    throw new SyntaxError(`newline in quoted string: ${s}`)
  }
  const encoder = new TextEncoder()
  const bytes = []
  const pushCodePoint = (cp) => {
    for (const b of encoder.encode(String.fromCodePoint(cp))) {
      bytes.push(b)
    }
  }
  let i = 0
  while (i < body.length) {
    const c = body[i]
    if (c === '"') {
      throw new SyntaxError(`unescaped quote in quoted string: ${s}`)
    }
    if (c !== '\\') {
      const cp = body.codePointAt(i)
      pushCodePoint(cp)
      i += cp > 0xffff ? 2 : 1
      continue
    }
    const e = body[i + 1]
    if (e !== void 0 && Object.prototype.hasOwnProperty.call(SIMPLE_ESCAPES, e)) {
      bytes.push(SIMPLE_ESCAPES[e])
      i += 2
    } else if (e === 'x' && isHex(body.substr(i + 2, 2)) && body.substr(i + 2, 2).length === 2) {
      bytes.push(parseInt(body.substr(i + 2, 2), 16))
      i += 4
    } else if (e === 'u' && body.substr(i + 2, 4).length === 4 && isHex(body.substr(i + 2, 4))) {
      pushCodePoint(parseInt(body.substr(i + 2, 4), 16))
      i += 6
    } else if (e === 'U' && body.substr(i + 2, 8).length === 8 && isHex(body.substr(i + 2, 8))) {
      pushCodePoint(parseInt(body.substr(i + 2, 8), 16))
      i += 10
    } else if (e >= '0' && e <= '7' && /^[0-7]{3}$/.test(body.substr(i + 1, 3))) {
      const v = parseInt(body.substr(i + 1, 3), 8)
      if (v > 0xff) {
        throw new SyntaxError(`octal escape out of range in: ${s}`)
      }
      bytes.push(v)
      i += 4
    } else {
      throw new SyntaxError(`invalid escape \\${e} in: ${s}`)
    }
  }
  return Uint8Array.from(bytes)
}

// Unquotes |s| and decodes the bytes as UTF-8. Returns null if they are not valid UTF-8 (such
// a literal can only be represented as bytes, not as a JS string).
export const unquote = (s) => {
  const bytes = unquoteBytes(s)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}
