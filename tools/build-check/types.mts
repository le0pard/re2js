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
const tagged: RE2JS = re`a+${'b'}` as RE2JS
const error = new RE2JSSyntaxException('bad')
void [ok, parts, replaced, id, ids, tagged, error]
