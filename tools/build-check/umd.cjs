// The UMD bundle, evaluated as a classic script would be in a browser: it must define the
// RE2JS global with every export.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const code = fs.readFileSync(path.join(__dirname, '..', '..', 'build', 'index.umd.js'), 'utf8')
const context = { TextEncoder, TextDecoder, console }
context.globalThis = context
context.self = context
vm.runInNewContext(code, context, { filename: 'index.umd.js' })
if (!context.RE2JS) {
  throw new Error('umd: the RE2JS global is not defined')
}
require('./checks.cjs')(context.RE2JS, 'umd')
