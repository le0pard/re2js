# RE2JS - RE2 JS port of a linear time regular expression matching [![Test/Build/Deploy](https://github.com/le0pard/re2js/actions/workflows/tests.yml/badge.svg)](https://github.com/le0pard/re2js/actions/workflows/tests.yml)

RE2 is a regular expression engine that runs in time linear in the size of the input. RE2JS is a port of a library RE2 to pure JavaScript.

JavaScript standard regular expression package, [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions), and many other widely used regular expression packages such as PCRE, Perl and Python use a backtracking implementation strategy: when a pattern presents two alternatives such as a|b, the engine will try to match subpattern a first, and if that yields no match, it will reset the input stream and try to match b instead.

If such choices are deeply nested, this strategy requires an exponential number of passes over the input data before it can detect whether the input matches. If the input is large, it is easy to construct a pattern whose running time would exceed the lifetime of the universe. This creates a security risk when accepting regular expression patterns from untrusted sources, such as users of a web application.

In contrast, the RE2 algorithm explores all matches simultaneously in a single pass over the input data by using a nondeterministic finite automaton.

There are certain features of PCRE or Perl regular expressions that cannot be implemented in linear time, for example, backreferences, but the vast majority of regular expressions patterns in practice avoid such features.

### Development

Some files like `CharGroup.js` and `UnicodeTables.js` is generated and should be edited in generators, not dirrectly

```bash
./tools/scripts/make_perl_groups.pl  > src/CharGroup.js
yarn node ./tools/scripts/genUnicodeTable.js > src/UnicodeTables.js
```

To run `make_perl_groups.pl` you need to have install perl (version inside `.tool-versions`)
