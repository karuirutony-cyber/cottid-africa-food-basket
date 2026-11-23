import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Advisor as ADV, Forecast as F, kt, pc, q0, usdm, type TSData } from '@afb/engines';
import { useDatasets } from '@/data/datasets';
import { Card, Csv, DataState, Kpi, KpiRow, Page, Pill, Select, SourceFooter } from '@/components/ui';
import { StackChart } from '@/components/charts';
import { CountrySelect, FoodSelect } from '@/components/pickers';
import { NotFound } from '@/pages/SystemPage';
import { CountryTabs, useGo } from './shared';

const KEYS = ['prod', 'imp', 'exp', 'use', 'deficit', 'surplus', 'impVal', 'expVal', 'prodVal', 'deficitVal', 'surplusVal'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any> & { flag?: string; noVal?: boolean; noProd?: boolean };

const latest = (s: Record<string, number | null> | undefined) => {
  if (!s) return null;
  const ys = Object.keys(s)
    .filter((y) => s[y] != null)
    .sort();
  const y = ys[ys.length - 1];
  return y ? { y, v: s[y]! } : null;
};

export default function Country() {
  const { iso2 = '' } = useParams();
  const mid = iso2.toUpperCase();
  const { data, loading, error } = useDatasets('TS', 'summary');
  const [staple, setStaple] = useState('all');
  const [period, setPeriod] = useState<'h' | 'f' | string>('h');
  const go = useGo();

  const S = useMemo(() => (data && data.TS.meta.markets[mid] ? F.countrySummary(data.TS, mid, F.DEFAULTS) : null), [data, mid]);
  if (!data) return <DataState loading={loading} error={error} />;
  const TS = data.TS as TSData;
  if (!TS.meta.markets[mid] || !S) return <NotFound />;

  const name = TS.meta.markets[mid]!;
  const core = TS.meta.core.includes(mid);
  const BY = F.BASE_YEAR;
  const st = staple === 'all' ? null : S.staples.find((x) => x.cid === staple) ?? null;
  const rowOf = (y: number): Row => {
    if (!st) return S.totals[y] as Row;
    const r = st.rows[y]!;
    const bal = r.balance;
    const bv = r.balVal;
    return {
      prod: r.prod,
      imp: r.imp,
      exp: r.exp,
      use: r.use,
      deficit: bal != null && bal < 0 ? -bal : bal != null ? 0 : null,
      surplus: bal != null && bal > 0 ? bal : bal != null ? 0 : null,
      impVal: r.impVal,
      expVal: r.expVal,
      prodVal: r.prodVal,
      deficitVal: bv != null && bv < 0 ? -bv : bv != null ? 0 : null,
      surplusVal: bv != null && bv > 0 ? bv : bv != null ? 0 : null,
      flag: r.flag,
      noVal: !st.hasPrice,
      noProd: st.tradeOnly,
    };
  };
  const annual: Record<number, Row> = {};
  S.years.forEach((y) => (annual[y] = rowOf(y)));
  const TH = F.sumPeriod(S.totals, S.hist[0], S.hist[1], KEYS);
  const TP = F.sumPeriod(S.totals, S.fc[0], S.fc[1], KEYS);

  const stRow = (x: (typeof S.staples)[number]): Row => {
    const rows: Record<number, Row> = {};
    S.years.forEach((y) => {
      const r = x.rows[y]!;
      const b = r.balance ?? null;
      const bv = r.balVal ?? null;
      rows[y] = {
        prod: r.prod,
        imp: r.imp,
        exp: r.exp,
        use: r.use,
        deficit: b != null && b < 0 ? -b : 0,
        surplus: b != null && b > 0 ? b : 0,
        impVal: r.impVal,
        expVal: r.expVal,
        prodVal: r.prodVal,
        deficitVal: bv != null && bv < 0 ? -bv : 0,
        surplusVal: bv != null && bv > 0 ? bv : 0,
      };
    });
    return period === 'h'
      ? F.sumPeriod(rows, S.hist[0], S.hist[1], KEYS)
      : period === 'f'
        ? F.sumPeriod(rows, S.fc[0], S.fc[1], KEYS)
        : rows[Number(period)]!;
  };
  const allRow = (period === 'h' ? TH : period === 'f' ? TP : S.totals[Number(period)]) as Row;
  const byStaple = S.staples.map((x) => ({ x, r: { ...stRow(x), noVal: !x.hasPrice, noProd: x.tradeOnly } as Row }));

  // Narrative, as the legacy summary writes it
  const defs = S.staples.map((x) => {
    const rows: Record<number, { d: number; s: number; v: number }> = {};
    S.years.forEach((y) => {
      const b = x.rows[y]!.balance;
      rows[y] = { d: b != null && b < 0 ? -b : 0, s: b != null && b > 0 ? b : 0, v: x.rows[y]!.impVal || 0 };
    });
    const h = F.sumPeriod(rows, S.hist[0], S.hist[1], ['d', 's', 'v']);
    const f = F.sumPeriod(rows, S.fc[0], S.fc[1], ['d', 's', 'v']);
    return { label: x.label, hd: h.d! / 5, hs: h.s! / 5, fv: f.v! };
  });
  const topDef = defs.filter((d) => d.hd > 1).sort((a, b) => b.hd - a.hd).slice(0, 3);
  const topSur = defs.filter((d) => d.hs > 1).sort((a, b) => b.hs - a.hs).slice(0, 3);
  const topBill = defs.filter((d) => d.fv > 1).sort((a, b) => b.fv - a.fv).slice(0, 3);
  const last = Math.max(...S.staples.map((x) => x.lastActual || 0));
  const t31 = S.totals[S.fc[1]]!;
  const m = TS.macro[mid] ?? {};
  const pop = m.pop_un?.[BY] ?? null;
  const gdpPc = latest(m.gdp_pc);
  const und = latest(m.undernourished);
  const q = F.quickSSR(TS, mid, null);
  const flag = (f?: string) => (f === 'P' ? <Pill tone="neutral">proj.</Pill> : f === 'E' ? <Pill tone="watch">est.</Pill> : null);

  const v = (r: Row, k: string, money = false) => (money && r.noVal ? '–' : k === 'prod' || k === 'use' ? (r.noProd ? '–' : q0(r[k])) : q0(r[k]));
  const cells = (r: Row) => (
    <>
      <td className="n">{v(r, 'prod')}</td>
      <td className="n">{v(r, 'imp')}</td>
      <td className="n">{v(r, 'exp')}</td>
      <td className="n">{v(r, 'use')}</td>
      <td className="n text-[#8f1f0d]">{r.deficit ? q0(r.deficit) : '–'}</td>
      <td className="n text-[#1d5e36]">{r.surplus ? q0(r.surplus) : '–'}</td>
      <td className="n">{(r.use ?? 0) > 0 ? pc((r.prod ?? 0) / r.use!, 0) : '–'}</td>
      <td className="n">{v(r, 'impVal', true)}</td>
      <td className="n">{v(r, 'expVal', true)}</td>
      <td className="n">{r.noProd ? '–' : v(r, 'prodVal', true)}</td>
      <td className="n text-[#8f1f0d]">{r.deficitVal && !r.noVal ? q0(r.deficitVal) : '–'}</td>
      <td className="n text-[#1d5e36]">{r.surplusVal && !r.noVal ? q0(r.surplusVal) : '–'}</td>
    </>
  );
  const HEAD = ['Production', 'Imports', 'Exports', 'Consumption', 'Deficit', 'Surplus', 'SSR', 'Imports $m', 'Exports $m', 'Production $m', 'Deficit $m', 'Surplus $m'];
  const perLabel = period === 'h' ? `${S.hist[0]}–${S.hist[1]} total` : period === 'f' ? `${S.fc[0]}–${S.fc[1]} total` : period;
  const quality = st ? ADV.quality(TS, st.cid, mid) : null;

  return (
    <Page
      kicker="Countries"
      title={name}
      lead={core ? 'Full depth: USDA balances to 2026/27, customs trade to 2025 and researched landed costs.' : `Statistical depth: FAOSTAT balances to ${last || 2022}; later years are estimates rolled forward by the model, and values use reference prices. Landed cost is available at standard depth (MFN duty, indicative freight).`}
      actions={
        <div className="w-60">
          <CountrySelect summary={data.summary} value={mid} onChange={(c) => go(`/countries/${c}`)} label="Another country" />
        </div>
      }
    >
      <CountryTabs mid={mid} />
      <KpiRow>
        <Kpi label="Self-sufficiency" value={q ? pc(q.ssr, 0) : '–'} sub="all foods, by weight" />
        <Kpi label={`Population, ${BY}`} value={pop != null ? `${pop.toFixed(1)} m` : '–'} sub="UN WPP" />
        <Kpi label="GDP per person" value={gdpPc ? `US$${Math.round(gdpPc.v).toLocaleString('en-US')}` : '–'} sub={gdpPc ? `${gdpPc.y}, World Bank` : ''} />
        <Kpi label={`Food imports, ${S.hist[0]}–${S.hist[1]}`} value={usdm(TH.impVal)} sub={`${kt(TH.imp! / 5)} a year`} />
        <Kpi label="Undernourishment" value={und ? `${und.v}%` : '–'} sub={und ? `${und.y}, FAO via World Bank` : ''} />
      </KpiRow>

      <Card>
        <p className="m-0">
          <b>{`The record, ${S.hist[0]}–${S.hist[1]}.`}</b>{' '}
          {`${name} produced ${kt(TH.prod! / 5)} of food a year and imported ${kt(TH.imp! / 5)}${TH.exp! / 5 > 5 ? `, exporting ${kt(TH.exp! / 5)}` : ''}. Imports cost about ${usdm(TH.impVal)} over the five years. ${topDef.length ? `The largest shortfalls were ${topDef.map((d) => `${d.label.toLowerCase()} (${kt(d.hd)} a year)`).join(', ')}.` : 'No food ran a material deficit.'}${topSur.length ? ` Surpluses: ${topSur.map((d) => `${d.label.toLowerCase()} (${kt(d.hs)} a year)`).join(', ')}.` : ''}`}
        </p>
        <p className="m-0 mt-2">
          <b>{`The outlook, ${S.fc[0]}–${S.fc[1]}.`}</b>{' '}
          {`On present trends production reaches ${kt(t31.prod)} and consumption ${kt(t31.use)} by ${S.fc[1]}, with imports of ${kt(t31.imp)} that year. Food deficits total ${kt(TP.deficit)} over the five years (${kt(TH.deficit)} in ${S.hist[0]}–${S.hist[1]}) and the import bill about ${usdm(TP.impVal)}.${topBill.length ? ` The largest bills: ${topBill.map((d) => `${d.label.toLowerCase()} ${usdm(d.fv)}`).join(', ')}.` : ''}`}
        </p>
      </Card>

      <Card
        title={st ? `${st.label}: production, imports and consumption` : 'All foods: production, imports and consumption'}
        aside={
          <div className="flex flex-wrap items-end gap-2">
            {quality && (
              <Pill tone={quality.grade === 'high' ? 'go' : quality.grade === 'medium' ? 'watch' : 'no'} title={quality.why.join('; ')}>
                Data confidence: {quality.grade}
              </Pill>
            )}
            <FoodSelect
              summary={data.summary}
              value={staple}
              onChange={setStaple}
              allLabel="All foods"
              only={(k) => S.staples.some((x) => x.cid === k)}
              className="w-56"
            />
          </div>
        }
      >
        <StackChart
          title={`${name}${st ? `: ${st.label.toLowerCase()}` : ''}`}
          unit="thousand tonnes"
          name={`${mid}-${staple}-balance`}
          rows={S.years.map((y) => ({ y, a: annual[y]!.prod || 0, b: annual[y]!.imp || 0, x: annual[y]!.exp, line: annual[y]!.use || null, proj: annual[y]!.flag === 'P' }))}
        />
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x mt-3">
          <table className="tbl">
            <caption className="sr-only">Year by year, thousand tonnes and US$ million</caption>
            <thead>
              <tr>
                <th>Year</th>
                {HEAD.map((h) => (
                  <th key={h} className="n">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {S.years.map((y) => (
                <tr key={y}>
                  <td>
                    {y} {flag(annual[y]!.flag)}
                  </td>
                  {cells(annual[y]!)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={`By food, ${perLabel}`}
        aside={
          <div className="flex flex-wrap items-end gap-2">
            <Select label="Period" value={period} onChange={setPeriod} className="w-48">
              <option value="h">
                {S.hist[0]}–{S.hist[1]} total
              </option>
              <option value="f">
                {S.fc[0]}–{S.fc[1]} total
              </option>
              {S.years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </Select>
            <Csv
              name={`${mid}-by-food-${period}`}
              header={['Food', ...HEAD]}
              rows={byStaple.map(({ x, r }) => [x.label, r.prod, r.imp, r.exp, r.use, r.deficit, r.surplus, (r.use ?? 0) > 0 ? (r.prod ?? 0) / r.use! : '', r.impVal, r.expVal, r.prodVal, r.deficitVal, r.surplusVal])}
            />
          </div>
        }
      >
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x">
          <table className="tbl">
            <caption className="sr-only">By food, thousand tonnes and US$ million</caption>
            <thead>
              <tr>
                <th>Food</th>
                {HEAD.map((h) => (
                  <th key={h} className="n">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TS.meta.food_groups.map(([g, gl]) => {
                const list = byStaple.filter(({ x }) => x.fg === g);
                return list.length ? (
                  <FragmentRows key={g} label={gl}>
                    {list.map(({ x, r }) => (
                      <tr key={x.cid}>
                        <td>
                          <button type="button" className="text-start font-semibold text-sec-ink underline-offset-2 hover:underline" onClick={() => setStaple(x.cid)}>
                            {x.label}
                          </button>
                        </td>
                        {cells(r)}
                      </tr>
                    ))}
                  </FragmentRows>
                ) : null;
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>All foods</td>
                {cells(allRow)}
              </tr>
            </tfoot>
          </table>
        </div>
        <SourceFooter
          ids={['D1', 'D2', 'D5', 'D6']}
          asOf={TS.meta.built}
          note={
            <>
              Thousand tonnes; values in US$ million. Est. = estimated by the model; proj. = projection. See{' '}
              <Link to="/about/methods">Methods</Link>.
            </>
          }
        />
      </Card>

      <MacroCard TS={TS} mid={mid} />
    </Page>
  );
}

function FragmentRows({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="grp">
        <th colSpan={13} scope="colgroup">
          {label}
        </th>
      </tr>
      {children}
    </>
  );
}

function MacroCard({ TS, mid }: { TS: TSData; mid: string }) {
  const m = TS.macro[mid] ?? {};
  const rows = TS.meta.macro_series
    .map((s) => ({ s, l: latest(m[s.key]) }))
    .filter((x) => x.l);
  return (
    <Card
      title="Economy and people"
      aside={<Csv name={`${mid}-macro`} header={['Indicator', 'Unit', 'Year', 'Value', 'Source', 'Code']} rows={rows.map(({ s, l }) => [s.label, s.unit, l!.y, l!.v, s.src, s.code])} />}
    >
      <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x">
        <table className="tbl">
          <thead>
            <tr>
              <th>Indicator</th>
              <th className="n">Latest</th>
              <th>Unit</th>
              <th className="n">Year</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, l }) => (
              <tr key={s.key}>
                <td>{s.label}</td>
                <td className="n">{l!.v.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                <td className="text-muted">{s.unit}</td>
                <td className="n">{l!.y}</td>
                <td className="text-muted">
                  {s.src} <span className="text-[11.5px]">{s.code}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SourceFooter ids={['D3', 'D4', 'D7']} asOf={TS.meta.built} note="WDI: World Bank World Development Indicators; WPP: UN World Population Prospects; IMF: World Economic Outlook." />
    </Card>
  );
}
