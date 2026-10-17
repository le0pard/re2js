// ESM entry point, resolved through the package's own "exports" map.
import { createRequire } from 'node:module'
import * as lib from 're2js'

createRequire(import.meta.url)('./checks.cjs')(lib, 'esm')
