import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { pc, usd } from '@afb/engines';
import { useDatasets } from '@/data/datasets';
import { AfricaMap, MEASURES, type Measure } from '@/components/AfricaMap';
import { Card, Csv, DataState, Page, SearchBox, Select, SourceFooter } from '@/components/ui';

type SortKey = 'name' | 'region' | 'ssr' | 'imp' | 'exp' | 'bal' | 'kcal' | 'prot';

export default function Countries() {
  const { data, loading, error } = useDatasets('summary', 'MAP');
  const [measure, setMeasure] = useState<Measure>('ssr');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('name');

  const rows = useMemo(() => {
    if (!data) return [];
    const S = data.summary;
    const regionOf = (id: string) => Object.entries(S.regions).find(([, ids]) => ids.includes(id))?.[0] ?? '';
    const list = Object.entries(S.markets).map(([id, name]) => {
      const c = S.countries[id]!;
      return { id, name, region: regionOf(id), ...c, bal: c.imp == null && c.exp == null ? null : (c.exp ?? 0) - (c.imp ?? 0) };
    });
    const f = q.trim().toLowerCase();
    const filtered = f ? list.filter((r) => r.name.toLowerCase().includes(f) || r.region.toLowerCase().includes(f)) : list;
    return filtered.sort((a, b) => {
      if (sort === 'name' || sort === 'region') return a[sort].localeCompare(b[sort]) || a.name.localeCompare(b.name);
      const va = a[sort] ?? -Infinity;
      const vb = b[sort] ?? -Infinity;
      return vb - va;
    });
  }, [data, q, sort]);

  if (!data) return <DataState loading={loading} error={error} />;
  const S = data.summary;
  const th = (k: SortKey, label: string, n = true) => (
    <th className={n ? 'n' : ''} aria-sort={sort === k ? (k === 'name' || k === 'region' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="font-bold" onClick={() => setSort(k)}>
        {label}
        {sort === k ? (k === 'name' || k === 'region' ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );

  return (
    <Page
      kicker="Countries"
      title="All African countries"
      lead={`Production, consumption, trade and diet for ${S.stats.countries} countries. Select a country on the map or in the table for its summary, diet and food trade.`}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <Select label="Colour by" value={measure} onChange={(v) => setMeasure(v as Measure)}>
            {(Object.keys(MEASURES) as Measure[]).map((k) => (
              <option key={k} value={k}>
                {MEASURES[k].label(S)}
              </option>
            ))}
          </Select>
          <div className="mt-2">
            <AfricaMap map={data.MAP} summary={S} measure={measure} />
          </div>
        </Card>
        <Card
          title="Countries"
          aside={
            <Csv
              name="africa-countries"
              header={['ISO2', 'Country', 'Region', 'Self-sufficiency', `Food imports ${S.tradeYear} US$m`, `Food exports ${S.tradeYear} US$m`, 'Trade balance US$m', `kcal per person ${S.nutYear}`, `Protein g per person ${S.nutYear}`]}
              rows={rows.map((r) => [r.id, r.name, r.region, r.ssr, r.imp, r.exp, r.bal, r.kcal, r.prot])}
            />
          }
        >
          <SearchBox label="Find a country or region" value={q} onChange={setQ} />
          <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x mt-3 max-h-[640px] overflow-y-auto">
            <table className="tbl">
              <thead>
                <tr>
                  {th('name', 'Country', false)}
                  {th('region', 'Region', false)}
                  {th('ssr', 'Self-sufficiency')}
                  {th('imp', `Imports ${S.tradeYear}`)}
                  {th('exp', `Exports ${S.tradeYear}`)}
                  {th('bal', 'Balance')}
                  {th('kcal', 'kcal/day')}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/countries/${r.id}`} className="font-semibold">
                        {r.name}
                      </Link>
                    </td>
                    <td className="text-muted">{r.region}</td>
                    <td className="n">{r.ssr == null ? '–' : pc(r.ssr, 0)}</td>
                    <td className="n">{usd(r.imp)}</td>
                    <td className="n">{usd(r.exp)}</td>
                    <td className={`n ${r.bal != null && r.bal < 0 ? 'text-[#8f1f0d]' : 'text-[#1d5e36]'}`}>
                      {r.bal == null ? '–' : `${r.bal < 0 ? '−' : '+'}${usd(Math.abs(r.bal))}`}
                    </td>
                    <td className="n">{r.kcal == null ? '–' : Math.round(r.kcal).toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SourceFooter ids={['D1', 'D5']} asOf={S.built} note="Self-sufficiency: production as a share of consumption, all foods by weight. Trade: UN Comtrade. Diet: FAOSTAT food balances." />
        </Card>
      </div>
    </Page>
  );
}
