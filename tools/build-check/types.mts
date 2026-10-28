// Type-checks the public API as an ESM consumer sees it (build/index.d.ts).
import { RE2JS, RE2Set, Matcher, RE2JSSyntaxException, re } from 're2js'

const pattern: RE2JS = RE2JS.compile('(\\w+)@(\\w+)', RE2JS.CASE_INSENSITIVE | RE2JS.LOOKBEHINDS)
const ok: boolean = pattern.test('user@example')
const matcher: Matcher = pattern.matcher('user@example')
if (matcher.find()) {
  const user: string | null = matcher.group(1)
  const start: number = matcher.start(2)
  void user
  void start
}
const parts: string[] = pattern.split('a@b c@d')
const replaced: string = pattern.matcher('a@b').replaceAll('$2')
const set = new RE2Set(RE2Set.UNANCHORED, RE2JS.MULTILINE)
const id: number = set.add('foo')
const ids: number[] = set.match('foo')
// Both forms of the re tag must type as RE2JS without a cast (2.8.7 to 2.9.0 published a union)
const tagged: RE2JS = re`a+${'b'}`
const flagged: RE2JS = re(RE2JS.CASE_INSENSITIVE)`a+`
const all: RE2JS[] = [re`.`]
const firstMatch = re`.`.matchAll('')
const error = new RE2JSSyntaxException('bad')
void [ok, parts, replaced, id, ids, tagged, flagged, all, firstMatch, error]

// The rest of the documented API, with the types a consumer relies on, and no casts: a change
// in the published types (such as a new TypeScript release emitting them differently) must fail
// here rather than in a user's build.
const quoted: string = RE2JS.quote('a.b')
const quotedReplacement: string = RE2JS.quoteReplacement('$1', true)
const translated: string = RE2JS.translateRegExp(/a(?<n>b)/i)
const translatedSource: string = RE2JS.translateRegExp('a[^]')
const wholeInput: boolean = RE2JS.matches('a+', 'aa')

const named = RE2JS.compile('(?P<x>a)(b)?')
const source: string = named.pattern()
const flags: number = named.flags()
const exact: boolean = named.testExact('ab')
const wholeBytes: boolean = named.matches(new Uint8Array([97]))
const anyBytes: boolean = named.test([97, 98])
const executed: any[] | null = named.exec('ab')
for (const m of named.matchAll('abab')) {
  const index: number | undefined = m.index
  const text: string = m[0]
  const groups: { [key: string]: string } | undefined = m.groups
  void [index, text, groups]
}
const size: number = named.programSize()
const count: number = named.groupCount()
const names: Record<string, number> = named.namedGroups()
const same: boolean = named.equals(RE2JS.compile('(?P<x>a)(b)?'))

const m: Matcher = named.matcher('ab ab')
const foundFrom: boolean = m.find(0)
const byName: string | null = m.group('x')
const start: number = m.start()
const end: number = m.end(1)
const namedValues: Record<string, string | null> = m.getNamedGroups()
const whole: boolean = m.matches()
const atStart: boolean = m.lookingAt()
const again: Matcher = m.reset()
const viaFunction: string = named.matcher('ab').replaceAll((match: string) => match.toUpperCase())
const firstOnly: string = named.matcher('ab').replaceFirst('${x}', true)
const escaped: string = Matcher.quoteReplacement('$')

try {
  RE2JS.compile('(')
} catch (e) {
  if (e instanceof RE2JSSyntaxException) {
    const description: string = e.getDescription()
    const badPattern: string | null = e.getPattern()
    void [description, badPattern]
  }
}

void [quoted, quotedReplacement, translated, translatedSource, wholeInput, source, flags]
void [exact, wholeBytes, anyBytes, executed, size, count, names, same, foundFrom, byName, start]
void [end, namedValues, whole, atStart, again, viaFunction, firstOnly, escaped]
