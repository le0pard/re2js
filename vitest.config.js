/* eslint-disable import/no-unresolved, import/no-default-export */
import { defineConfig, configDefaults } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['json', 'lcov', 'text', 'clover', 'html']
    },
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/__tests__/**/*.test.js']
        }
      },
      {
        test: {
          name: 'browser',
          include: ['src/__tests__/**/*.test.js'],
          exclude: [...configDefaults.exclude, '**/Exec.test.js'], // Exec contain node.js specific tests
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }]
          }
        }
      }
    ]
  }
})
