import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
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
      <Card title="Download the reference data">
        <p className="m-0 text-muted">
          Each dataset is published as JSON at a stable address and refreshed when a new dataset version is published. A keyed REST API with quotas (<code>/api/v1</code>) follows.
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
            <SourceFooter ids={kind === 'macro' ? 'D3' : kind === 'prices' ? 'D4' : ['D1', 'D2']} asOf={TS.meta.built} />
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
