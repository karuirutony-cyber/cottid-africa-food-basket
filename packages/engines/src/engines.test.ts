/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Advisor, Forecast as F, Staples as E, africaTrade, kt, usd, usdm } from './index';

const root = join(__dirname, '..', '..', '..');
const legacy = (n: string) => JSON.parse(readFileSync(join(root, 'data', 'legacy', `${n}.json`), 'utf8'));
const haveData = existsSync(join(root, 'data', 'legacy', 'TS.json'));
const golden: Record<string, any> = JSON.parse(readFileSync(join(__dirname, '..', 'test', 'golden.json'), 'utf8'));

/** Deep compare with numbers equal within 1e-6. */
function close(a: any, b: any, path = ''): void {
  if (typeof a === 'number' && typeof b === 'number') {
    expect(Math.abs(a - b), path).toBeLessThanOrEqual(1e-6);
  } else if (a && b && typeof a === 'object') {
    expect(Object.keys(a).sort(), path).toEqual(Object.keys(b).sort());
    for (const k of Object.keys(a)) close(a[k], b[k], `${path}.${k}`);
  } else expect(a, path).toEqual(b);
}

describe.runIf(haveData)('engines match the legacy page (golden files)', () => {
  const TS = haveData ? legacy('TS') : null;
  const LIB = haveData ? legacy('LIB') : null;
  const high = golden['scenario:high'];

  const cases = Object.keys(golden).filter((k) => k.startsWith('project:'));
  it('has at least 20 country, food and scenario cases', () => expect(cases.length).toBeGreaterThanOrEqual(20));

  for (const key of cases) {
    const [, cid, mid, sc] = key.split(':') as [string, string, string, string];
    it(`projection ${cid} ${mid} ${sc}`, () => {
      const pr = F.project(TS, cid, mid, sc === 'high' ? high : F.DEFAULTS);
      close(pr.ok ? pr.rows : pr, golden[key]);
      const notes = Advisor.advise(TS, LIB, cid, mid, 'importers', sc === 'high' ? high : F.DEFAULTS).notes.map((n) => n.t);
      expect(notes).toEqual(golden[`advise:${cid}:${mid}:${sc}`]);
    });
  }
  for (const mid of ['KE', 'NG', 'EG', 'ET']) {
    it(`country summary ${mid}`, () => close(F.countrySummary(TS, mid, F.DEFAULTS).totals, golden[`summary:${mid}`]));
  }
  for (const cid of ['rice', 'wheat', 'maize', 'sugar', 'oils']) {
    it(`landed-cost comparison ${cid} into Kenya`, () => {
      const v = E.forCommodity(LIB, cid);
      close(E.compare(v, 'KE').map((r) => [r.originId, r.total]), golden[`compare:${cid}:KE`]);
    });
  }
  it('Africa food trade 2024 totals US$77.6 bn imports and US$38.2 bn exports', () => {
    const A = africaTrade(TS, legacy('FT'), legacy('SELL'));
    expect(usd(A.reduce((a, x) => a + x.i, 0))).toBe('US$77.6 bn');
    expect(usd(A.reduce((a, x) => a + x.e, 0))).toBe('US$38.2 bn');
  });
});

describe('legacy formats', () => {
  it('formats tonnes and dollars as the legacy page did', () => {
    expect(kt(964.846)).toBe('965 kt');
    expect(kt(1186.649)).toBe('1.19 Mt');
    expect(kt(null)).toBe('n/a');
    expect(usdm(2436.7)).toBe('US$2.44bn');
    expect(usdm(504.81)).toBe('US$505m');
    expect(usd(0.05)).toBe('US$50 k');
  });
});
