/**
 * Builds the web app's reference data from data/legacy/*.json (made by tools/extract.ts):
 *
 *   apps/web/public/data/<NAME>.json   each dataset, minified
 *   apps/web/public/data/summary.json  home-page figures precomputed with the engines (map measures, stats)
 *   apps/web/public/data/manifest.json version, build date, counts and checks passed
 *
 * Fails (exit 1) if any count in section 1 of the build prompt does not match.
 * Usage: pnpm build:data
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Forecast as F, africaTrade, exportsOf, flowTotal, importsOf } from '../packages/engines/src/index';
import type { FTData, NUTData, REGData, SELLData, Source, TSData, EventRec } from '../packages/engines/src/index';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'data', 'legacy');
const out = join(root, 'apps', 'web', 'public', 'data');
mkdirSync(out, { recursive: true });

const load = <T>(n: string): T => JSON.parse(readFileSync(join(src, `${n}.json`), 'utf8')) as T;
if (!existsSync(join(src, 'TS.json'))) {
  console.error('data/legacy is empty: run pnpm extract first.');
  process.exit(1);
}

const TS = load<TSData>('TS');
const FT = load<FTData>('FT');
const SELL = load<SELLData>('SELL');
const NUT = load<NUTData>('NUT');
const REG = load<REGData>('REG');
const SRC = load<Source[]>('SRC');
const EVENTS = load<EventRec[]>('EVENTS');

// ---- Checks (build prompt, section 1) --------------------------------------------------------------
const A = africaTrade(TS, FT, SELL);
const africaImports = A.reduce((a, x) => a + x.i, 0);
const africaExports = A.reduce((a, x) => a + x.e, 0);
const checks: [string, unknown, unknown][] = [
  ['countries', Object.keys(TS.meta.markets).length, 54],
  ['foods', Object.keys(TS.comm).length, 34],
  ['food groups', TS.meta.food_groups.length, 9],
  ['sources', SRC.length, 275],
  ['buyers', REG.buyers.length, 161],
  ['suppliers', REG.suppliers.length, 38],
  ['compliance entries', REG.compliance.length, 107],
  ['events', EVENTS.length, 35],
  ['Africa food imports 2024 (US$ bn)', (africaImports / 1000).toFixed(1), '77.6'],
  ['Africa food exports 2024 (US$ bn)', (africaExports / 1000).toFixed(1), '38.2'],
];
const failed = checks.filter(([, got, want]) => got !== want);
for (const [name, got, want] of checks) console.log(`${got === want ? 'ok  ' : 'FAIL'} ${name}: ${got}${got === want ? '' : ` (expected ${want})`}`);
if (failed.length) {
  console.error(`${failed.length} check(s) failed; data not published.`);
  process.exit(1);
}

// ---- Datasets ------------------------------------------------------------------------------------------
for (const f of readdirSync(src).filter((f) => f.endsWith('.json'))) copyFileSync(join(src, f), join(out, f));
// About, Methods and Terms as the legacy page renders them (tools/capture-legacy.ts).
const contentSrc = join(root, 'data', 'content');
mkdirSync(join(out, 'content'), { recursive: true });
for (const f of readdirSync(contentSrc)) copyFileSync(join(contentSrc, f), join(out, 'content', f));

// ---- Home summary: the five map measures per country, precomputed ---------------------------------------
const lastOf = (arr: (number | null)[] | undefined) => {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]!;
  return null;
};
const countries: Record<string, { ssr: number | null; imp: number | null; exp: number | null; kcal: number | null; prot: number | null }> = {};
let prod = 0;
let use = 0;
for (const mid of Object.keys(TS.meta.markets)) {
  const q = F.quickSSR(TS, mid, null);
  if (q) {
    prod += q.prod;
    use += q.use;
  }
  const I = importsOf(FT, SELL, mid);
  const E = exportsOf(FT, mid);
  const n = NUT.data[mid];
  countries[mid] = {
    ssr: q ? q.ssr : null,
    imp: Object.keys(I).length ? flowTotal(I) : null,
    exp: FT.m[mid]?.e ? flowTotal(E) : null,
    kcal: n ? lastOf(n.tot.k) : null,
    prot: n ? lastOf(n.tot.p) : null,
  };
}
const summary = {
  built: TS.meta.built,
  baseYear: F.BASE_YEAR,
  tradeYear: FT.year,
  nutYear: NUT.meta.years[NUT.meta.years.length - 1],
  countries,
  stats: {
    countries: Object.keys(TS.meta.markets).length,
    foods: Object.keys(TS.comm).length,
    groups: TS.meta.food_groups.length,
    grownAtHome: prod / use,
    horizon: F.BASE_YEAR + 5,
    points: TS.meta.points,
    africaImports,
    africaExports,
  },
  climate: TS.climate,
  backtest: { y1: TS.backtest.use.all.byH[1], y5: TS.backtest.use.all.byH[5] },
  markets: TS.meta.markets,
  regions: TS.meta.regions,
  core: TS.meta.core,
  foods: Object.fromEntries(Object.entries(TS.comm).map(([k, c]) => [k, { label: c.label, fg: c.fg }])),
  foodGroups: TS.meta.food_groups,
  traded: FT.staples,
};
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary));

const manifest = {
  version: `v33-${TS.meta.built}`,
  built: TS.meta.built,
  datasets: readdirSync(out).filter((f) => f.endsWith('.json') && f !== 'manifest.json'),
  checks: checks.map(([name, got]) => ({ name, value: got, passed: true })),
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Published ${manifest.datasets.length} datasets to apps/web/public/data (${manifest.version}).`);
