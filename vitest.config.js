/* oxlint-disable import/no-default-export */
import { defineConfig, configDefaults } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    globals: false,
    // CI runners are several times slower than a laptop; the heaviest engine tests come close
    // to the 5 s default there. Retries are deliberately not used: they would hide flakiness.
    testTimeout: process.env.CI ? 20000 : 5000,
    coverage: {
      provider: 'v8',
      reporter: ['json', 'lcov', 'text', 'clover', 'html'],
      include: ['src/**/*.js'],
      exclude: [
        'src/__tests__/**',
        'src/__utils__/**',
        'src/__fixtures__/**',
        // generated data tables
        'src/UnicodeTables.js',
        'src/CharGroup.js'
      ],
      // Fail when coverage drops below its current level (lines 95.8%, statements 95.6%,
      // functions 96.8%, branches 93.4% in October 2026)
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 96,
        branches: 93
      }
    },
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/__tests__/**/*.test.js'],
          // A test that asserts nothing passes whatever the code does
          expect: { requireAssertions: true }
        }
      },
      {
        test: {
          name: 'browser',
          include: ['src/__tests__/**/*.test.js'],
          expect: { requireAssertions: true },
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
