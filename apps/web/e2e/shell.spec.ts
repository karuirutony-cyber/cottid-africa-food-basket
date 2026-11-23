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
  expect(violations.map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)).toEqual([]);
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
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('الحاسبة');
  await expectNoHorizontalScroll(page);
  await expectAxeClean(page);
});

test('unknown pages show 404', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
});

test('the shell works offline after the first visit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Wait until the service worker controls the page, so navigations go through it.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.goto('/directory/events');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Events');
  await expect(page.getByRole('status')).toContainText('You are offline');
  await context.setOffline(false);
});
