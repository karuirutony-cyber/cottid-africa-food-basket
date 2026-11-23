/**
 * Performance budget (section 8): the JavaScript a first visit downloads before the page can render
 * (the entry script and every module it preloads) must stay under 250 KB gzipped.
 * Reads apps/web/dist (run after pnpm build). Exit 1 if over.
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const BUDGET_KB = 250;

const refs = new Set<string>();
for (const m of html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)) refs.add(m[1]!);
for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) refs.add(m[1]!);
const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]!);

const size = (p: string) => gzipSync(readFileSync(join(dist, p.replace(/^\//, '')))).length / 1024;
let js = 0;
for (const r of refs) {
  const kb = size(r);
  js += kb;
  console.log(`  ${r.padEnd(48)} ${kb.toFixed(1)} KB`);
}
const cssKb = css.reduce((a, c) => a + size(c), 0);
console.log(`Initial JavaScript: ${js.toFixed(1)} KB gzipped (budget ${BUDGET_KB} KB); CSS ${cssKb.toFixed(1)} KB.`);
if (js > BUDGET_KB) {
  console.error(`Over budget by ${(js - BUDGET_KB).toFixed(1)} KB.`);
  process.exit(1);
}
