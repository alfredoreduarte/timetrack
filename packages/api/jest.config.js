/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  setupFiles: ["<rootDir>/src/test/env.ts"],
  globalSetup: "<rootDir>/src/test/globalSetup.ts",
  // Integration tests share one Postgres database and truncate it between
  // tests, so they must not run in parallel workers.
  maxWorkers: 1,
  testTimeout: 20000,
};
