import { expect, test } from '@playwright/test';

/*
 * Performance budget (section 8): home page LCP under 2.5 s on a 4G phone, first visit (nothing cached).
 * Throttling follows Lighthouse's mobile profile: 150 ms round trip, 1.6 Mbit/s down, 750 kbit/s up,
 * CPU slowed 4x.
 */
test('home LCP is under 2.5 s on throttled 4G', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium' || info.project.name !== 'mobile-400', 'Chromium phone profile only');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(3000); // let late candidates (web fonts) report
  const lcp = await page.evaluate(
    () =>
      new Promise<{ t: number; el: string }>((resolve) => {
        new PerformanceObserver((list) => {
          const e = list.getEntries().at(-1) as PerformanceEntry & { element?: Element };
          resolve({ t: e.startTime, el: e.element ? `${e.element.tagName}.${(e.element as HTMLElement).className}`.slice(0, 80) : '' });
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      }),
  );
  console.log(`LCP ${Math.round(lcp.t)} ms (${lcp.el})`);
  expect(lcp.t).toBeLessThan(2500);
});
