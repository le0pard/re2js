# RE2JS is the JavaScript port of RE2, a regular expression engine that provides linear time matching
[![Test/Build/Publish](https://github.com/le0pard/re2js/actions/workflows/ci.yml/badge.svg)](https://github.com/le0pard/re2js/actions/workflows/ci.yml)

## [Playground](https://re2js.leopard.in.ua/)

## TLDR

The built-in JavaScript regular expression engine can, under certain special combinations, run in exponential time. This situation can trigger what's referred to as a [Regular Expression Denial of Service (ReDoS)](https://www.owasp.org/index.php/Regular_expression_Denial_of_Service_-_ReDoS). RE2, a different regular expression engine, can effectively safeguard your Node.js applications from ReDoS attacks. With RE2JS, this protective feature extends to browser environments as well, enabling you to utilize the RE2 engine more comprehensively.

## What is RE2?

RE2 is a regular expression engine designed to operate in time proportional to the size of the input, ensuring linear time complexity. RE2JS, on the other hand, is a pure JavaScript port of the [RE2 library](https://github.com/google/re2) — more specifically, it's a port of the [RE2/J library](https://github.com/google/re2j).

JavaScript standard regular expression package, [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions), and many other widely used regular expression packages such as PCRE, Perl and Python use a backtracking implementation strategy: when a pattern presents two alternatives such as a|b, the engine will try to match subpattern a first, and if that yields no match, it will reset the input stream and try to match b instead.

If such choices are deeply nested, this strategy requires an exponential number of passes over the input data before it can detect whether the input matches. If the input is large, it is easy to construct a pattern whose running time would exceed the lifetime of the universe. This creates a security risk when accepting regular expression patterns from untrusted sources, such as users of a web application.

In contrast, the RE2 algorithm explores all matches simultaneously in a single pass over the input data by using a nondeterministic finite automaton.

There are certain features of PCRE or Perl regular expressions that cannot be implemented in linear time, for example, backreferences, but the vast majority of regular expressions patterns in practice avoid such features.

## Installation

To install RE2JS:

```bash
# npm
npm install re2js
# yarn
yarn add re2js
# pnpm
pnpm add re2js
# bun
bun add re2js
```

## Usage

This document provides a series of examples demonstrating how to use RE2JS in your code. For more detailed information about regex syntax, please visit this page: [Google RE2 Syntax Documentation](https://github.com/google/re2/wiki/Syntax).

You can utilize ECMAScript (ES6) imports to import and use the RE2JS library:

```js
import { RE2JS } from 're2js'
```

If you're using CommonJS, you can `require` the library:

```js
const { RE2JS } = require('re2js')
```

### Compiling Patterns

You can compile a regex pattern using the `compile()` function:

```js
import { RE2JS } from 're2js'

const p = RE2JS.compile('abc');
console.log(p.pattern()); // Outputs: 'abc'
console.log(p.flags()); // Outputs: 0
```

The `compile()` function also supports flags:

```js
import { RE2JS } from 're2js'

const p = RE2JS.compile('abc', RE2JS.CASE_INSENSITIVE | RE2JS.MULTILINE);
console.log(p.pattern()); // Outputs: 'abc'
console.log(p.flags()); // Outputs: 5
```

Supported flags:

```js
/**
 * Flag: case insensitive matching.
 */
RE2JS.CASE_INSENSITIVE
/**
 * Flag: dot ({@code .}) matches all characters, including newline.
 */
RE2JS.DOTALL
/**
 * Flag: multiline matching: {@code ^} and {@code $} match at beginning and end of line, not just
 * beginning and end of input.
 */
RE2JS.MULTILINE
/**
 * Flag: Unicode groups (e.g. {@code \p\ Greek\} ) will be syntax errors.
 */
RE2JS.DISABLE_UNICODE_GROUPS
/**
 * Flag: matches longest possible string (changes the match semantics to leftmost-longest).
 */
RE2JS.LONGEST_MATCH
```

### Checking for Matches

RE2JS allows you to check if a string matches a given regex pattern using the `matches()` function.

***Performance Note:** The `matches()` method is highly optimized. It performs a strict anchored check and runs directly on the high-speed DFA (Deterministic Finite Automaton) engine without tracking capture groups or instantiating a stateful `Matcher` object.*

```js
import { RE2JS } from 're2js'

RE2JS.matches('ab+c', 'abbbc') // true
RE2JS.matches('ab+c', 'cbbba') // false
// or
RE2JS.compile('ab+c').matches('abbbc') // true
RE2JS.compile('ab+c').matches('cbbba') // false
// with flags
RE2JS.compile('ab+c', RE2JS.CASE_INSENSITIVE).matches('AbBBc') // true
RE2JS.compile(
  '^ab.*c$',
  RE2JS.DOTALL | RE2JS.MULTILINE | RE2JS.CASE_INSENSITIVE
).matches('AB\nc') // true
```

### Finding Matches

To find a match for a given regex pattern in a string, you can use the `find()` function

```js
import { RE2JS } from 're2js'

RE2JS.compile('ab+c').matcher('xxabbbc').find() // true
RE2JS.compile('ab+c').matcher('cbbba').find() // false
// with flags
RE2JS.compile('ab+c', RE2JS.CASE_INSENSITIVE).matcher('abBBc').find() // true
```

Example to collect all matches in string

```js
import { RE2JS } from 're2js'

const p = RE2JS.compile('abc+')
const matchString = p.matcher('abc abcccc abcc')
const results = []
while (matchString.find()) {
  results.push(matchString.group())
}
results // ['abc', 'abcccc', 'abcc']
```

The `find()` method searches for a pattern match in a string starting from a specific index

```js
import { RE2JS } from 're2js'

const p = RE2JS.compile('.*[aeiou]')
const matchString = p.matcher('abcdefgh')
matchString.find(0) // true
matchString.group() // 'abcde'
matchString.find(1) // true
matchString.group() // 'bcde'
matchString.find(4) // true
matchString.group() // 'e'
matchString.find(7) // false
```

### High-Performance Boolean Testing

If you only need to know **whether** a string matches a pattern (without extracting capture groups), you should use the `test()`, `testExact()`, or `matches()` methods. Unlike `.matcher()`, these methods do not instantiate stateful `Matcher` objects and request exactly `0` capture groups. This guarantees that execution is securely routed to the high-speed DFA (Deterministic Finite Automaton) engine whenever possible in linear `O(n)` time

#### `test(input)`

Tests if the regular expression matches **any part** of the provided input (unanchored). This method mirrors the standard JavaScript `RegExp.prototype.test()` API

```js
import { RE2JS } from 're2js';

// Compile once, reuse often
const re = RE2JS.compile('error|warning|critical');

// Extremely fast, unanchored DFA search
if (re.test('The system encountered a critical failure')) {
  console.log('Log needs attention!');
}
```

#### `testExact(input)`

Tests if the regular expression matches the entire input string (anchored to both start and end).

*Note: `RE2JS.matches()` delegates to this method, so they provide the exact same performance and behavior.*

```js
import { RE2JS } from 're2js';

const isHex = RE2JS.compile('[0-9A-Fa-f]+');

// Fast, anchored DFA validation
console.log(isHex.testExact('1A4F'));      // true
console.log(isHex.testExact('1A4F-xyz'));  // false
```

### Checking Initial Match

The `lookingAt()` method determines whether the start of the given string matches the pattern

```js
import { RE2JS } from 're2js'

RE2JS.compile('abc').matcher('abcdef').lookingAt() // true
RE2JS.compile('abc').matcher('ab').lookingAt() // false
```

Note that the `lookingAt` method only checks the start of the string. It does not search the entire string for a match

### Splitting Strings

You can split a string based on a regex pattern using the `split()` function

```js
import { RE2JS } from 're2js'

RE2JS.compile('/').split('abcde') // ['abcde']
RE2JS.compile('/').split('a/b/cc//d/e//') // ['a', 'b', 'cc', '', 'd', 'e']
RE2JS.compile(':').split(':a::b') // ['', 'a', '', 'b']
```

The `split()` function also supports a limit parameter

```js
import { RE2JS } from 're2js'

RE2JS.compile('/').split('a/b/cc//d/e//', 3) // ['a', 'b', 'cc//d/e//']
RE2JS.compile('/').split('a/b/cc//d/e//', 4) // ['a', 'b', 'cc', '/d/e//']
RE2JS.compile('/').split('a/b/cc//d/e//', 9) // ['a', 'b', 'cc', '', 'd', 'e', '', '']
RE2JS.compile(':').split('boo:and:foo', 2) // ['boo', 'and:foo']
RE2JS.compile(':').split('boo:and:foo', 5) // ['boo', 'and', 'foo']
```

### Working with Groups

RE2JS supports capturing groups in regex patterns

#### Group Count

You can get the count of groups in a pattern using the `groupCount()` function

```js
import { RE2JS } from 're2js'

RE2JS.compile('(.*)ab(.*)a').groupCount() // 2
RE2JS.compile('(.*)((a)b)(.*)a').groupCount() // 4
RE2JS.compile('(.*)(\\(a\\)b)(.*)a').groupCount() // 3
```

#### Named Groups

You can access the named groups in a pattern using the `namedGroups()` function

```js
import { RE2JS } from 're2js'

RE2JS.compile('(?P<foo>\\d{2})').namedGroups() // { foo: 1 }
RE2JS.compile('(?<bar>\\d{2})').namedGroups() // { bar: 1 }
RE2JS.compile('\\d{2}').namedGroups() // {}
RE2JS.compile('(?P<foo>.*)(?P<bar>.*)').namedGroups() // { foo: 1, bar: 2 }
```

#### Group Content

The `group()` method retrieves the content matched by a specific capturing group

```js
import { RE2JS } from 're2js'

const p = RE2JS.compile('(a)(b(c)?)d?(e)')
const matchString = p.matcher('xabdez')
if (matchString.find()) {
  matchString.group(0) // 'abde'
  matchString.group(1) // 'a'
  matchString.group(2) // 'b'
  matchString.group(3) // null
  matchString.group(4) // 'e'
}
```

#### Named Group Content

The `group()` method retrieves the content matched by a specific name of capturing group

```js
import { RE2JS } from 're2js'

// example with `(?P<name>expr)`
const p = RE2JS.compile(
  '(?P<baz>f(?P<foo>b*a(?P<another>r+)){0,10})(?P<bag>bag)?(?P<nomatch>zzz)?'
)
const matchString = p.matcher('fbbarrrrrbag')
if (matchString.matches()) {
  matchString.group('baz') // 'fbbarrrrr'
  matchString.group('foo') // 'bbarrrrr'
  matchString.group('another') // 'rrrrr'
  matchString.group('bag') // 'bag'
  matchString.group('nomatch') // null
}

// example with `(?<name>expr)`
const m = RE2JS.compile(
  '(?<baz>f(?<foo>b*a))'
)
const mString = m.matcher('fbba')
if (mString.matches()) {
  mString.group('baz') // 'fbba'
  mString.group('foo') // 'bba'
}
```

### Replacing Matches

RE2JS allows you to replace all occurrences or the first occurrence of a pattern match in a string with a specific replacement string

#### Replacing All Occurrences

The `replaceAll()` method replaces all occurrences of a pattern match in a string with the given replacement

```js
import { RE2JS } from 're2js'

RE2JS.compile('Frog')
  .matcher("What the Frog's Eye Tells the Frog's Brain")
  .replaceAll('Lizard') // "What the Lizard's Eye Tells the Lizard's Brain"
RE2JS.compile('(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)')
  .matcher('abcdefghijklmnopqrstuvwxyz123')
  .replaceAll('$10$20') // 'jb0wo0123'
```

Note that the replacement string can include references to capturing groups from the pattern

Parameters:
- `replacement (String)`: The string that replaces the substrings found. Capture groups and special characters in the replacement string have special behavior. For example:
  - `$&` refers to the entire matched substring
  - `$1, $2, ...` refer to the corresponding capture groups in the pattern
  - `$$` inserts a literal `$`
  - `$<name>` can be used to reference named capture groups
  - on invalid group - ignore it
- `javaMode (Boolean)`: If set to `true`, the replacement follows Java's rules for replacement. Defaults to `false`. If `javaMode = true`, changed rules for capture groups and special characters:
  - `$0` refers to the entire matched substring
  - `$1, $2, ...` refer to the corresponding capture groups in the pattern
  - `\$` inserts a literal `$`
  - `${name}` can be used to reference named capture groups
  - on invalid group - throw exception

Examples:

```js
import { RE2JS } from 're2js'

RE2JS.compile('(\\w+) (\\w+)')
  .matcher('Hello World')
  .replaceAll('$& - $&') // 'Hello World - Hello World'
RE2JS.compile('(\\w+) (\\w+)')
  .matcher('Hello World')
  .replaceAll('$0 - $0', true) // 'Hello World - Hello World'
```

#### Replacing the First Occurrence

The `replaceFirst()` method replaces the first occurrence of a pattern match in a string with the given replacement

```js
import { RE2JS } from 're2js'

RE2JS.compile('Frog')
  .matcher("What the Frog's Eye Tells the Frog's Brain")
  .replaceFirst('Lizard') // "What the Lizard's Eye Tells the Frog's Brain"
RE2JS.compile('(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)(.)')
  .matcher('abcdefghijklmnopqrstuvwxyz123')
  .replaceFirst('$10$20') // 'jb0nopqrstuvwxyz123'
```

Function support second argument `javaMode`, which work in the same way, as for `replaceAll` function

### Safe Replacements

When using untrusted user input as a replacement string, you must escape special characters so they aren't accidentally evaluated as capture groups (e.g., `$1`).

Use the static method `quoteReplacement(string, javaMode)` to safely escape these characters. **Note:** You must pass the same `javaMode` boolean to `quoteReplacement` that you plan to use in `replaceAll()` / `replaceFirst()`, because the two modes use different escaping logic

```js
import { RE2JS } from 're2js'

const text = 'The cost is 100 bucks.'
const regex = RE2JS.compile('100 bucks')
const unsafeUserInput = '$500'

// Safe (Default Mode)
const safeDefault = RE2JS.quoteReplacement(unsafeUserInput) // "\$500"
regex.matcher(text).replaceAll(safeDefault) // "The cost is $500."

// Safe (Java Mode)
const safeJava = RE2JS.quoteReplacement(unsafeUserInput, true) // "$$500"
regex.matcher(text).replaceAll(safeJava, true) // "The cost is $500."
```

### Escaping Special Characters

The `quote()` method returns a literal pattern string for the specified string. This can be useful if you want to search for a literal string pattern that may contain special characters

```js
import { RE2JS } from 're2js'

const regexp = RE2JS.quote('ab+c') // 'ab\\+c'

RE2JS.matches(regexp, 'ab+c') // true
RE2JS.matches(regexp, 'abc') // false
```

### Program size

The program size represents a very approximate measure of a regexp's "cost". Larger numbers are more expensive than smaller numbers

```js
import { RE2JS } from 're2js'

console.log(RE2JS.compile('^').programSize()); // Outputs: 3
console.log(RE2JS.compile('a+b').programSize()); // Outputs: 5
console.log(RE2JS.compile('(a+b?)').programSize()); // Outputs: 8
```

### Translating Regular Expressions

The `translateRegExp()` method preprocesses a given regular expression string to ensure compatibility with RE2JS.
It applies necessary transformations, such as escaping special characters, adjusting Unicode sequences, and converting named capture groups

```js
import { RE2JS } from 're2js'

const regexp = RE2JS.translateRegExp('(?<word>\\w+)') // '(?P<word>\\w+)'

RE2JS.matches(regexp, 'hello') // true
RE2JS.matches(regexp, '123') // true

const unicodeRegexp = RE2JS.translateRegExp('\\u{1F600}') // '\\x{1F600}'

RE2JS.matches(unicodeRegexp, '😀') // true
RE2JS.matches(unicodeRegexp, '😃') // false
```

## Performance

The RE2JS engine runs more slowly compared to native RegExp objects for simple queries. This reduced speed is also noticeable when comparing RE2JS to the original RE2 engine. The C++ implementation of the RE2 engine includes both NFA (Nondeterministic Finite Automaton) and DFA (Deterministic Finite Automaton) engines, as well as a variety of highly optimized memory operations. Russ Cox ported a simplified version of the NFA engine to Go. Later, Alan Donovan ported the NFA-based Go implementation to Java. I then ported the NFA-based Java implementation (plus Golang additions + Lazy DFA fast-path) to a pure JS version.

Should you require maximum absolute performance on the server side when using RE2, it would be beneficial to consider the following packages for JS:

 - [Node-RE2](https://github.com/uhop/node-re2/): A powerful RE2 C++ binding for Node.js
 - [RE2-WASM](https://github.com/google/re2-wasm/): This package is a WASM wrapper for RE2. Please note, as of now, it does not work in browsers

### RE2JS vs RE2-Node (C++ Bindings)

### RE2JS vs RE2-Node (C++ Bindings)

Because RE2JS implements a Just-In-Time (JIT) compiled DFA, it can perform incredibly close to native C++ bindings (`re2-node`) for many operations, avoiding the cross-boundary serialization costs between JavaScript and C++.

Here is a benchmark running 30,000 items through both engines using their respective `.test()` fast-paths:

| Benchmark Scenario        | Pattern Example            | RE2JS (Pure JS) | RE2-Node (C++) | Result                      |
|:--------------------------|:---------------------------|:----------------|:---------------|:----------------------------|
| **Bounded Repetition**    | `/[A-Z][a-z]{5,15}/`       | **11.79 ms**    | 14.09 ms       | `re2js` is **1.19x** faster |
| **Massive Alternation**   | `/White\|Blue\|Black.../`  | 15.30 ms        | **15.26 ms**   | Parity (`1.00x`)            |
| **Deep State Machine**    | `/([0-9]+(/[0-9]+)+)/`     | 19.24 ms        | **16.32 ms**   | `re2-node` is 1.18x faster  |
| **ReDoS Attempt**         | `/(a+)+!/`                 | 20.52 ms        | **17.07 ms**   | `re2-node` is 1.20x faster  |
| **Case Insensitive**      | `/(?i)swamp/`              | 20.12 ms        | **16.42 ms**   | `re2-node` is 1.23x faster  |
| **Greedy Wildcard**       | `/enters.*battlefield/`    | 18.83 ms        | **13.48 ms**   | `re2-node` is 1.40x faster  |
| **Lazy Wildcard**         | `/enters.*?battlefield/`   | 18.86 ms        | **13.51 ms**   | `re2-node` is 1.40x faster  |
| **Simple Literal**        | `/damage/`                 | 24.84 ms        | **13.21 ms**   | `re2-node` is 1.88x faster  |
| **Word Boundaries (NFA)** | `/\b(Flying\|First...)\b/` | 599.75 ms       | **15.87 ms**   | `re2-node` is 37.80x faster |

**Takeaways:**
* **DFA Strengths (JS wins/ties):** For state-heavy tasks like bounded repetitions (`{5,15}`) or massive alternations (`White|Blue|...`), RE2JS operates entirely within V8's highly optimized JIT. By avoiding the JS-to-C++ N-API bridge overhead, pure JavaScript actually outpaces or ties with the native bindings.
* **C++ Strengths:** For simple string scanning (like literal or wildcard searches), C++ wins. Native code can utilize highly optimized, hardware-level raw memory scanning instructions (like `memchr` and SIMD) that the JS engine cannot perfectly replicate.
* **The NFA Fallback:** Pure DFA engines mathematically cannot track look-behind context like Word Boundaries (`\b`). When RE2JS encounters these, it safely bails out to its NFA engine. As shown in the benchmarks, the pure JS NFA is significantly slower than the C++ NFA. **For maximum performance in RE2JS, avoid `\b` or capture groups when doing bulk boolean `.test()` matching.**

### RE2JS vs JavaScript's native RegExp

These examples illustrate the performance comparison between the RE2JS library and JavaScript's native `RegExp` for both a simple case and a ReDoS (Regular Expression Denial of Service) scenario.

```js
const regex = 'a+'
const string = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!'

// Running 30,000 iterations
RE2JS.compile(regex).test(string) // Total time: ~9.87 ms
new RegExp(regex).test(string)    // Total time: ~11.43 ms
```

For safe, simple patterns, the RE2JS DFA fast-path is heavily optimized and performs at parity with—or even slightly faster than—V8's native RegExp engine.

```js
const regex = '([a-z]+)+$'
const string = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!'

// Running 30,000 iterations
RE2JS.compile(regex).test(string) // Total time: ~454.17 ms
// Running EXACTLY 1 iteration
new RegExp(regex).test(string)    // Total time: ~105802.02 ms (over 105 seconds)
```

In the second example, a ReDoS scenario is depicted. The regular expression `([a-z]+)+$` is a potentially problematic one because it contains a nested quantifier. In standard NFA engines (like JavaScript's native `RegExp`), nested quantifiers can cause catastrophic backtracking. If a malicious user inputs a carefully crafted string, it results in exponentially high processing times, leading to a Denial of Service (DoS) attack.

RE2JS processed this poison-pill string **30,000 times in just ~454 milliseconds**, while the native RegExp completely locked up the main thread for **over 1 minute and 45 seconds trying to evaluate it just once**. This demonstrates why RE2JS is absolutely essential for securely handling untrusted regular expressions and protecting Node.js and browser applications against ReDoS attacks.

## Development

Some files like `CharGroup.js` and `UnicodeTables.js` is generated and should be edited in generator files

```bash
./tools/scripts/make_perl_groups.pl > src/CharGroup.js
yarn node ./tools/scripts/genUnicodeTable.js > src/UnicodeTables.js
```

To run `make_perl_groups.pl` you need to have install perl (version inside `.tool-versions`)

[Playground website](https://re2js.leopard.in.ua/) maintained in `www` branch
