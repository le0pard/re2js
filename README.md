# RE2JS - RE2 JS port of a linear time regular expression matching [![Test/Build/Deploy](https://github.com/le0pard/re2js/actions/workflows/tests.yml/badge.svg)](https://github.com/le0pard/re2js/actions/workflows/tests.yml)

## TLDR

The built-in JavaScript regular expression engine can, under certain special combinations, run in exponential time. This situation can trigger what's referred to as a [Regular Expression Denial of Service (ReDoS)](https://www.owasp.org/index.php/Regular_expression_Denial_of_Service_-_ReDoS). RE2, a different regular expression engine, can effectively safeguard your Node.js applications from ReDoS attacks. With RE2JS, this protective feature extends to browser environments as well, enabling you to utilize the RE2 engine more comprehensively.

## What is RE2?

RE2 is a regular expression engine designed to operate in time proportional to the size of the input, ensuring linear time complexity. RE2JS, on the other hand, is a pure JavaScript port of the [RE2 library](https://github.com/google/re2) — more specifically, it's a port of the [RE2/J library](https://github.com/google/re2j).

JavaScript standard regular expression package, [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions), and many other widely used regular expression packages such as PCRE, Perl and Python use a backtracking implementation strategy: when a pattern presents two alternatives such as a|b, the engine will try to match subpattern a first, and if that yields no match, it will reset the input stream and try to match b instead.

If such choices are deeply nested, this strategy requires an exponential number of passes over the input data before it can detect whether the input matches. If the input is large, it is easy to construct a pattern whose running time would exceed the lifetime of the universe. This creates a security risk when accepting regular expression patterns from untrusted sources, such as users of a web application.

In contrast, the RE2 algorithm explores all matches simultaneously in a single pass over the input data by using a nondeterministic finite automaton.

There are certain features of PCRE or Perl regular expressions that cannot be implemented in linear time, for example, backreferences, but the vast majority of regular expressions patterns in practice avoid such features.

## Usage


For more detailed information about regex syntax, please visit this page: [Google RE2 Syntax Documentation](https://github.com/google/re2/wiki/Syntax).

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
