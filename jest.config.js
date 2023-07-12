process.env.TZ = 'UTC' // normalize timezone for tests

export default { // eslint-disable-line import/no-default-export
  transform: {},
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'html'],
  testEnvironment: 'jsdom'
}
