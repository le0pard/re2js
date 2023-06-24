class RE2Flags {
  static FOLD_CASE = 1
  static LITERAL = 2
  static CLASS_NL = 4
  static DOT_NL = 8
  static ONE_LINE = 16
  static NON_GREEDY = 32
  static PERL_X = 64
  static UNICODE_GROUPS = 128
  static WAS_DOLLAR = 256
  static MATCH_NL = RE2Flags.CLASS_NL | RE2Flags.DOT_NL
  static PERL = RE2Flags.CLASS_NL | RE2Flags.ONE_LINE | RE2Flags.PERL_X | RE2Flags.UNICODE_GROUPS
  static POSIX = 0
  static UNANCHORED = 0
  static ANCHOR_START = 1
  static ANCHOR_BOTH = 2
}

export { RE2Flags }
