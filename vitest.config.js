import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globalSetup: ['tests/globalSetup.js'],
    setupFiles: ['tests/setup.js'],
    // Integration tests share one PostgreSQL database and reset it between
    // tests, so they cannot run in parallel against each other. A single fork
    // keeps them serialised; the suite is fast enough that this costs little.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // The concurrency test deliberately holds a row lock while a second
    // connection blocks on it, so the default 5s is too tight.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary', 'html'],
      include: ['server/**/*.js'],
      exclude: ['server/node_modules/**', 'server/server.js'],
    },
  },
});
