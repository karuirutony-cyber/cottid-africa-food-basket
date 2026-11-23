import { defineConfig, devices } from '@playwright/test';

/**
 * Account journeys against the Firebase emulators (Auth, Firestore, Functions), never production.
 * Run from the repo root: pnpm e2e:auth  (starts the emulators, builds in emulator mode, runs these).
 */
export default defineConfig({
  testDir: './e2e-emu',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['github']] : 'list',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile-400', use: { ...devices['Desktop Chrome'], viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'pnpm exec vite build --mode emulators --outDir dist-emu && pnpm exec vite preview --outDir dist-emu --port 4174',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
