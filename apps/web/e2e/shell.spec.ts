import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, 'console errors').toEqual([]));

async function expectAxeClean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.length} × ${v.help} [${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}] ${page.url()}`)).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('home shows the brand, the sections and the footer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('food basket');
  await expect(page.getByText('© 2026 Cottid Africa. All rights reserved.')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAxeClean(page);
});

test('every section is reachable from the navigation', async ({ page, isMobile }) => {
  await page.goto('/');
  const sections = ['Countries', 'Analytics', 'Cost of Imports', 'Directory', 'Policy and development', 'Data', 'About'];
  for (const name of sections) {
    if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('banner').getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
  await expectAxeClean(page);
});

test('Arabic switches the whole layout right to left', async ({ page }) => {
  await page.goto('/cost/calculator');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('navigation', { name: 'صفحات هذا القسم' }).getByRole('link', { name: 'الحاسبة' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAxeClean(page);
});

const DATA_PAGES = [
  '/countries', '/countries/NG', '/countries/KE/diet', '/countries/EG/trade', '/compare',
  '/analytics/planner', '/analytics/projections', '/analytics/review', '/analytics/advisory', '/analytics/briefs',
  '/cost/matrix', '/cost/calculator', '/cost/origins', '/cost/markets',
  '/directory/buyers', '/directory/sellers', '/directory/compliance', '/directory/events',
  '/policy/agreements', '/policy/interventions', '/policy/funders', '/policy/calls',
  '/data/explorer', '/data/apis', '/data/sources', '/about', '/about/methods', '/about/terms',
];
for (const path of DATA_PAGES) {
  test(`data page renders with real data: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main .animate-pulse')).toHaveCount(0);
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
}

test('data pages are accessible', async ({ page }) => {
  for (const path of ['/countries/KE', '/cost/calculator', '/directory/buyers', '/analytics/projections']) {
    await page.goto(path);
    await expect(page.locator('main .animate-pulse')).toHaveCount(0);
    // Let lazy chunks, data and fonts settle so axe scans the finished page, not a frame mid-render.
    await page.waitForLoadState('networkidle');
    await expectAxeClean(page);
  }
});

test('unknown pages show 404', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
});

test('the shell works offline after the first visit', async ({ page, context }) => {
  // Pages opened once while online keep working offline: the shell is precached, data is cached on use.
  await page.goto('/directory/events');
  await expect(page.locator('main table')).toBeVisible();
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Wait until the service worker controls the page, so navigations go through it.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // The page was fetched before the service worker took control, so open it once more under its control.
  await page.goto('/directory/events');
  await expect(page.locator('main table')).toBeVisible();

  await context.setOffline(true);
  await page.goto('/directory/events');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Events');
  await expect(page.locator('main table')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toBeVisible();
  await context.setOffline(false);
  // Requests that fail while offline (fonts not yet cached) are expected here.
  errors.splice(0, errors.length, ...errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|ERR_FAILED/.test(e)));
});
