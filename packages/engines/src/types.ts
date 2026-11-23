/* eslint-disable @typescript-eslint/no-explicit-any */
/** Shapes of the reference datasets extracted from the legacy page (data/legacy/*.json). */

export type Series = Record<string, number | null>;

export interface TSMeta {
  built: string;
  hist_from: number;
  hist_to: number;
  window: [number, number];
  markets: Record<string, string>;
  core: string[];
  iso3: Record<string, string>;
  m49: Record<string, number>;
  regions: Record<string, string[]>;
  macro_series: { key: string; label: string; unit: string; src: string; code: string }[];
  food_groups: [string, string][];
  base_year: number;
  points: number;
  [k: string]: any;
}
export interface Commodity {
  label: string;
  basis: string;
  hs: string[];
  group: string;
  fg: string;
  [k: string]: any;
}
export interface TSData {
  meta: TSMeta;
  macro: Record<string, Record<string, Series>>;
  balance: Record<string, Record<string, Record<string, Series>>>;
  prices: Record<string, { label: string; unit: string; v: Series }>;
  price_index: Record<string, { label: string; v: Series }>;
  climate: {
    enso_by_year: Record<string, string>;
    status: string;
    status_date: string;
    points: { t: string; d: string; src: string[] }[];
  };
  comm: Record<string, Commodity>;
  backtest: any;
}

/** A trade flow: t = [thousand tonnes, US$ million]; r = partners [name, kt, US$ m]. */
export interface Flow {
  t: [number | null, number];
  r: [string, number | null, number][];
  b?: 'own' | 'mirror' | 'mixed';
  y?: number;
}
export interface FTData {
  year: number;
  foods: string[];
  staples: string[];
  hs: Record<string, string[]>;
  missing_x: string[];
  m: Record<string, { i?: Record<string, Flow>; e?: Record<string, Flow>; ri?: boolean; re?: boolean }>;
}
export type SELLData = Record<string, { b: 'I' | 'X'; y: number; c: Record<string, Flow> }>;

export interface NUTData {
  meta: { years: number[]; built: string; points: number; source: string; note: string };
  data: Record<
    string,
    { tot: { k: (number | null)[]; p: (number | null)[] }; f: Record<string, { k: (number | null)[]; p: (number | null)[] }> }
  >;
}

export interface Buyer {
  ref: string;
  country: string;
  name: string;
  city: string;
  type: string;
  segment: string;
  origins: string;
  evidence: string;
  src: string;
  status: string;
  commodities: string[];
  checked: string;
}
export interface Supplier {
  ref: string;
  origin: string;
  name: string;
  role: string;
  url: string;
  src: string;
  commodities: string[];
  status: string;
}
export interface ComplianceStep {
  country: string;
  authority: string;
  document: string;
  url: string;
  src: string;
  when: string;
  commodities: string[];
}
export interface REGData {
  buyers: Buyer[];
  suppliers: Supplier[];
  compliance: ComplianceStep[];
}
export interface Source {
  id: string;
  title: string;
  url: string;
  date: string;
}
export interface EventRec {
  k: string;
  when: string;
  name: string;
  city: string;
  country: string;
  scope: string;
  staples: string[];
  org: string;
  why: string;
  status: string;
  url: string;
  src: string;
}
export interface Policy {
  name: string;
  level: string;
  kind: string;
  body: string;
  c: string[];
  staples: string[];
  period: string;
  status: string;
  what: string;
  src: string;
}
export interface Intervention {
  name: string;
  funder: string;
  ft: string[];
  /** ISO2 codes, or "ALL" (every African country) or "SSA" (sub-Saharan Africa). */
  c: string[] | string;
  scope: string;
  staples: string[];
  types: string[];
  amount: string;
  period: string;
  what: string;
  src: string;
  st: string;
  y0: number | null;
  y1: number | null;
  /** Funding lines: [funder, funder type, US$ million or null]. */
  fund?: [string, string, number | null][];
}
export interface Call {
  name: string;
  funder: string;
  who: string;
  c: string[];
  staples: string[];
  types: string[];
  amount: string;
  dl: string;
  note: string;
  src: string;
}
export interface MapData {
  w: number;
  h: number;
  shapes: { id: string; name: string | null; d: string }[];
  offMap: string[];
}
export type ApiRow = [name: string, what: string, url: string, access: string, use: string];
export interface AboutData {
  version: string;
  updated: string;
  entity: string;
  contact: string;
  site: string;
  law: string;
}
export type LIBData = any;
