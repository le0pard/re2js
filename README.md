# RE2JS is the JavaScript port of RE2, a regular expression engine that provides linear time matching
[![Test/Build/Deploy](https://github.com/le0pard/re2js/actions/workflows/tests.yml/badge.svg)](https://github.com/le0pard/re2js/actions/workflows/tests.yml)

## TLDR

The built-in JavaScript regular expression engine can, under certain special combinations, run in exponential time. This situation can trigger what's referred to as a [Regular Expression Denial of Service (ReDoS)](https://www.owasp.org/index.php/Regular_expression_Denial_of_Service_-_ReDoS). RE2, a different regular expression engine, can effectively safeguard your Node.js applications from ReDoS attacks. With RE2JS, this protective feature extends to browser environments as well, enabling you to utilize the RE2 engine more comprehensively.

## What is RE2?

RE2 is a regular expression engine designed to operate in time proportional to the size of the input, ensuring linear time complexity. RE2JS, on the other hand, is a pure JavaScript port of the [RE2 library](https://github.com/google/re2) — more specifically, it's a port of the [RE2/J library](https://github.com/google/re2j).

JavaScript standard regular expression package, [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions), and many other widely used regular expression packages such as PCRE, Perl and Python use a backtracking implementation strategy: when a pattern presents two alternatives such as a|b, the engine will try to match subpattern a first, and if that yields no match, it will reset the input stream and try to match b instead.

If such choices are deeply nested, this strategy requires an exponential number of passes over the input data before it can detect whether the input matches. If the input is large, it is easy to construct a pattern whose running time would exceed the lifetime of the universe. This creates a security risk when accepting regular expression patterns from untrusted sources, such as users of a web application.

In contrast, the RE2 algorithm explores all matches simultaneously in a single pass over the input data by using a nondeterministic finite automaton.

There are certain features of PCRE or Perl regular expressions that cannot be implemented in linear time, for example, backreferences, but the vast majority of regular expressions patterns in practice avoid such features.

## Usage

This document provides a series of examples demonstrating how to use RE2JS in your code. For more detailed information about regex syntax, please visit this page: [Google RE2 Syntax Documentation](https://github.com/google/re2/wiki/Syntax).

### Compiling Patterns

You can compile a regex pattern using the `RE2JS.compile()` function:

```js
import { RE2JS } from 're2js'

const p = RE2JS.compile('abc');
console.log(p.pattern()); // Outputs: 'abc'
console.log(p.flags()); // Outputs: 0
```

The `RE2JS.compile()` function also supports flags:

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
 * Flag: matches longest possible string.
 */
RE2JS.LONGEST_MATCH
```

### Checking for Matches

RE2JS allows you to check if a string matches a given regex pattern using the `RE2JS.matches()` function

```js
import { RE2JS } from 're2js'

RE2JS.matches('ab+c', 'abbbc') // true
RE2JS.matches('ab+c', 'cbbba') // false
// or
RE2JS.compile('ab+c').matches('abbbc') // true
RE2JS.compile('ab+c').matches('cbbba') // false
// with flags
RE2JS.compile('ab+c', RE2JS.CASE_INSENSITIVE).matches('AbBBc') // true
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

The `group()` method retrieves the content matched by a specific capturing group by name

```js
import { RE2JS } from 're2js'

const p = RE2JS.compile('(?P<baz>f(?P<foo>b*a(?P<another>r+)){0,10})(?P<bag>bag)?(?P<nomatch>zzz)?')
const matchString = p.matcher('fbbarrrrrbag')
if (matchString.matches()) {
  matchString.group('baz') // 'fbbarrrrr'
  matchString.group('foo') // 'bbarrrrr'
  matchString.group('another') // 'rrrrr'
  matchString.group('bag') // 'bag'
  matchString.group('nomatch') // null
}
```

### Replacing Matches



## Performance

The RE2JS engine runs more slowly compared to native RegExp objects. This reduced speed is also noticeable when comparing RE2JS to the original RE2 engine. The primary reason behind this is the lack of a synchronous threads solution within the browser environment. This deficiency is significant because the regex engine requires a synchronous API to operate optimally.

The C++ implementation of the RE2 engine includes both NFA (Nondeterministic Finite Automaton) and DFA (Deterministic Finite Automaton) engines, as well as a variety of optimizations. Russ Cox ported a simplified version of the NFA engine to Go. Later, Alan Donovan ported the NFA-based Go implementation to Java. I then ported the NFA-based Java implementation to a pure JS version. This is another reason why the pure JS version will perform more slowly compared to the original RE2 engine.

Should you require high performance on the server side when using RE2, it would be beneficial to consider the following packages for JS:

 - [Node-RE2](https://github.com/uhop/node-re2/): A powerful RE2 package for Node.js
 - [RE2-WASM](https://github.com/google/re2-wasm/): This package is a WASM wrapper for RE2. Please note, as of now, it does not work in browsers

## Justification for this JS port existence

There are several reasons that underscore the importance of having an RE2 vanilla JavaScript (JS) port.

Firstly, it enables RE2 JS validation on the client side within the browser. This is vital as it allows the implementation and execution of regular expression operations directly in the browser, enhancing performance by reducing the necessity of server-side computations and back-and-forth communication.

Secondly, it provides a platform for simple RE2 parsing, specifically for the extraction of regex groups. This feature is particularly useful when dealing with complex regular expressions, as it allows for the breakdown of regex patterns into manageable and identifiable segments or 'groups'.

These factors combined make the RE2 vanilla JS port a valuable tool for developers needing to work with complex regular expressions within a browser environment.

## Development

Some files like `CharGroup.js` and `UnicodeTables.js` is generated and should be edited in generator files

```bash
./tools/scripts/make_perl_groups.pl  > src/CharGroup.js
yarn node ./tools/scripts/genUnicodeTable.js > src/UnicodeTables.js
```

To run `make_perl_groups.pl` you need to have install perl (version inside `.tool-versions`)
