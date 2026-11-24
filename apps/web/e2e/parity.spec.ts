import { expect, test } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/*
 * Parity with the legacy page (M4): the country summary narrative, which carries the record and outlook
 * totals in tonnes and dollars, must read identically for Kenya, Nigeria, Egypt and Ethiopia.
 */
const legacyUrl = pathToFileURL(join(__dirname, '..', '..', '..', 'legacy', 'platform_v33.html')).href;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const pick = (text: string, start: string) => {
  const line = text.split('\n').find((l) => l.trim().startsWith(start));
  return line ? norm(line) : null;
};

test.describe.configure({ mode: 'serial' });
// Each case loads the 3.9 MB legacy page and recomputes a country; allow for a busy CI machine.
test.setTimeout(120_000);

for (const mid of ['KE', 'NG', 'EG', 'ET']) {
  test(`country summary matches the legacy page: ${mid}`, async ({ page, browser }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'parity runs once');
    const legacy = await browser.newPage();
    await legacy.route(/^https?:/, (r) => r.abort());
    await legacy.goto(legacyUrl);
    await legacy.waitForFunction(() => typeof (window as unknown as { setMarket?: unknown }).setMarket === 'function');
    const legacyText = await legacy.evaluate((m) => {
      (window as unknown as { setMarket: (m: string) => void }).setMarket(m);
      return (document.querySelector('#p-countries') as HTMLElement).innerText;
    }, mid);
    await legacy.close();

    await page.goto(`/countries/${mid}`);
    await expect(page.getByText(/^The record,/)).toBeVisible();
    const ours = await page.locator('main').innerText();

    // The legacy page runs its paragraphs together in innerText; compare sentence by sentence.
    const L = norm(legacyText);
    const record = pick(ours, 'The record,')!;
    const outlook = pick(ours, 'The outlook,')!;
    expect(record).toBeTruthy();
    expect(outlook).toBeTruthy();
    expect(L).toContain(record);
    expect(L).toContain(outlook);
  });
}
