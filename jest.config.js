process.env.TZ = 'UTC' // normalize timezone for tests

export default {
  transform: {},
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'html'],
  testEnvironment: 'jsdom'
}
