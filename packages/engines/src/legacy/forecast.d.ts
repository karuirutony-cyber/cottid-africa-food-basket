/* Types for the generated legacy CottidForecast engine (forecast.js). Loose where the legacy shapes are wide. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Scenario {
  gdp: number;
  pop: number;
  price: number;
  fx: number;
  freight: number;
  prod: number;
  shockYear: number;
  shock: number;
  eta: number | null;
  eps: number | null;
  horizon: number;
}
export interface YearRow {
  prod: number | null;
  imp: number | null;
  exp: number | null;
  use: number | null;
  flag?: 'A' | 'E' | 'P';
  price?: number;
  balance?: number | null;
  ssr?: number | null;
  impVal?: number | null;
  expVal?: number | null;
  prodVal?: number | null;
  balVal?: number | null;
  [k: string]: any;
}
export interface CountrySummary {
  mid: string;
  years: number[];
  hist: [number, number];
  fc: [number, number];
  totals: Record<number, YearRow & { deficit: number; surplus: number; deficitVal: number; surplusVal: number }>;
  staples: {
    cid: string;
    label: string;
    group: string;
    fg: string;
    tradeOnly: boolean;
    rows: Record<number, YearRow>;
    lastActual: number | null;
    hasPrice: boolean;
  }[];
}
export interface Projection {
  ok: boolean;
  reason?: string;
  cid: string;
  mid: string;
  tradeOnly: boolean;
  base: { year: number; use: number; prod: number; imp: number; exp: number };
  rows: Record<string, any>[];
  best: any;
  notes: string[];
  params: Record<string, any>;
  summary: Record<string, any>;
}
declare const F: {
  BASE_YEAR: number;
  DEFAULTS: Scenario;
  quickSSR(TS: any, mid: string, cid: string | null): { ssr: number; prod: number; use: number } | null;
  countrySummary(TS: any, mid: string, scenario: Scenario): CountrySummary;
  sumPeriod(rows: Record<number, any>, a: number, z: number, keys: string[]): Record<string, number>;
  project(TS: any, cid: string, mid: string, scenario?: Scenario): Projection;
  plan(TS: any, cid: string, mid: string, opts: any): any;
  analyse(TS: any, cid: string, mid: string, from?: number, to?: number): any;
  backtest(TS: any): any;
  best(TS: any, cid: string, mid: string): any;
  refPrice(TS: any, cid: string, y: number): number | null;
  worldPrice(TS: any, cid: string, y: number): number | null;
  popAt(TS: any, mid: string, y: number): number | null;
  gdpGrowth(TS: any, mid: string, y: number): number | null;
  regionalTrend(TS: any, cid: string, upto: number, eta: number): any;
};
export default F;
