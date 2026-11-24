import { defineConfig, devices } from '@playwright/test';

/** Journeys run against the production build (vite preview) at 1280 px and 400 px. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One worker in CI: the parity, navigation and LCP journeys are timing-sensitive on shared runners.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    {
      name: 'mobile-400',
      use: { ...devices['Desktop Chrome'], viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true },
    },
  ],
  webServer: {
    command: 'pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
