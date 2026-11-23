import type { Flow, FTData, SELLData, TSData } from './types';

/**
 * Food imports of one country, as the legacy food trade tab builds them (FTUI.impOf):
 * the newer foods from FT, the ten traded staples from the supplier dataset (SELL), at most eight
 * partners each with the remainder grouped as "Other (n)".
 */
export function importsOf(FT: FTData, SELL: SELLData, mid: string): Record<string, Flow> {
  const S: Record<string, Flow> = { ...(FT.m[mid]?.i ?? {}) };
  const L = SELL[mid];
  if (L) {
    for (const c of FT.staples) {
      const d = L.c[c];
      if (!d) continue;
      const r: Flow['r'] = d.r.slice(0, 8).map((x) => [x[0], x[1], x[2]]);
      if (d.r.length > 8) r.push([`Other (${d.r.length - 8})`, null, d.r.slice(8).reduce((a, x) => a + x[2], 0)]);
      S[c] = { t: d.t, r, b: L.b === 'I' ? 'own' : 'mirror', y: L.y };
    }
  }
  return S;
}

export const exportsOf = (FT: FTData, mid: string): Record<string, Flow> => FT.m[mid]?.e ?? {};

/** Total value (US$ million) of a set of flows. */
export const flowTotal = (S: Record<string, Flow> | undefined) =>
  Object.values(S ?? {}).reduce((a, x) => a + (x.t[1] || 0), 0);

export interface AfricaFoodTrade {
  c: string;
  i: number;
  e: number;
  ia: number;
  sup: Record<string, number>;
  dst: Record<string, number>;
}

/** All-Africa totals by food (FTUI.africa): imports, exports and the share bought from African countries. */
export function africaTrade(TS: TSData, FT: FTData, SELL: SELLData): AfricaFoodTrade[] {
  const AF = new Set(Object.values(TS.meta.markets));
  const mids = Object.keys(TS.meta.markets);
  const IMP: Record<string, Record<string, Flow>> = {};
  for (const m of mids) IMP[m] = importsOf(FT, SELL, m);
  return FT.foods.map((c) => {
    const x: AfricaFoodTrade = { c, i: 0, e: 0, ia: 0, sup: {}, dst: {} };
    for (const m of mids) {
      const a = IMP[m]![c];
      const b = FT.m[m]?.e?.[c];
      if (a) {
        x.i += a.t[1];
        for (const r of a.r) {
          if (/^Other \(/.test(r[0])) continue;
          x.sup[r[0]] = (x.sup[r[0]] ?? 0) + r[2];
          if (AF.has(r[0])) x.ia += r[2];
        }
      }
      if (b) {
        x.e += b.t[1];
        for (const r of b.r) {
          if (/^Other \(/.test(r[0])) continue;
          x.dst[r[0]] = (x.dst[r[0]] ?? 0) + r[2];
        }
      }
    }
    return x;
  });
}

/** Top partners as "Name 34%, Name 20%". */
export function topPartners(o: Record<string, number>, total: number, n = 3): string {
  return Object.entries(o)
    .sort((p, q) => q[1] - p[1])
    .slice(0, n)
    .map(([name, v]) => `${name} ${total ? Math.round((v / total) * 100) : 0}%`)
    .join(', ');
}
