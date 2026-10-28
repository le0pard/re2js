// Type-checks the public API as a CommonJS consumer sees it (build/index.d.cts).
import re2js = require('re2js')

const pattern: re2js.RE2JS = re2js.RE2JS.compile('a+b')
const ok: boolean = pattern.test('aab')
const set: re2js.RE2Set = new re2js.RE2Set()
const tagged: re2js.RE2JS = re2js.re`a+`
const flagged: re2js.RE2JS = re2js.re(re2js.RE2JS.MULTILINE)`^a`
void [ok, set, tagged, flagged, tagged.matchAll('')]
