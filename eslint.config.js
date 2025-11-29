import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import js from '@eslint/js'
import sveltePlugin from 'eslint-plugin-svelte'
import svelteConfig from './svelte.config.js'

export default defineConfig([
  globalIgnores([
    '**/.DS_Store',
    '**/node_modules',
    'build',
    '**/.svelte-kit',
    '**/.env',
    '**/.env.*',
    '**/yarn.lock'
  ]),
  js.configs.recommended,
  sveltePlugin.configs.recommended,
  {
    files: ['**/*.js', '**/*.svelte'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        svelteConfig
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  }
])
