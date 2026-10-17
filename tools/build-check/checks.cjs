// Behavioural checks shared by the ESM, CommonJS and UMD smoke tests of the built package.
// Each check exercises a different part of the bundle: every engine, the public classes and
// exceptions, and the opt-in lookbehinds.
const assert = require('node:assert/strict')

// Compares by value: the UMD check runs the bundle in another realm, whose arrays have a
// different prototype.
const same = (actual, expected, message) =>
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message)

module.exports = function runChecks(lib, label) {
  const { RE2JS, RE2Set, Matcher, MatcherInput, MatcherInputBase, re } = lib
  for (const name of [
    'RE2JS',
    'RE2Set',
    'Matcher',
    'MatcherInput',
    'MatcherInputBase',
    're',
    'RE2JSException',
    'RE2JSSyntaxException',
    'RE2JSCompileException',
    'RE2JSGroupException',
    'RE2JSFlagsException',
    'RE2JSInternalException'
  ]) {
    assert.ok(lib[name], `${label}: export ${name}`)
  }

  // DFA, one-pass, bit-state backtracker and Pike VM paths
  assert.equal(RE2JS.compile('b+').test('aaabbb'), true)
  same(RE2JS.compile('^(\\w+)@(\\w+)$').exec('user@example').slice(1), ['user', 'example'])
  same(
    Array.from(RE2JS.compile('(\\d+)').matchAll('a1 b22 c333'), (m) => m[1]),
    ['1', '22', '333']
  )
  const long = `${'x'.repeat(100000)}a1`
  assert.equal(RE2JS.compile('([a-z])(\\d)').matcher(long).find(), true)
  assert.equal(RE2JS.compile('(a+)+$').test(`${'a'.repeat(5000)}!`), false)

  // Replacement, split, UTF-8 input and the tagged template
  assert.equal(
    RE2JS.compile('(\\w+) (\\w+)').matcher('hello world').replaceAll('$2 $1'),
    'world hello'
  )
  same(RE2JS.compile(',\\s*').split('a, b,c'), ['a', 'b', 'c'])
  assert.equal(RE2JS.compile('é+').test(new TextEncoder().encode('xéé')), true)
  assert.equal(re`a${'.'}b`.test('a.b'), true)
  assert.ok(RE2JS.compile('a').matcher('a') instanceof Matcher)
  assert.ok(MatcherInput.utf16('a') instanceof MatcherInputBase)

  // Lookbehinds are opt-in
  assert.throws(() => RE2JS.compile('(?<=a)b'), lib.RE2JSSyntaxException)
  assert.equal(RE2JS.compile('(?<=a)b', RE2JS.LOOKBEHINDS).test('ab'), true)

  // Sets
  const set = new RE2Set()
  set.add('foo')
  set.add('bar')
  set.compile()
  same(set.match('a bar'), [1])

  // Errors are the exported classes
  assert.throws(() => RE2JS.compile('('), lib.RE2JSSyntaxException)
  assert.throws(() => RE2JS.compile('a', 1 << 20), lib.RE2JSFlagsException)
  assert.ok(new lib.RE2JSSyntaxException('x') instanceof lib.RE2JSException)

  console.log(`${label}: ok`)
}
