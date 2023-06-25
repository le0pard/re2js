# RE2JS (RE2 regex engine) [![Test/Build/Deploy](https://github.com/le0pard/re2js/actions/workflows/tests.yml/badge.svg)](https://github.com/le0pard/re2js/actions/workflows/tests.yml)

### Development

Some files like `CharGroup.js` and `UnicodeTables.js` is generated and should be edited in generators, not dirrectly

```bash
./tools/scripts/make_perl_groups.pl  > src/CharGroup.js
yarn node ./tools/scripts/genUnicodeTable.js > src/UnicodeTables.js
```

To run `make_perl_groups.pl` you need to have install perl (version inside `.tool-versions`)
