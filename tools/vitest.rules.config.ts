import { defineConfig } from 'vitest/config';

/** Rules tests run against the Firestore emulator, one file at a time. */
export default defineConfig({
  test: {
    include: ['tools/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    fileParallelism: false,
  },
});
