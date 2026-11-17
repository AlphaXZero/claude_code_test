import { defineConfig } from 'vitest/config';

// Integration tests: start the built API (dist/) on a test database.
// Needs TEST_DATABASE_URL, a database whose name contains "test": its tables are emptied at each run.
export default defineConfig({
  test: { include: ['test/int/*.int.ts'], testTimeout: 30_000, hookTimeout: 120_000, fileParallelism: false },
});
