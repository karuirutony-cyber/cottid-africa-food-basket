import { defineConfig } from 'vitest/config';

/** The Vercel server (apps/web/api) against the auth and Firestore emulators. */
export default defineConfig({
  test: {
    include: ['apps/web/api-test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    fileParallelism: false,
  },
});
