/**
 * Runs the legacy page in headless Chromium and records, from the page itself:
 *   data/content/{about,methods,terms}.html          the About, Methods and Terms panels as rendered
 *   packages/engines/test/golden.json                 engine outputs for 24 country/food/scenario cases
 * The golden file is what the engines package must reproduce (within 1e-6).
 * Usage: pnpm capture   (needs: pnpm --filter @afb/web exec playwright install chromium)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = pathToFileURL(join(root, 'legacy', 'platform_v33.html')).href;

const CASES: [cid: string, mid: string, sc: string][] = [];
const pairs = [
  ['rice', 'KE'], ['wheat', 'NG'], ['maize', 'ET'], ['rice', 'NG'], ['wheat', 'EG'], ['maize', 'KE'],
  ['sorghum', 'SD'], ['cassava', 'NG'], ['sugar', 'KE'], ['oils', 'EG'], ['pulses', 'ET'], ['millet', 'NE'],
];
for (const [c, m] of pairs) for (const s of ['base', 'high']) CASES.push([c!, m!, s]);

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.route(/^https?:/, (r) => r.abort()); // no network: fonts are irrelevant to the figures
const p = await ctx.newPage();
await p.goto(page, { waitUntil: 'load' });
await p.waitForFunction(() => !!(window as unknown as { CottidForecast?: unknown }).CottidForecast);

// Content panels
const outContent = join(root, 'data', 'content');
mkdirSync(outContent, { recursive: true });
for (const id of ['about', 'methods', 'terms']) {
  const html = await p.evaluate((sel) => document.querySelector(sel)?.innerHTML ?? '', `#p-${id}`);
  if (!html.trim()) throw new Error(`Panel #p-${id} is empty in the legacy page`);
  writeFileSync(join(outContent, `${id}.html`), html);
  console.log(`content ${id}: ${(html.length / 1024).toFixed(1)} KB`);
}

// Golden engine outputs, computed by the legacy page's own engines
/* eslint-disable @typescript-eslint/no-explicit-any */
const golden = await p.evaluate((cases) => {
  const w = window as unknown as Record<string, any>;
  const F = w.CottidForecast, ADV = w.CottidAdvisor, E = w.CottidStaples;
  // Constants declared with const in a classic script are global bindings, reachable by name.
  const TS = (0, eval)('TS'), LIB = (0, eval)('LIB');
  const high = Object.assign({}, F.DEFAULTS, { gdp: 1, pop: 0.5, price: 10 });
  const out: Record<string, unknown> = {};
  for (const [cid, mid, sc] of cases) {
    const s = sc === 'high' ? high : F.DEFAULTS;
    const pr = F.project(TS, cid, mid, s);
    out[`project:${cid}:${mid}:${sc}`] = pr.ok ? pr.rows : pr;
    out[`advise:${cid}:${mid}:${sc}`] = ADV.advise(TS, LIB, cid, mid, 'importers', s).notes.map((n: any) => n.t);
  }
  for (const mid of ['KE', 'NG', 'EG', 'ET']) out[`summary:${mid}`] = F.countrySummary(TS, mid, F.DEFAULTS).totals;
  for (const cid of ['rice', 'wheat', 'maize', 'sugar', 'oils']) {
    const v = E.forCommodity(LIB, cid);
    out[`compare:${cid}:KE`] = E.compare(v, 'KE').map((r: any) => [r.originId, r.total]);
  }
  out['scenario:high'] = high;
  return out;
}, CASES);
const outGolden = join(root, 'packages', 'engines', 'test');
mkdirSync(outGolden, { recursive: true });
writeFileSync(join(outGolden, 'golden.json'), JSON.stringify(golden));
console.log(`golden: ${Object.keys(golden).length} cases`);
await browser.close();
