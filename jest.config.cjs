module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/.test-dist/tests/**/*.test.js'],
  collectCoverageFrom: ['.test-dist/src/**/*.js'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
  },
  clearMocks: true,
  restoreMocks: true,
};
