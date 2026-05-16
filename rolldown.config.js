/* eslint-disable import/no-default-export */
import { defineConfig } from 'rolldown'
import pkg from './package.json' with { type: 'json' }

const LIBRARY_NAME = 'RE2JS' // Library name
const EXTERNAL = [] // external modules
const GLOBALS = {} // https://rollupjs.org/guide/en/#outputglobals
const OUTPUT_DIR = 'build'

const banner = `/*!
 * ${pkg.name}
 * ${pkg.description}
 *
 * @version v${pkg.version}
 * @author ${pkg.author}
 * @homepage ${pkg.homepage}
 * @repository ${pkg.repository}
 * @license ${pkg.license}
 */`

const sharedConfig = {
  banner,
  exports: 'auto',
  globals: GLOBALS,
  sourcemap: false
}

export default defineConfig({
  input: 'src/index.js',
  external: EXTERNAL,
  output: [
    {
      ...sharedConfig,
      name: LIBRARY_NAME,
      file: `${OUTPUT_DIR}/index.umd.js`, // UMD
      format: 'umd'
    },
    {
      ...sharedConfig,
      file: `${OUTPUT_DIR}/index.cjs`, // CommonJS
      format: 'cjs'
    },
    {
      ...sharedConfig,
      file: `${OUTPUT_DIR}/index.js`, // ESM
      format: 'es'
    }
  ]
})
