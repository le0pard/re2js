/**
 * Public flags for RE2JS and RE2Set compilation.
 */
const PublicFlags = {
  CASE_INSENSITIVE: 1, // case insensitive matching
  DOTALL: 2, // dot matches all characters, including newline
  MULTILINE: 4, // multiline matching
  DISABLE_UNICODE_GROUPS: 8, // unicode groups will be syntax errors
  LONGEST_MATCH: 16, // matches longest possible string
  LOOKBEHINDS: 512 // enable linear-time captureless lookbehinds
}

export { PublicFlags }
