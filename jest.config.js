// jest.config.js
const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });
module.exports = createJestConfig({
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/app/$1' },
  testMatch: ['**/__tests__/**/*.test.ts'],
});
