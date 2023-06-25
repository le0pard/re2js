import { expect, describe } from '@jest/globals'
import { RE2Flags } from '../RE2Flags'
import { Parser } from '../Parser'
import { Unicode } from '../Unicode'
import { dumpRegexp, mkCharClass } from '../__utils__/parser'

describe('.parse', () => {
  const cases = [
    ['a', 'lit{a}'],
    ['a.', 'cat{lit{a}dot{}}'],
    ['a.b', 'cat{lit{a}dot{}lit{b}}'],
    ['ab', 'str{ab}'],
    ['a.b.c', 'cat{lit{a}dot{}lit{b}dot{}lit{c}}'],
    ['abc', 'str{abc}'],
    ['a|^', 'alt{lit{a}bol{}}'],
    ['a|b', 'cc{0x61-0x62}'],
    ['(a)', 'cap{lit{a}}'],
    ['(a)|b', 'alt{cap{lit{a}}lit{b}}'],
    ['a*', 'star{lit{a}}'],
    ['a+', 'plus{lit{a}}'],
    ['a?', 'que{lit{a}}'],
    ['a{2}', 'rep{2,2 lit{a}}'],
    ['a{2,3}', 'rep{2,3 lit{a}}'],
    ['a{2,}', 'rep{2,-1 lit{a}}'],
    ['a*?', 'nstar{lit{a}}'],
    ['a+?', 'nplus{lit{a}}'],
    ['a??', 'nque{lit{a}}'],
    ['a{2}?', 'nrep{2,2 lit{a}}'],
    ['a{2,3}?', 'nrep{2,3 lit{a}}'],
    ['a{2,}?', 'nrep{2,-1 lit{a}}'],
    // Malformed { } are treated as literals.
    ['x{1001', 'str{x{1001}'],
    ['x{9876543210', 'str{x{9876543210}'],
    ['x{9876543210,', 'str{x{9876543210,}'],
    ['x{2,1', 'str{x{2,1}'],
    ['x{1,9876543210', 'str{x{1,9876543210}'],
    ['', 'emp{}'],
    ['|', 'emp{}'], // alt{emp{}emp{}} but got factored
    ['|x|', 'alt{emp{}lit{x}emp{}}'],
    ['.', 'dot{}'],
    ['^', 'bol{}'],
    ['$', 'eol{}'],
    ['\\|', 'lit{|}'],
    ['\\(', 'lit{(}'],
    ['\\)', 'lit{)}'],
    ['\\*', 'lit{*}'],
    ['\\+', 'lit{+}'],
    ['\\?', 'lit{?}'],
    ['{', 'lit{{}'],
    ['}', 'lit{}}'],
    ['\\.', 'lit{.}'],
    ['\\^', 'lit{^}'],
    ['\\$', 'lit{$}'],
    ['\\\\', 'lit{\\}'],
    ['[ace]', 'cc{0x61 0x63 0x65}'],
    ['[abc]', 'cc{0x61-0x63}'],
    ['[a-z]', 'cc{0x61-0x7a}'],
    ['[a]', 'lit{a}'],
    ['\\-', 'lit{-}'],
    ['-', 'lit{-}'],
    ['\\_', 'lit{_}'],
    ['abc', 'str{abc}'],
    ['abc|def', 'alt{str{abc}str{def}}'],
    ['abc|def|ghi', 'alt{str{abc}str{def}str{ghi}}'],

    // Posix and Perl extensions
    ['[[:lower:]]', 'cc{0x61-0x7a}'],
    ['[a-z]', 'cc{0x61-0x7a}'],
    ['[^[:lower:]]', 'cc{0x0-0x60 0x7b-0x10ffff}'],
    ['[[:^lower:]]', 'cc{0x0-0x60 0x7b-0x10ffff}'],
    ['(?i)[[:lower:]]', 'cc{0x41-0x5a 0x61-0x7a 0x17f 0x212a}'],
    ['(?i)[a-z]', 'cc{0x41-0x5a 0x61-0x7a 0x17f 0x212a}'],
    ['(?i)[^[:lower:]]', 'cc{0x0-0x40 0x5b-0x60 0x7b-0x17e 0x180-0x2129 0x212b-0x10ffff}'],
    ['(?i)[[:^lower:]]', 'cc{0x0-0x40 0x5b-0x60 0x7b-0x17e 0x180-0x2129 0x212b-0x10ffff}'],
    ['\\d', 'cc{0x30-0x39}'],
    ['\\D', 'cc{0x0-0x2f 0x3a-0x10ffff}'],
    ['\\s', 'cc{0x9-0xa 0xc-0xd 0x20}'],
    ['\\S', 'cc{0x0-0x8 0xb 0xe-0x1f 0x21-0x10ffff}'],
    ['\\w', 'cc{0x30-0x39 0x41-0x5a 0x5f 0x61-0x7a}'],
    ['\\W', 'cc{0x0-0x2f 0x3a-0x40 0x5b-0x5e 0x60 0x7b-0x10ffff}'],
    ['(?i)\\w', 'cc{0x30-0x39 0x41-0x5a 0x5f 0x61-0x7a 0x17f 0x212a}'],
    ['(?i)\\W', 'cc{0x0-0x2f 0x3a-0x40 0x5b-0x5e 0x60 0x7b-0x17e 0x180-0x2129 0x212b-0x10ffff}'],
    ['[^\\\\]', 'cc{0x0-0x5b 0x5d-0x10ffff}'],
    //  ["\\C", "byte{}"],  // probably never

    // Unicode, negatives, and a double negative.
    ['\\p{Braille}', 'cc{0x2800-0x28ff}'],
    ['\\P{Braille}', 'cc{0x0-0x27ff 0x2900-0x10ffff}'],
    ['\\p{^Braille}', 'cc{0x0-0x27ff 0x2900-0x10ffff}'],
    ['\\P{^Braille}', 'cc{0x2800-0x28ff}'],
    ['\\pZ', 'cc{0x20 0xa0 0x1680 0x2000-0x200a 0x2028-0x2029 0x202f 0x205f 0x3000}'],
    ['[\\p{Braille}]', 'cc{0x2800-0x28ff}'],
    ['[\\P{Braille}]', 'cc{0x0-0x27ff 0x2900-0x10ffff}'],
    ['[\\p{^Braille}]', 'cc{0x0-0x27ff 0x2900-0x10ffff}'],
    ['[\\P{^Braille}]', 'cc{0x2800-0x28ff}'],
    ['[\\pZ]', 'cc{0x20 0xa0 0x1680 0x2000-0x200a 0x2028-0x2029 0x202f 0x205f 0x3000}'],
    ['\\p{Lu}', mkCharClass((r) => Unicode.isUpper(r))],
    ['[\\p{Lu}]', mkCharClass((r) => Unicode.isUpper(r))],
    // ['(?i)[\\p{Lu}]', mkCharClass((r) => {
    //   if (Unicode.isUpper(r)) {
    //     return true
    //   }

    //   // let wasPassedFold = false
    //   // const foldC = Unicode.simpleFold(r)

    //   for (let c = Unicode.simpleFold(r); c !== r; c = Unicode.simpleFold(c)) {
    //     // if (foldC === c) {
    //     //   if (!wasPassedFold) {
    //     //     wasPassedFold = true
    //     //   } else {
    //     //     return false
    //     //   }
    //     // }

    //     if (Unicode.isUpper(c)) {
    //       return true
    //     }
    //   }
    //   return false
    // })],
    ['\\p{Any}', 'dot{}'],
    ['\\p{^Any}', 'cc{}'],

    // Hex, octal.
    ['[\\012-\\234]\\141', 'cat{cc{0xa-0x9c}lit{a}}'],
    ['[\\x{41}-\\x7a]\\x61', 'cat{cc{0x41-0x7a}lit{a}}'],

    // More interesting regular expressions.
    ['a{,2}', 'str{a{,2}}'],
    ['\\.\\^\\$\\\\', 'str{.^$\\}'],
    ['[a-zABC]', 'cc{0x41-0x43 0x61-0x7a}'],
    ['[^a]', 'cc{0x0-0x60 0x62-0x10ffff}'],
    ['[α-ε☺]', 'cc{0x3b1-0x3b5 0x263a}'], // utf-8
    ['a*{', 'cat{star{lit{a}}lit{{}}'],

    // Test precedences
    ['(?:ab)*', 'star{str{ab}}'],
    ['(ab)*', 'star{cap{str{ab}}}'],
    ['ab|cd', 'alt{str{ab}str{cd}}'],
    ['a(b|c)d', 'cat{lit{a}cap{cc{0x62-0x63}}lit{d}}'],

    // Test flattening.
    ['(?:a)', 'lit{a}'],
    ['(?:ab)(?:cd)', 'str{abcd}'],
    ['(?:a+b+)(?:c+d+)', 'cat{plus{lit{a}}plus{lit{b}}plus{lit{c}}plus{lit{d}}}'],
    ['(?:a+|b+)|(?:c+|d+)', 'alt{plus{lit{a}}plus{lit{b}}plus{lit{c}}plus{lit{d}}}'],
    ['(?:a|b)|(?:c|d)', 'cc{0x61-0x64}'],
    ['a|.', 'dot{}'],
    ['.|a', 'dot{}'],
    ['(?:[abc]|A|Z|hello|world)', 'alt{cc{0x41 0x5a 0x61-0x63}str{hello}str{world}}'],
    ['(?:[abc]|A|Z)', 'cc{0x41 0x5a 0x61-0x63}'],

    // Test Perl quoted literals
    ['\\Q+|*?{[\\E', 'str{+|*?{[}'],
    ['\\Q+\\E+', 'plus{lit{+}}'],
    ['\\Qab\\E+', 'cat{lit{a}plus{lit{b}}}'],
    ['\\Q\\\\E', 'lit{\\}'],
    ['\\Q\\\\\\E', 'str{\\\\}'],

    // Test Perl \A and \z
    ['(?m)^', 'bol{}'],
    ['(?m)$', 'eol{}'],
    ['(?-m)^', 'bot{}'],
    ['(?-m)$', 'eot{}'],
    ['(?m)\\A', 'bot{}'],
    ['(?m)\\z', 'eot{\\z}'],
    ['(?-m)\\A', 'bot{}'],
    ['(?-m)\\z', 'eot{\\z}'],

    // Test named captures
    ['(?P<name>a)', 'cap{name:lit{a}}'],

    // Case-folded literals
    ['[Aa]', 'litfold{A}'],
    ['[\\x{100}\\x{101}]', 'litfold{Ā}'],
    ['[Δδ]', 'litfold{Δ}'],

    // Strings
    ['abcde', 'str{abcde}'],
    ['[Aa][Bb]cd', 'cat{strfold{AB}str{cd}}'],

    // Factoring.
    [
      'abc|abd|aef|bcx|bcy',
      'alt{cat{lit{a}alt{cat{lit{b}cc{0x63-0x64}}str{ef}}}cat{str{bc}cc{0x78-0x79}}}'
    ],
    [
      'ax+y|ax+z|ay+w',
      'cat{lit{a}alt{cat{plus{lit{x}}lit{y}}cat{plus{lit{x}}lit{z}}cat{plus{lit{y}}lit{w}}}}'
    ],

    // Bug fixes.

    ['(?:.)', 'dot{}'],
    ['(?:x|(?:xa))', 'cat{lit{x}alt{emp{}lit{a}}}'],
    ['(?:.|(?:.a))', 'cat{dot{}alt{emp{}lit{a}}}'],
    ['(?:A(?:A|a))', 'cat{lit{A}litfold{A}}'],
    ['(?:A|a)', 'litfold{A}'],
    ['A|(?:A|a)', 'litfold{A}'],
    ['(?s).', 'dot{}'],
    ['(?-s).', 'dnl{}'],
    ['(?:(?:^).)', 'cat{bol{}dot{}}'],
    ['(?-s)(?:(?:^).)', 'cat{bol{}dnl{}}'],
    ['[\\x00-\\x{10FFFF}]', 'dot{}'],
    ['[^\\x00-\\x{10FFFF}]', 'cc{}'],
    ['(?:[a][a-])', 'cat{lit{a}cc{0x2d 0x61}}'],

    // RE2 prefix_tests
    ['abc|abd', 'cat{str{ab}cc{0x63-0x64}}'],
    ['a(?:b)c|abd', 'cat{str{ab}cc{0x63-0x64}}'],
    [
      'abc|abd|aef|bcx|bcy',
      'alt{cat{lit{a}alt{cat{lit{b}cc{0x63-0x64}}str{ef}}}cat{str{bc}cc{0x78-0x79}}}'
    ],
    ['abc|x|abd', 'alt{str{abc}lit{x}str{abd}}'],
    ['(?i)abc|ABD', 'cat{strfold{AB}cc{0x43-0x44 0x63-0x64}}'],
    ['[ab]c|[ab]d', 'cat{cc{0x61-0x62}cc{0x63-0x64}}'],
    ['.c|.d', 'cat{dot{}cc{0x63-0x64}}'],
    ['x{2}|x{2}[0-9]', 'cat{rep{2,2 lit{x}}alt{emp{}cc{0x30-0x39}}}'],
    ['x{2}y|x{2}[0-9]y', 'cat{rep{2,2 lit{x}}alt{lit{y}cat{cc{0x30-0x39}lit{y}}}}'],
    ['a.*?c|a.*?b', 'cat{lit{a}alt{cat{nstar{dot{}}lit{c}}cat{nstar{dot{}}lit{b}}}}']
  ]

  const flags = RE2Flags.MATCH_NL | RE2Flags.PERL_X | RE2Flags.UNICODE_GROUPS

  test.each(cases)('input %p returns %p', (input, expected) => {
    const re = Parser.parse(input, flags)
    expect(dumpRegexp(re)).toEqual(expected)
  })
})
