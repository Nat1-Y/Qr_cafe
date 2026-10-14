// Backend tests. Unit specs need nothing; e2e specs run against a throwaway
// Postgres database (see test/global-setup.ts) — never a real one.
/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.spec.ts"],
  transform: {
    "^.+\.ts$": ["ts-jest", { tsconfig: "<rootDir>/test/tsconfig.json", isolatedModules: true }],
  },
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  globalSetup: "<rootDir>/test/global-setup.ts",
  // One shared test database; specs seed their own tenants but run serially.
  maxWorkers: 1,
  testTimeout: 30000,
};
