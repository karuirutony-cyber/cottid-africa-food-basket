/**
 * Turns the extracted legacy datasets into Firestore documents (section 3 of the build prompt).
 * Shared by `pnpm seed` (tools/seed.ts, Admin SDK) and the `bootstrap` Cloud Function.
 * Every record keeps its source IDs; nothing is added that the legacy page does not hold.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Forecast as F,
  exportsOf,
  importsOf,
  type FTData,
  type NUTData,
  type REGData,
  type SELLData,
  type Source,
  type TSData,
} from '../packages/engines/src/index';

export interface Datasets {
  TS: TSData;
  LIB: any;
  REG: REGData;
  SRC: Source[];
  NUT: NUTData;
  FT: FTData;
  SELL: SELLData;
  CALLS: any[];
  EVENTS: any[];
  POL: any[];
  DEVT: [string, string][];
  DEVF: Record<string, string>;
  PROG: any[];
  /** Name translations from locales/<lang>/names.json, keyed by English name. */
  names: Record<string, Record<string, string>>;
}

export interface SeedDoc {
  path: string; // collection/docId
  data: Record<string, unknown>;
}

export const LANGS = ['en', 'fr', 'pt', 'ar', 'sw'] as const;

/** Balance series keys -> the dataset source they come from. */
export function seriesSource(key: string): string | null {
  if (key.startsWith('fao_')) return 'D1';
  if (key.startsWith('crop_') || key === 'yield_stats') return 'D2';
  if (key === 'usda') return 'D6';
  if (key.startsWith('trade_')) return 'D5';
  return null;
}
const MACRO_SRC: Record<string, string> = { WDI: 'D3', WPP: 'D4', IMF: 'D7' };

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
const srcIds = (s: string | string[] | undefined) =>
  (Array.isArray(s) ? s : (s ?? '').split(/[;,\s]+/)).filter(Boolean);
const named = (D: Datasets, en: string) => Object.fromEntries(LANGS.map((l) => [l, D.names[l]?.[en] ?? en]));
/** Firestore keys: no '.', '/', or leading '__'. Years and series names are safe. */

export function buildDocs(D: Datasets, now = new Date().toISOString().slice(0, 10)): SeedDoc[] {
  const { TS, FT, SELL, NUT, REG, LIB } = D;
  const out: SeedDoc[] = [];
  const add = (path: string, data: Record<string, unknown>) => out.push({ path, data });
  const regionOf = (id: string) => Object.entries(TS.meta.regions).find(([, ids]) => ids.includes(id))?.[0] ?? null;
  const mids = Object.keys(TS.meta.markets);

  // meta/dataset
  const years = new Set<number>();
  for (const f of Object.values(TS.balance)) for (const m of Object.values(f)) for (const s of Object.values(m)) Object.keys(s ?? {}).forEach((y) => years.add(+y));
  add('meta/dataset', {
    version: `v33-${TS.meta.built}`,
    built: TS.meta.built,
    seeded: now,
    sourceCount: D.SRC.length,
    sourceCounts: D.SRC.reduce<Record<string, number>>((a, s) => ((a[s.id[0]!] = (a[s.id[0]!] ?? 0) + 1), a), {}),
    recordYears: [Math.min(...years), Math.max(...years)],
    histFrom: TS.meta.hist_from,
    histTo: TS.meta.hist_to,
    baseYear: F.BASE_YEAR,
    projectionHorizon: F.BASE_YEAR + 5,
    points: TS.meta.points,
    tradeYear: FT.year,
  });

  // countries
  for (const mid of mids) {
    const en = TS.meta.markets[mid]!;
    const macro: Record<string, unknown> = {};
    for (const s of TS.meta.macro_series) {
      const v = TS.macro[mid]?.[s.key];
      if (v) macro[s.key] = { values: v, unit: s.unit, label: s.label, src: MACRO_SRC[s.src] ?? null, code: s.code };
    }
    const blocs = (LIB.markets as any[]).find((m) => m.id === mid)?.prefBlocs ?? [];
    add(`countries/${mid}`, {
      iso2: mid,
      iso3: TS.meta.iso3?.[mid] ?? null,
      m49: TS.meta.m49?.[mid] ?? null,
      name: named(D, en),
      region: regionOf(mid),
      core: TS.meta.core.includes(mid),
      blocs,
      macro,
    });
  }

  // foods
  for (const [id, c] of Object.entries(TS.comm)) {
    add(`foods/${id}`, {
      id,
      name: named(D, c.label),
      group: c.fg,
      groupName: TS.meta.food_groups.find((g) => g[0] === c.fg)?.[1] ?? null,
      basis: c.basis,
      units: 'thousand tonnes',
      hs: c.hs ?? [],
      traded: FT.staples.includes(id),
    });
  }

  // series, projections
  for (const [food, byMid] of Object.entries(TS.balance)) {
    for (const [mid, series] of Object.entries(byMid)) {
      const s: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(series)) s[k] = { values: v, src: seriesSource(k) };
      add(`series/${mid}_${food}`, { iso2: mid, food, unit: 'thousand tonnes', series: s });
      const pr = F.project(TS, food, mid, F.DEFAULTS);
      if (pr.ok) {
        add(`projections/${mid}_${food}_base`, {
          iso2: mid,
          food,
          scenario: 'base',
          engine: 'legacy-v33',
          rows: pr.rows.map((r) => ({ year: r.year, use: r.use, prod: r.prod, imp: r.imp, exp: r.exp, impLo: r.impLo, impHi: r.impHi, useLo: r.useLo, useHi: r.useHi })),
          summary: pr.summary,
          src: ['D1', 'D2', 'D3', 'D4', 'D6', 'D7', 'K2', 'A14'],
        });
      }
    }
  }

  // nutrition
  for (const [mid, d] of Object.entries(NUT.data)) add(`nutrition/${mid}`, { iso2: mid, years: NUT.meta.years, total: d.tot, foods: d.f, src: ['D1'] });

  // trade
  for (const mid of mids) {
    const imports = importsOf(FT, SELL, mid);
    const exp = exportsOf(FT, mid);
    if (!Object.keys(imports).length && !Object.keys(exp).length) continue;
    const flows = (S: Record<string, any>) =>
      Object.fromEntries(Object.entries(S).map(([c, f]) => [c, { kt: f.t[0], usdm: f.t[1], partners: f.r.map((r: any[]) => ({ name: r[0], kt: r[1], usdm: r[2] })), basis: f.b ?? 'own', year: f.y ?? FT.year }]));
    add(`trade/${FT.year}_${mid}`, { iso2: mid, year: FT.year, imports: flows(imports), exports: flows(exp), src: ['D5'] });
  }

  // cost of imports library: prices (FOB by origin and grade), fx, duties, rate cards
  for (const c of LIB.commodities as any[]) {
    add(`prices/${c.id}`, {
      commodity: c.id,
      worldPrice: TS.prices[c.id] ?? null,
      worldNotes: Array.isArray(c.world) ? c.world : [],
      origins: (c.origins ?? []).map((o: any) => ({ id: o.id, name: o.name, port: o.port ?? null, regional: !!o.regional, grades: o.grades, policy: o.policy ?? null })),
      date: LIB.meta.date,
    });
    add(`rateCards/${c.id}`, { commodity: c.id, ocean: c.ocean ?? {}, ports: LIB.ports, insuranceRate: LIB.insuranceRate, date: LIB.meta.date, src: ['A3', 'A10'] });
    for (const [mid, regimes] of Object.entries((c.duty ?? {}) as Record<string, any[]>)) {
      add(`duties/${c.id}_${mid}`, {
        commodity: c.id,
        market: mid,
        regimes,
        vat: c.vat?.[mid] ?? null,
        date: LIB.meta.date,
        src: [...new Set(regimes.flatMap((r) => srcIds(r.src)))],
      });
    }
  }
  add('fx/latest', { ...LIB.meta.fx, date: LIB.meta.date });

  // directory and policy records: status verified or lead, checked date, source IDs
  const status = (s: string) => (/^verified/i.test(s ?? '') ? 'verified' : 'lead');
  for (const b of REG.buyers) add(`buyers/${b.ref}`, { ...b, status: status(b.status), statusText: b.status, src: srcIds(b.src) });
  for (const s of REG.suppliers) add(`suppliers/${s.ref}`, { ...s, status: status(s.status), statusText: s.status, checked: null, src: srcIds(s.src) });
  const seen = new Map<string, number>();
  const uniq = (base: string) => {
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
  for (const c of REG.compliance) add(`compliance/${uniq(slug(`${c.country}-${c.authority}`))}`, { ...c, status: 'verified', checked: null, src: srcIds(c.src) });
  for (const e of D.EVENTS) add(`events/${uniq(slug(`${e.k}-${e.name}`))}`, { ...e, date: e.k, status: e.status, src: srcIds(e.src) });
  for (const c of D.CALLS) add(`calls/${uniq(slug(`${c.funder}-${c.name}`))}`, { ...c, deadline: c.dl, status: 'verified', src: srcIds(c.src) });
  for (const p of D.POL) add(`policies/${uniq(slug(p.name))}`, { ...p, status: p.status, src: srcIds(p.src) });
  // `fund` rows are [funder, funder type, US$ million]; Firestore cannot hold arrays inside arrays.
  for (const p of D.PROG)
    add(`interventions/${uniq(slug(p.name))}`, {
      ...p,
      fund: (p.fund ?? []).map(([name, type, usdm]: [string, string, number | null]) => ({ name, type, usdm })),
      countries: p.c,
      src: srcIds(p.src),
    });
  const funders = new Map<string, any[]>();
  for (const p of D.PROG) funders.set(p.funder, [...(funders.get(p.funder) ?? []), p]);
  for (const [name, list] of funders)
    add(`funders/${uniq(slug(name))}`, {
      name,
      types: [...new Set(list.flatMap((p) => p.ft))],
      typeNames: [...new Set(list.flatMap((p) => p.ft))].map((t) => D.DEVF[t] ?? t),
      programmes: list.map((p) => p.name),
      src: [...new Set(list.flatMap((p) => srcIds(p.src)))],
    });

  // sources
  for (const s of D.SRC) add(`sources/${s.id}`, { id: s.id, title: s.title, publisher: s.title.split(',')[0] ?? null, url: s.url, dateRead: s.date });

  return out;
}

/** Defaults for settings/platform, written only if the document does not exist. */
export const PLATFORM_DEFAULTS = {
  languages: [...LANGS],
  defaultLanguage: 'en',
  features: { submissions: true, alerts: false, api: false, organisations: false, briefs: true },
  apiQuotas: { free: 1000, member: 10000, org: 100000 },
  maintenance: false,
};

/** Group documents by collection for logging. */
export function countByCollection(docs: SeedDoc[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const d of docs) {
    const coll = d.path.split('/')[0]!;
    c[coll] = (c[coll] ?? 0) + 1;
  }
  return c;
}
