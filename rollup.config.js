import alias from '@rollup/plugin-alias'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import { babel } from '@rollup/plugin-babel'
import terser from '@rollup/plugin-terser'
import pkg from './package.json' assert { type: 'json' }

const LIBRARY_NAME = 'RE2JS' // Library name
const EXTERNAL = [] // external modules
const GLOBALS = {} // https://rollupjs.org/guide/en/#outputglobals
const OUTPUT_DIR = 'build'

const makeConfig = (env = 'development') => {
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

  let config = {
    input: 'src/index.js',
    external: EXTERNAL,
    output: [
      {
        banner,
        name: LIBRARY_NAME,
        file: `${OUTPUT_DIR}/index.umd.js`, // UMD
        format: 'umd',
        exports: 'auto',
        globals: GLOBALS,
        sourcemap: true
      },
      {
        banner,
        file: `${OUTPUT_DIR}/index.cjs.js`, // CommonJS
        format: 'cjs',
        exports: 'auto',
        globals: GLOBALS,
        sourcemap: true
      },
      {
        banner,
        file: `${OUTPUT_DIR}/index.esm.js`, // ESM
        format: 'es',
        exports: 'auto',
        globals: GLOBALS,
        sourcemap: true
      }
    ],
    plugins: [
      alias(),
      resolve(), // teach Rollup how to find external modules
      commonjs(), // so Rollup can convert external modules to an ES module
      babel({
        babelHelpers: 'bundled',
        exclude: ['node_modules/**']
      })
    ]
  }

  if (env === 'production') {
    config.plugins.push(
      terser({
        sourceMap: true,
        output: {
          comments: /^!/
        }
      })
    )
  }

  return config
}

export default (commandLineArgs) => {
  if (commandLineArgs.environment === 'production') {
    return makeConfig('production')
  }

  return makeConfig()
}
