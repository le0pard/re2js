process.env.TZ = 'UTC' // normalize timezone for tests

export default {
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'html'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^cable-shared/(.*)': '<rootDir>/shared/$1.js'
  }
}
