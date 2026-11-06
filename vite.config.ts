import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // A generous default so a loaded machine cannot fail a test on Vitest's 5,000 ms limit.
    // Tests that set their own timeout (the property tests) keep it.
    testTimeout: 30_000,
  },
});
