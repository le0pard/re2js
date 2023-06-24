class RE2Flags {
  //// Parser flags.
  // Fold case during matching (case-insensitive).
  static FOLD_CASE = 0x01
  // Treat pattern as a literal string instead of a regexp.
  static LITERAL = 0x02
  // Allow character classes like [^a-z] and [[:space:]] to match newline.
  static CLASS_NL = 0x04
  // Allow '.' to match newline.
  static DOT_NL = 0x08
  // Treat ^ and $ as only matching at beginning and end of text, not
  // around embedded newlines.  (Perl's default).
  static ONE_LINE = 0x10
  // Make repetition operators default to non-greedy.
  static NON_GREEDY = 0x20
  // allow Perl extensions:
  //   non-capturing parens - (?: )
  //   non-greedy operators - *? +? ?? {}?
  //   flag edits - (?i) (?-i) (?i: )
  //     i - FoldCase
  //     m - !OneLine
  //     s - DotNL
  //     U - NonGreedy
  //   line ends: \A \z
  //   \Q and \E to disable/enable metacharacters
  //   (?P<name>expr) for named captures
  // \C (any byte) is not supported.
  static PERL_X = 0x40
  // Allow \p{Han}, \P{Han} for Unicode group and negation.
  static UNICODE_GROUPS = 0x80
  // Regexp END_TEXT was $, not \z.  Internal use only.
  static WAS_DOLLAR = 0x100

  static MATCH_NL = RE2Flags.CLASS_NL | RE2Flags.DOT_NL
  // As close to Perl as possible.
  static PERL = RE2Flags.CLASS_NL | RE2Flags.ONE_LINE | RE2Flags.PERL_X | RE2Flags.UNICODE_GROUPS
  // POSIX syntax.
  static POSIX = 0
  //// Anchors
  static UNANCHORED = 0
  static ANCHOR_START = 1
  static ANCHOR_BOTH = 2
}

export { RE2Flags }
