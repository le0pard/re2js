process.env.TZ = 'UTC' // normalize timezone for tests

// eslint-disable-next-line import/no-default-export
export default {
  transform: {},
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'html'],
  testEnvironment: 'jsdom',
  clearMocks: true
}
