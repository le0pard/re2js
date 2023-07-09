import { RE2 } from '../RE2'
import { Pattern } from '../Pattern'
import { Utils } from '../Utils'
import { expect, test } from '@jest/globals'

const cases = [
  ['', '', '', true],
  ['foo', 'foo', 'foo', true],
  // has meta but no operator:
  ['foo\\.\\$', 'foo\\\\\\.\\\\\\$', 'foo.$', true],
  // has escaped operators and real operators:
  ['foo.\\$', 'foo\\.\\\\\\$', 'foo', false],
  [
    '!@#$%^&*()_+-=[{]}\\|,<.>/?~',
    '!@#\\$%\\^&\\*\\(\\)_\\+-=\\[\\{\\]\\}\\\\\\|,<\\.>/\\?~',
    '!@#',
    false
  ]
]

test.concurrent.each(cases)('quote meta: pattern %p quoted to %p', (pattern, output) => {
  const quoted = Utils.quoteMeta(pattern)
  expect(Utils.quoteMeta(pattern)).toEqual(output)
  expect(Pattern.quote(pattern)).toEqual(output)
  // Verify that the quoted string is in fact treated as expected
  // by compile -- i.e. that it matches the original, unquoted string.
  if (pattern && pattern.length > 0) {
    const re = RE2.compile(quoted)

    expect(re.replaceAll(`abc${pattern}def`, 'xyz')).toEqual('abcxyzdef')
  }
})

test.concurrent.each(cases)(
  'literal prefix: pattern %p quoted to %p and literal %p (isLiteral: %p)',
  (pattern, output, literal, isLiteral) => {
    const re = RE2.compile(pattern)
    expect(re.prefix).toEqual(literal)
    expect(re.prefixComplete).toEqual(isLiteral)
  }
)
