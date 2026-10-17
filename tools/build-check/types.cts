// Type-checks the public API as a CommonJS consumer sees it (build/index.d.cts).
import re2js = require('re2js')

const pattern: re2js.RE2JS = re2js.RE2JS.compile('a+b')
const ok: boolean = pattern.test('aab')
const set: re2js.RE2Set = new re2js.RE2Set()
void [ok, set]
