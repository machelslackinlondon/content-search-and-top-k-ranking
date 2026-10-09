module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/.test-dist/tests/**/*.test.js'],
  collectCoverageFrom: ['.test-dist/src/**/*.js'],
  coverageDirectory: 'coverage',
  clearMocks: true,
  restoreMocks: true,
};
