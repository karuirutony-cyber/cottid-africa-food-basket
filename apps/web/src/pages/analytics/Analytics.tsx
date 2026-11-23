/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Advisor as ADV, Forecast as F, kt, pc, sg, usdm, type Scenario, type TSData } from '@afb/engines';
import { useDatasets } from '@/data/datasets';
import { useAuth } from '@/lib/auth';
import { addSaved } from '@/lib/saved';
import { LineChart, COL, StackChart } from '@/components/charts';
import { CountrySelect, FoodSelect } from '@/components/pickers';
import { Card, Csv, DataState, Kpi, KpiRow, Page, Pill, Select, SourceFooter, SourceLinks } from '@/components/ui';

/** Country, food and scenario live in the URL so any view can be shared or saved. */
function useSel() {
  const [params, setParams] = useSearchParams();
  const set = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  };
  const sc: Scenario = { ...F.DEFAULTS };
  for (const k of ['gdp', 'pop', 'price', 'fx', 'freight', 'prod', 'shock', 'shockYear', 'horizon'] as const) {
    const v = params.get(k);
    if (v != null && Number.isFinite(+v)) (sc as any)[k] = +v;
  }
  return { mid: (params.get('c') ?? 'KE').toUpperCase(), cid: params.get('f') ?? 'rice', aud: params.get('a') ?? 'importers', sc, params, set };
}

function Pickers({ TS, summary, sel, food = true }: { TS: TSData; summary: any; sel: ReturnType<typeof useSel>; food?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <CountrySelect summary={summary} value={TS.meta.markets[sel.mid] ? sel.mid : 'KE'} onChange={(v) => sel.set({ c: v })} />
      {food && <FoodSelect summary={summary} value={TS.comm[sel.cid] ? sel.cid : 'rice'} onChange={(v) => sel.set({ f: v })} only={(k) => !!TS.balance[k]?.[sel.mid]} />}
    </div>
  );
}

const PRESETS: Record<string, [string, Partial<Scenario>]> = {
  base: ['Base case', {}],
  fast: ['Faster growth', { gdp: 1.5, pop: 0 }],
  slow: ['Slower growth', { gdp: -1.5 }],
  price: ['World prices up 20%', { price: 20 }],
  drought: ['Drought year', { shock: -25, shockYear: F.BASE_YEAR + 2 }],
  invest: ['Investment push', { prod: 3 }],
};

function ScenarioControls({ sel }: { sel: ReturnType<typeof useSel> }) {
  const s = sel.sc;
  const slider = (k: keyof Scenario, label: string, min: number, max: number, step: number, unit: string) => (
    <label className="grid gap-1 text-[12.5px] font-semibold text-muted">
      <span>
        {label}: <b className="text-ink">{(s[k] as number) > 0 ? '+' : ''}{s[k] as number}{unit}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={(s[k] as number) ?? 0} onChange={(e) => sel.set({ [k]: e.target.value })} className="accent-[var(--sec)]" />
    </label>
  );
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Scenario presets">
        {Object.entries(PRESETS).map(([k, [label, p]]) => (
          <button key={k} type="button" className="btn min-h-[34px] px-3 py-1 text-[13px]" onClick={() => sel.set(Object.fromEntries(['gdp', 'pop', 'price', 'prod', 'shock', 'shockYear'].map((x) => [x, (p as any)[x] != null ? String((p as any)[x]) : null])))}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {slider('gdp', 'Income growth', -3, 3, 0.5, ' pts')}
        {slider('pop', 'Population growth', -1, 1, 0.1, ' pts')}
        {slider('price', 'World price', -30, 30, 5, '%')}
        {slider('prod', 'Production uplift', 0, 6, 0.5, '% a year')}
      </div>
      <p className="m-0 text-[12.5px] text-muted">Changes are relative to the base case. The scenario is kept in the page address, so you can bookmark or share it.</p>
    </div>
  );
}

export function Projections() {
  const sel = useSel();
  const { data, loading, error } = useDatasets('TS', 'summary');
  const pr = useMemo(() => (data && data.TS.meta.markets[sel.mid] && data.TS.balance[sel.cid]?.[sel.mid] ? F.project(data.TS, sel.cid, sel.mid, sel.sc) : null), [data, sel.cid, sel.mid, sel.sc.gdp, sel.sc.pop, sel.sc.price, sel.sc.prod, sel.sc.shock, sel.sc.shockYear]); // eslint-disable-line react-hooks/exhaustive-deps
  const [saved, setSaved] = useState(false);
  const auth = useAuth();
  if (!data) return <DataState loading={loading} error={error} />;
  const { TS } = data;
  const name = TS.meta.markets[sel.mid] ?? sel.mid;
  const food = TS.comm[sel.cid]?.label ?? sel.cid;
  const q = pr?.ok ? ADV.quality(TS, sel.cid, sel.mid) : null;
  const save = () => {
    void addSaved(auth.user, { kind: 'projection', title: `${food} in ${name}`, href: `/analytics/projections?${sel.params.toString()}` }).then(() => setSaved(true));
  };
  const best = pr?.best ?? {};
  const histYears = Object.keys(best.use ?? {}).map(Number).filter((y) => y >= 2015 && y < F.BASE_YEAR + 1);
  const rows = pr?.ok ? pr.rows : [];
  const years = [...histYears, ...rows.map((r) => r.year as number).filter((y) => !histYears.includes(y))];
  const series = (k: 'use' | 'prod' | 'imp') => Object.fromEntries(years.map((y) => [y, y <= F.BASE_YEAR ? best[k]?.[y] ?? null : rows.find((r) => r.year === y)?.[k] ?? null]));
  const s = pr?.summary ?? {};
  return (
    <Page kicker="Analytics" title={`Projections: ${food} in ${name}`} lead="Consumption, production and imports five years ahead, from population, income, diets, prices and harvest risk. The shaded range is the typical error found when the model was tested on past years." actions={pr?.ok ? <button type="button" className="btn" onClick={save}>{saved ? 'Saved' : 'Save this scenario'}</button> : null}>
      <Card>
        <Pickers TS={TS} summary={data.summary} sel={sel} />
        <div className="mt-4">
          <ScenarioControls sel={sel} />
        </div>
      </Card>
      {pr?.ok ? (
        <>
          <KpiRow>
            <Kpi label={`Imports, ${s.endYear}`} value={kt(s.impEnd)} sub={`from ${kt(s.impBase)} (${sg(s.impCagr)} a year)`} />
            <Kpi label="Consumption growth" value={sg(s.useCagr)} sub="a year" />
            <Kpi label="Production growth" value={sg(s.prodCagr)} sub="a year, on trend" />
            <Kpi label={`Self-sufficiency, ${s.endYear}`} value={pc(s.ssrEnd, 0)} sub={`from ${pc(s.ssrBase, 0)}`} />
            <Kpi label="Import bill, five years" value={usdm(s.cumBill)} sub={`${usdm(s.billEnd)} in ${s.endYear}`} />
          </KpiRow>
          <Card aside={q ? <Pill tone={q.grade === 'high' ? 'go' : q.grade === 'medium' ? 'watch' : 'no'} title={q.why.join('; ')}>Data confidence: {q.grade}</Pill> : null}>
            <LineChart
              title={`${food}, ${name}`}
              unit="thousand tonnes"
              name={`projection-${sel.cid}-${sel.mid}`}
              years={years}
              split={F.BASE_YEAR + 1}
              series={[
                { key: 'use', label: 'Consumption', color: COL.use, vals: series('use') },
                { key: 'prod', label: 'Production', color: COL.prod, vals: series('prod') },
                { key: 'imp', label: 'Imports', color: COL.imp, vals: series('imp') },
              ]}
              band={{ lo: Object.fromEntries(rows.map((r) => [r.year, r.impLo])), hi: Object.fromEntries(rows.map((r) => [r.year, r.impHi])), color: COL.imp, label: 'Typical range of imports' }}
              fmt={(v) => Math.round(v).toLocaleString('en-US')}
            />
            {pr.notes.length > 0 && (
              <ul className="m-0 mt-3 grid gap-1 ps-5 text-[13.5px] text-muted">
                {pr.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <SourceFooter ids={['D1', 'D2', 'D3', 'D4', 'D6', 'D7', 'K2', 'A14']} asOf={TS.meta.built} note="FAOSTAT, USDA PSD, IMF, UN WPP and the World Bank price outlook; Cottid Africa projection model." />
          </Card>
        </>
      ) : (
        <Card>
          <p className="m-0">{pr?.reason ?? `Data not available: there is no balance for ${food.toLowerCase()} in ${name}.`}</p>
        </Card>
      )}
    </Page>
  );
}

export function Planner() {
  const sel = useSel();
  const { data, loading, error } = useDatasets('TS', 'summary');
  const year = Number(sel.params.get('y') ?? F.BASE_YEAR + 5);
  const keep = sel.params.get('k') !== '0';
  const yshare = Number(sel.params.get('ys') ?? 60);
  const TS = data?.TS;
  const ok = !!(TS && TS.meta.markets[sel.mid] && TS.balance[sel.cid]?.[sel.mid]);
  const def = ok ? ADV.suggestedTarget(TS, sel.cid, sel.mid, year, sel.sc) : null;
  const target = sel.params.get('t') != null ? Number(sel.params.get('t')) / 100 : def;
  const pl = useMemo(() => (ok && target != null ? F.plan(TS, sel.cid, sel.mid, { target, year, keepExports: keep, yieldShare: yshare / 100, scenario: sel.sc }) : null), [ok, TS, sel.cid, sel.mid, target, year, keep, yshare]); // eslint-disable-line react-hooks/exhaustive-deps
  const iv = useMemo(() => (pl?.ok && TS ? ADV.interventions(TS, sel.cid, sel.mid, pl) : null), [pl, TS, sel.cid, sel.mid]);
  if (!data || !TS) return <DataState loading={loading} error={error} />;
  const name = TS.meta.markets[sel.mid] ?? sel.mid;
  const food = TS.comm[sel.cid]?.label ?? sel.cid;
  const s = pl?.summary ?? {};
  return (
    <Page kicker="Analytics" title={`Planner: ${food} in ${name}`} lead="Set how much of a food a country should grow for itself. The planner returns the production, land and yield required each year, and the imports left.">
      <Card>
        <Pickers TS={TS} summary={data.summary} sel={sel} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-[12.5px] font-semibold text-muted">
            <span>
              Self-sufficiency target: <b className="text-ink">{target != null ? `${Math.round(target * 100)}%` : '–'}</b>
              {def != null && <span className="font-normal"> (suggested {Math.round(def * 100)}%)</span>}
            </span>
            <input type="range" min={0} max={150} step={5} value={target != null ? Math.round(target * 100) : 0} onChange={(e) => sel.set({ t: e.target.value })} className="accent-[var(--sec)]" />
          </label>
          <Select label="Target year" value={String(year)} onChange={(v) => sel.set({ y: v })}>
            {[1, 2, 3, 4, 5].map((i) => (
              <option key={i} value={String(F.BASE_YEAR + i)}>
                {F.BASE_YEAR + i}
              </option>
            ))}
          </Select>
          <label className="grid gap-1 text-[12.5px] font-semibold text-muted">
            <span>
              Share of extra output from higher yield: <b className="text-ink">{yshare}%</b>
            </span>
            <input type="range" min={0} max={100} step={10} value={yshare} onChange={(e) => sel.set({ ys: e.target.value })} className="accent-[var(--sec)]" />
          </label>
          <label className="flex items-center gap-2 self-end text-[14px]">
            <input type="checkbox" checked={keep} onChange={(e) => sel.set({ k: e.target.checked ? '1' : '0' })} className="h-4 w-4 accent-[var(--sec)]" />
            Keep current exports
          </label>
        </div>
      </Card>
      {pl?.ok ? (
        <>
          <KpiRow>
            <Kpi label={`Production needed, ${year}`} value={kt(s.required)} sub={`trend gives ${kt(s.trend)}; gap ${kt(s.gap)}`} />
            <Kpi label="Growth required" value={sg(s.reqCagr)} sub={`a year, against ${sg(s.trendCagr)} on trend; ${s.feasibility}`} />
            <Kpi label={`Imports left, ${year}`} value={kt(s.imports)} sub={`against ${kt(s.baseImports)} without the plan`} />
            <Kpi label="Import bill saved" value={usdm(s.cumSaved)} sub="over the plan" />
            <Kpi label={`Yield and area, ${year}`} value={s.yieldEnd != null ? `${s.yieldEnd.toFixed(2)} t/ha` : '–'} sub={s.areaEnd != null ? `${kt(s.areaEnd).replace(' kt', '')} thousand ha (${sg(s.areaChange)})` : ''} />
          </KpiRow>
          <Card aside={<Csv name={`plan-${sel.cid}-${sel.mid}-${year}`} header={['Year', 'Consumption', 'Required production', 'Trend production', 'Gap', 'Imports', 'Import bill US$m', 'Saved US$m']} rows={pl.rows.map((r: any) => [r.year, r.use, r.required, r.trend, r.gap, r.imports, r.bill, r.saved])} />}>
            <StackChart
              title={`${food}, ${name}: the plan`}
              unit="thousand tonnes"
              name={`plan-${sel.cid}-${sel.mid}`}
              projLabel="Plan"
              lb="Imports left"
              rows={pl.rows.map((r: any) => ({ y: r.year, a: r.required ?? 0, b: r.imports ?? 0, x: r.exports, line: r.use, proj: r.year > F.BASE_YEAR }))}
            />
          </Card>
          {iv && (
            <Card title="What would get there" aside={iv.suitability ? <Pill tone={iv.suitability[0] === 'high' ? 'go' : iv.suitability[0] === 'medium' ? 'watch' : 'no'}>Suitability: {iv.suitability[0]}</Pill> : null}>
              {iv.suitability?.[1] && <p className="m-0 mb-2 text-[13.5px] text-muted">{iv.suitability[1]}</p>}
              <ul className="m-0 grid gap-2 ps-5">
                {(iv.items ?? []).map((it: any) => (
                  <li key={it.t}>
                    <b>{it.t}.</b> {it.d} <SourceLinks ids={it.src} />
                  </li>
                ))}
              </ul>
              <p className="m-0 mt-3 text-[13.5px]">
                <Link to={`/policy/interventions`}>Programmes and funders</Link> · <Link to="/policy/calls">Open calls</Link>
              </p>
            </Card>
          )}
          <SourceFooter ids={['D1', 'D2', 'D5', 'D6']} asOf={TS.meta.built} note="Required production = target ratio × projected consumption, plus exports if retained. Additional output is split between yield and harvested area." />
        </>
      ) : (
        <Card>
          <p className="m-0">{pl?.reason ?? `Data not available: there is no balance for ${food.toLowerCase()} in ${name} to plan against.`}</p>
        </Card>
      )}
    </Page>
  );
}

export function Review() {
  const sel = useSel();
  const { data, loading, error } = useDatasets('TS', 'summary');
  const a = useMemo(() => (data && data.TS.balance[sel.cid]?.[sel.mid] ? F.analyse(data.TS, sel.cid, sel.mid) : null), [data, sel.cid, sel.mid]);
  if (!data) return <DataState loading={loading} error={error} />;
  const { TS } = data;
  const name = TS.meta.markets[sel.mid] ?? sel.mid;
  const food = TS.comm[sel.cid]?.label ?? sel.cid;
  const bt = TS.backtest;
  const years = a ? Object.keys(a.best.use ?? {}).map(Number).filter((y) => y >= 2010) : [];
  const vals = (k: string) => Object.fromEntries(years.map((y) => [y, a?.best?.[k]?.[y] ?? null]));
  return (
    <Page kicker="Analytics" title={`Five-year review: ${food} in ${name}`} lead="What happened over the last five years, and how well the projection model has done when tested on the past.">
      <Card>
        <Pickers TS={TS} summary={data.summary} sel={sel} />
      </Card>
      {a ? (
        <>
          <Card>
            <LineChart
              title={`${food}, ${name}: the record`}
              unit="thousand tonnes"
              name={`record-${sel.cid}-${sel.mid}`}
              years={years}
              series={[
                { key: 'use', label: 'Consumption', color: COL.use, vals: vals('use') },
                { key: 'prod', label: 'Production', color: COL.prod, vals: vals('prod') },
                { key: 'imp', label: 'Imports', color: COL.imp, vals: vals('imp') },
                { key: 'exp', label: 'Exports', color: COL.exp, vals: vals('exp') },
              ]}
              fmt={(v) => Math.round(v).toLocaleString('en-US')}
            />
          </Card>
          {Array.isArray(a.findings) && a.findings.length > 0 && (
            <Card title={`Findings, ${a.from}–${a.to}`}>
              <ul className="m-0 grid gap-1.5 ps-5">
                {a.findings.map((f: any, i: number) => (
                  <li key={i}>{typeof f === 'string' ? f : (<><b>{f.t}</b> {f.d}</>)}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <p className="m-0">Data not available for {food.toLowerCase()} in {name}.</p>
        </Card>
      )}
      <Card title="How accurate are the projections?" aside={<Csv name="backtest" header={['Food', 'Median error', '80th percentile', 'Cases', '1 yr', '2 yr', '3 yr', '4 yr', '5 yr']} rows={Object.entries(bt.use).map(([k, v]: [string, any]) => [TS.comm[k]?.label ?? k, v.median, v.p80, v.n, ...[1, 2, 3, 4, 5].map((h) => v.byH[h])])} />}>
        <p className="m-0 mb-2 text-[13.5px] text-muted">Median absolute error of projected consumption when the model was run from past years and compared with what happened, by years ahead.</p>
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Food</th>
                {[1, 2, 3, 4, 5].map((h) => (
                  <th key={h} className="n">
                    {h} yr
                  </th>
                ))}
                <th className="n">Median</th>
                <th className="n">80% of cases within</th>
                <th className="n">Cases</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(bt.use).map(([k, v]: [string, any]) => (
                <tr key={k} className={k === 'all' ? 'font-bold' : ''}>
                  <td>{k === 'all' ? 'All foods' : TS.comm[k]?.label ?? k}</td>
                  {[1, 2, 3, 4, 5].map((h) => (
                    <td key={h} className="n">
                      {pc(v.byH[h], 0)}
                    </td>
                  ))}
                  <td className="n">{pc(v.median, 0)}</td>
                  <td className="n">{pc(v.p80, 0)}</td>
                  <td className="n">{v.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SourceFooter ids={['D1', 'D6']} asOf={TS.meta.built} />
      </Card>
    </Page>
  );
}

export function Advisory() {
  const sel = useSel();
  const { data, loading, error } = useDatasets('TS', 'LIB', 'summary');
  const res = useMemo(() => (data && data.TS.balance[sel.cid]?.[sel.mid] ? ADV.advise(data.TS, data.LIB, sel.cid, sel.mid, sel.aud, F.DEFAULTS) : null), [data, sel.cid, sel.mid, sel.aud]);
  if (!data) return <DataState loading={loading} error={error} />;
  const { TS } = data;
  const name = TS.meta.markets[sel.mid] ?? sel.mid;
  const food = TS.comm[sel.cid]?.label ?? sel.cid;
  const tone = (k: string) => (k === 'opportunity' ? 'go' : k === 'risk' ? 'no' : k === 'watch' ? 'watch' : 'neutral');
  return (
    <Page kicker="Analytics" title={`Advisory: ${food} in ${name}`} lead="Notes written from the figures for producers, importers, exporters, investors, planners, policy makers and researchers. Every note cites its evidence and carries a confidence grade.">
      <Card>
        <Pickers TS={TS} summary={data.summary} sel={sel} />
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Who is asking">
          {ADV.AUDIENCES.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={sel.aud === k} onClick={() => sel.set({ a: k })} className={`rounded-full border px-3 py-1.5 text-[13.5px] font-semibold ${sel.aud === k ? 'border-sec-ink bg-sec-ink text-white' : 'border-line bg-surface text-ink hover:border-sec'}`}>
              {l}
            </button>
          ))}
        </div>
      </Card>
      {res ? (
        <div className="grid gap-3">
          {res.notes.map((n, i) => (
            <Card key={i}>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={tone(n.kind)}>{n.kind}</Pill>
                {n.conf && <Pill tone={n.conf === 'high' ? 'go' : n.conf === 'medium' ? 'watch' : 'no'}>confidence: {n.conf}</Pill>}
              </div>
              <h2 className="m-0 mt-2 font-body text-[16px] font-bold">{n.t}</h2>
              <p className="m-0 mt-1">{n.d}</p>
              <p className="m-0 mt-1">
                <SourceLinks ids={n.src} />
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="m-0">Data not available for {food.toLowerCase()} in {name}.</p>
        </Card>
      )}
    </Page>
  );
}

/** A printable one-page brief (country + food), saved as PDF from the browser's print dialog. */
export function Briefs() {
  const sel = useSel();
  const { data, loading, error } = useDatasets('TS', 'LIB', 'summary');
  const pr = useMemo(() => (data && data.TS.balance[sel.cid]?.[sel.mid] ? F.project(data.TS, sel.cid, sel.mid, F.DEFAULTS) : null), [data, sel.cid, sel.mid]);
  const adv = useMemo(() => (data && pr?.ok ? ADV.advise(data.TS, data.LIB, sel.cid, sel.mid, sel.aud, F.DEFAULTS) : null), [data, pr, sel.cid, sel.mid, sel.aud]);
  if (!data) return <DataState loading={loading} error={error} />;
  const { TS } = data;
  const name = TS.meta.markets[sel.mid] ?? sel.mid;
  const food = TS.comm[sel.cid]?.label ?? sel.cid;
  const s = pr?.summary ?? {};
  return (
    <Page kicker="Analytics" title="Briefs" lead="A one-page brief for a country and a food: the record, the outlook and the advice, with sources. Choose Print, then Save as PDF. The brief is written in the language you have chosen for the interface where translations exist." actions={<button type="button" className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button>}>
      <Card className="no-print">
        <Pickers TS={TS} summary={data.summary} sel={sel} />
        <div className="mt-3 max-w-xs">
          <Select label="Audience" value={sel.aud} onChange={(v) => sel.set({ a: v })}>
            {ADV.AUDIENCES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      </Card>
      <article className="card print:border-0 print:p-0">
        <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-paprika">Africa Food Basket · Cottid Africa brief</p>
        <h2 className="m-0 mt-1 text-[26px] font-bold text-earth">
          {food} in {name}
        </h2>
        <p className="m-0 text-[13px] text-muted">Data as of {TS.meta.built}. Projection to {s.endYear ?? F.BASE_YEAR + 5}, base case.</p>
        {pr?.ok ? (
          <>
            <ul className="mt-3 grid gap-1 ps-5">
              <li>Imports reach {kt(s.impEnd)} by {s.endYear}, from {kt(s.impBase)} ({sg(s.impCagr)} a year).</li>
              <li>Consumption grows {sg(s.useCagr)} a year and production {sg(s.prodCagr)} a year on trend.</li>
              <li>Self-sufficiency moves from {pc(s.ssrBase, 0)} to {pc(s.ssrEnd, 0)}.</li>
              <li>The import bill totals about {usdm(s.cumBill)} over the five years.</li>
            </ul>
            <h3 className="m-0 mt-4 font-body text-[15px] font-bold">Advice for {ADV.AUDIENCES.find((a) => a[0] === sel.aud)?.[1].toLowerCase()}</h3>
            <ol className="mt-2 grid gap-2 ps-5">
              {adv?.notes.slice(0, 6).map((n, i) => (
                <li key={i}>
                  <b>{n.t}.</b> {n.d} <span className="text-[12px] text-muted">[{n.src.join(', ')}]</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p>Data not available for this food in this country.</p>
        )}
        <p className="m-0 mt-4 border-t border-line pt-2 text-[11.5px] text-muted">© 2026 Cottid Africa. All rights reserved. Projections are planning ranges, not forecasts of certainty. Sources are listed at /data/sources.</p>
      </article>
    </Page>
  );
}
