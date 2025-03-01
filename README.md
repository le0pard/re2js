# RE2JS is the JavaScript port of RE2, a regular expression engine that provides linear time matching
[![Test/Build/Deploy](https://github.com/le0pard/re2js/actions/workflows/tests.yml/badge.svg)](https://github.com/le0pard/re2js/actions/workflows/tests.yml)

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

RE2JS allows you to check if a string matches a given regex pattern using the `matches()` function

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
  - `$0` refers to the entire matched substring
  - `$1, $2, ...` refer to the corresponding capture groups in the pattern
  - `\$` inserts a literal `$`
  - `${name}` can be used to reference named capture groups
  - on invalid group - throw exception
- `perlMode (Boolean)`: If set to `true`, the replacement follows Perl/JS's rules for replacement. Defaults to `false`. If `perlMode = true`, changed rules for capture groups and special characters:
  - `$&` refers to the entire matched substring
  - `$1, $2, ...` refer to the corresponding capture groups in the pattern
  - `$$` inserts a literal `$`
  - `$<name>` can be used to reference named capture groups
  - on invalid group - ignore it

Examples:

```js
import { RE2JS } from 're2js'

RE2JS.compile('(\\w+) (\\w+)')
  .matcher('Hello World')
  .replaceAll('$0 - $0') // 'Hello World - Hello World'
RE2JS.compile('(\\w+) (\\w+)')
  .matcher('Hello World')
  .replaceAll('$& - $&', true) // 'Hello World - Hello World'
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

Function support second argument `perlMode`, which work in the same way, as for `replaceAll` function

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

## Performance

The RE2JS engine runs more slowly compared to native RegExp objects. This reduced speed is also noticeable when comparing RE2JS to the original RE2 engine. The C++ implementation of the RE2 engine includes both NFA (Nondeterministic Finite Automaton) and DFA (Deterministic Finite Automaton) engines, as well as a variety of optimizations. Russ Cox ported a simplified version of the NFA engine to Go. Later, Alan Donovan ported the NFA-based Go implementation to Java. I then ported the NFA-based Java implementation (plus Golang stuff, which are not present in Java implementation, like checks for regular expression complexity) to a pure JS version. This is another reason why the pure JS version will perform more slowly compared to the original RE2 engine.

Should you require high performance on the server side when using RE2, it would be beneficial to consider the following packages for JS:

 - [Node-RE2](https://github.com/uhop/node-re2/): A powerful RE2 package for Node.js
 - [RE2-WASM](https://github.com/google/re2-wasm/): This package is a WASM wrapper for RE2. Please note, as of now, it does not work in browsers

### RE2JS vs JavaScript's native RegExp

These examples illustrate the performance comparison between the RE2JS library and JavaScript's native RegExp for both a simple case and a ReDoS (Regular Expression Denial of Service) scenario

```js
const regex = 'a+'
const string = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!'

RE2JS.compile(regex).matcher(string).find() // avg: 5.657783601 ms
new RegExp(regex).test(string) // avg: 1.504824999 ms
```

The result shows that the RE2JS library took around **5.66 ms** on average to find a match, while the native RegExp took around **1.50 ms**. This indicates that, in this case, RegExp performed faster than RE2JS

```js
const regex = '([a-z]+)+$'
const string = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!'

RE2JS.compile(regex).matcher(string).find() // avg: 3.6155000030994415 ms
new RegExp(regex).test(string) // avg: 103768.25712499022 ms
```

In the second example, a ReDoS scenario is depicted. The regular expression `([a-z]+)+$` is a potentially problematic one, as it has a nested quantifier. Nested quantifiers can cause catastrophic backtracking, which results in high processing time, leading to a potential Denial of Service (DoS) attack if a malicious user inputs a carefully crafted string.

The string is the same as in the first example, which does not pose a problem for either RE2JS or RegExp under normal circumstances. However, when dealing with the nested quantifier, RE2JS took around **3.62 ms** to find a match, while RegExp took significantly longer, around **103768.26 ms (~103 seconds)**. This demonstrates that RE2JS is much more efficient in handling potentially harmful regular expressions, thus preventing ReDoS attacks.

In conclusion, while JavaScript's native RegExp might be faster for simple regular expressions, RE2JS offers significant performance advantages when dealing with complex or potentially dangerous regular expressions. RE2JS provides protection against excessive backtracking that could lead to performance issues or ReDoS attacks.

## Rationale for RE2 JavaScript port

There are several reasons that underscore the importance of having an RE2 vanilla JavaScript (JS) port.

Firstly, it enables RE2 JS validation on the client side within the browser. This is vital as it allows the implementation and execution of regular expression operations directly in the browser, enhancing performance by reducing the necessity of server-side computations and back-and-forth communication.

Secondly, it provides a platform for simple RE2 parsing, specifically for the extraction of regex groups. This feature is particularly useful when dealing with complex regular expressions, as it allows for the breakdown of regex patterns into manageable and identifiable segments or 'groups'.

These factors combined make the RE2 vanilla JS port a valuable tool for developers needing to work with complex regular expressions within a browser environment.

## Development

Some files like `CharGroup.js` and `UnicodeTables.js` is generated and should be edited in generator files

```bash
./tools/scripts/make_perl_groups.pl > src/CharGroup.js
yarn node ./tools/scripts/genUnicodeTable.js > src/UnicodeTables.js
```

To run `make_perl_groups.pl` you need to have install perl (version inside `.tool-versions`)

[Playground website](https://re2js.leopard.in.ua/) maintained in `www` branch
