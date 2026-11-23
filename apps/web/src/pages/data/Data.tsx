import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { Source } from '@afb/engines';
import { useDatasets } from '@/data/datasets';
import { ExtLink, RecordTable } from '@/components/RecordTable';
import { LineChart } from '@/components/charts';
import { CountrySelect, FoodSelect } from '@/components/pickers';
import { Card, Csv, DataState, Page, Select, SourceFooter } from '@/components/ui';

export function Sources() {
  const { data, loading, error } = useDatasets('SRC');
  const { hash } = useLocation();
  useEffect(() => {
    if (!data || !hash) return;
    const el = document.getElementById(`src-${decodeURIComponent(hash.slice(1))}`);
    el?.scrollIntoView({ block: 'center' });
    el?.focus();
  }, [data, hash]);
  if (!data) return <DataState loading={loading} error={error} />;
  const target = decodeURIComponent(hash.slice(1));
  const kind = (id: string) => ({ S: 'Price and trade sources', A: 'Cottid Africa estimates and rate cards', D: 'Datasets', R: 'Buyer evidence', E: 'Events', P: 'Policies', I: 'Interventions and funders', C: 'Calls' })[id[0] ?? ''] ?? 'Other';
  return (
    <Page kicker="Data" title="Sources" lead={`Every figure on the platform carries one of these ${data.SRC.length} source IDs. A-numbered entries are Cottid Africa estimates, rate cards or modelling assumptions; D-numbered entries are the datasets the balances and trade come from.`}>
      <RecordTable<Source>
        name="sources"
        rows={data.SRC}
        search={(r) => `${r.id} ${r.title} ${r.url}`}
        filters={[{ label: 'Kind', all: 'All kinds', options: [...new Set(data.SRC.map((s) => s.id[0]!))].map((k) => [k, kind(k)]), match: (r, v) => r.id.startsWith(v) }]}
        columns={[
          {
            label: 'ID',
            cell: (r) => (
              <b id={`src-${r.id}`} tabIndex={-1} className={r.id === target ? 'rounded bg-[#fff3c4] px-1' : ''}>
                {r.id}
              </b>
            ),
            csv: (r) => r.id,
          },
          { label: 'Source', cell: (r) => <ExtLink href={r.url}>{r.title}</ExtLink>, csv: (r) => r.title },
          { label: 'Read', cell: (r) => <span className="whitespace-nowrap">{r.date}</span>, csv: (r) => r.date },
          { label: 'Link', cell: (r) => <span className="break-all text-[12px] text-muted">{r.url}</span>, csv: (r) => r.url },
        ]}
      />
    </Page>
  );
}

const API_ENDPOINTS: [string, string][] = [
  ['/meta', 'Dataset version, build date, record years, source counts'],
  ['/countries', 'All 54 countries: names in five languages, region, trade blocs'],
  ['/countries/{iso2}', 'One country, with its macro series and their sources'],
  ['/foods', 'All 34 foods: names, food group, basis, HS codes'],
  ['/series/{iso2}/{food}', 'Production, imports, exports and use by year, with a source ID per series'],
  ['/projections/{iso2}/{food}', 'Base-case projection to the horizon, with ranges'],
  ['/nutrition/{iso2}', 'Calories and protein per person by food and year'],
  ['/trade/{iso2}?year=2024', 'Customs imports by supplier and exports by destination'],
  ['/buyers?country=Kenya', 'Buyers, with status, evidence and source IDs'],
  ['/suppliers', 'Exporters, boards and regulators at each origin'],
  ['/sources', 'Every source: title, link, date read'],
  ['/sources/{id}', 'One source'],
];

export function Apis() {
  const d = useDatasets('APIS');
  if (!d.data) return <DataState loading={d.loading} error={d.error} />;
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const sets = ['summary', 'TS', 'FT', 'SELL', 'NUT', 'LIB', 'REG', 'SRC', 'POL', 'PROG', 'CALLS', 'EVENTS', 'MAP'];
  return (
    <Page kicker="Data" title="APIs and downloads" lead="The upstream services the platform reads, and the platform's own reference data, which anyone can download.">
      <Card title="Upstream sources the platform reads">
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Service</th>
                <th>What it provides</th>
                <th>Access</th>
                <th>How the platform uses it</th>
              </tr>
            </thead>
            <tbody>
              {d.data.APIS.map((a) => (
                <tr key={a[0]}>
                  <td>
                    <b>
                      <ExtLink href={a[2]}>{a[0]}</ExtLink>
                    </b>
                  </td>
                  <td>{a[1]}</td>
                  <td>{a[3]}</td>
                  <td>{a[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="The Africa Food Basket API" className="scroll-mt-24">
        <div id="api" />
        <p className="m-0">
          A read-only REST API over the same data, with a key and a daily quota per key (resets at 00:00 UTC). Every value keeps its source ID.{' '}
          <Link to="/account/api-keys">Create a key</Link> (free account), then send it in the <code>X-API-Key</code> header.
        </p>
        <pre data-no-tr tabIndex={0} role="region" aria-label="Example request" className="mt-3 overflow-x-auto rounded-lg bg-[#2a1a10] p-3 text-[13px] text-[#fbf3e6]">
          {`curl -H "X-API-Key: afb_…" ${base}/api/v1/series/KE/rice`}
        </pre>
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x mt-3">
          <table className="tbl">
            <thead>
              <tr>
                <th>Endpoint (GET)</th>
                <th>Returns</th>
              </tr>
            </thead>
            <tbody data-no-tr>
              {API_ENDPOINTS.map(([path, what]) => (
                <tr key={path}>
                  <td>
                    <code>/api/v1{path}</code>
                  </td>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-3 text-[13.5px] text-muted">
          Responses carry <code>X-RateLimit-Limit</code> and <code>X-RateLimit-Remaining</code>. Over the quota you get HTTP 429 with <code>Retry-After</code>; a missing or revoked key gets 401. Full description:{' '}
          <a href="/api/v1/openapi.json">OpenAPI 3 (openapi.json)</a>.
        </p>
      </Card>
      <Card title="Download the reference data">        <p className="m-0 text-muted">
          Each dataset is published as JSON at a stable address and refreshed when a new dataset version is published. For selected records, use the API below.
        </p>
        <ul className="m-0 mt-3 grid list-none gap-1 p-0 sm:grid-cols-2">
          {sets.map((s) => (
            <li key={s}>
              <a href={`/data/${s}.json`} download>
                {base}/data/{s}.json
              </a>
            </li>
          ))}
        </ul>
        <p className="m-0 mt-2">
          <a href="/data/manifest.json">Dataset manifest: version, build date and checks passed</a>
        </p>
      </Card>
    </Page>
  );
}

const SERIES_LABEL: Record<string, string> = {
  fao_prod: 'Production (FAOSTAT)',
  fao_imp: 'Imports (FAOSTAT)',
  fao_exp: 'Exports (FAOSTAT)',
  fao_use: 'Domestic use (FAOSTAT)',
  fao_food: 'Food (FAOSTAT)',
  fao_feed: 'Feed (FAOSTAT)',
  fao_loss: 'Losses (FAOSTAT)',
  fao_seed: 'Seed (FAOSTAT)',
  fao_other: 'Other uses (FAOSTAT)',
  fao_stock: 'Stock change (FAOSTAT)',
};

export function Explorer() {
  const [params, setParams] = useSearchParams();
  const { data, loading, error } = useDatasets('TS', 'summary');
  const mid = (params.get('c') ?? 'KE').toUpperCase();
  const food = params.get('f') ?? 'rice';
  const kind = params.get('k') ?? 'balance';
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true });
  };
  const series = useMemo(() => {
    if (!data) return {} as Record<string, Record<string, number | null>>;
    if (kind === 'macro') return data.TS.macro[mid] ?? {};
    if (kind === 'prices') return Object.fromEntries(Object.entries(data.TS.prices).map(([k, p]) => [k, p.v]));
    return data.TS.balance[food]?.[mid] ?? {};
  }, [data, kind, mid, food]);
  const keys = Object.keys(series);
  const [pick, setPick] = useState<string>('');
  if (!data) return <DataState loading={loading} error={error} />;
  const { TS } = data;
  const key = keys.includes(pick) ? pick : keys[0] ?? '';
  const labelOf = (k: string) =>
    kind === 'macro'
      ? (() => {
          const s = TS.meta.macro_series.find((x) => x.key === k);
          return s ? `${s.label} (${s.unit})` : k;
        })()
      : kind === 'prices'
        ? `${TS.prices[k]?.label ?? k} (${TS.prices[k]?.unit ?? ''})`
        : SERIES_LABEL[k] ?? k.replace(/_/g, ' ');
  const years = [...new Set(keys.flatMap((k) => Object.keys(series[k] ?? {})))].map(Number).sort((a, b) => a - b);
  const vals = Object.fromEntries(Object.entries(series[key] ?? {}).map(([y, v]) => [Number(y), v]));
  const rowsAll = years.map((y) => [y, ...keys.map((k) => series[k]?.[y] ?? '')]);
  return (
    <Page kicker="Data" title="Data explorer" lead={`${TS.meta.points.toLocaleString('en-US')} sourced data points. Pick a country, a food and a series; download any selection as CSV.`}>
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Dataset" value={kind} onChange={(v) => set('k', v)}>
            <option value="balance">Food balance (thousand tonnes)</option>
            <option value="macro">Economy and people</option>
            <option value="prices">World prices</option>
          </Select>
          {kind !== 'prices' && <CountrySelect summary={data.summary} value={mid} onChange={(v) => set('c', v)} />}
          {kind === 'balance' && <FoodSelect summary={data.summary} value={food} onChange={(v) => set('f', v)} />}
          {keys.length > 0 && (
            <Select label="Series" value={key} onChange={setPick}>
              {keys.map((k) => (
                <option key={k} value={k}>
                  {labelOf(k)}
                </option>
              ))}
            </Select>
          )}
        </div>
      </Card>
      {keys.length ? (
        <>
          <Card>
            <LineChart title={labelOf(key)} unit={kind === 'balance' ? 'thousand tonnes' : ''} years={years} name={`${kind}-${mid}-${food}-${key}`} series={[{ key, label: labelOf(key), color: '#c22e16', vals }]} />
          </Card>
          <Card title="All series in this selection" aside={<Csv name={`${kind}-${kind === 'prices' ? 'world' : mid}${kind === 'balance' ? `-${food}` : ''}`} header={['Year', ...keys.map(labelOf)]} rows={rowsAll} />}>
            <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x max-h-[520px] overflow-y-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Year</th>
                    {keys.map((k) => (
                      <th key={k} className="n">
                        {labelOf(k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {years.map((y) => (
                    <tr key={y}>
                      <td>{y}</td>
                      {keys.map((k) => (
                        <td key={k} className="n">
                          {series[k]?.[y] == null ? '–' : series[k]![y]!.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SourceFooter ids={kind === 'macro' ? ['D3', 'D4', 'D7'] : kind === 'prices' ? ['K1', 'K2'] : ['D1', 'D2', 'D5', 'D6']} asOf={TS.meta.built} />
          </Card>
        </>
      ) : (
        <Card>
          <p className="m-0">Data not available for this selection.</p>
        </Card>
      )}
    </Page>
  );
}
