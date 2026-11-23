import { useParams } from 'react-router-dom';
import { useDatasets } from '@/data/datasets';
import { LineChart } from '@/components/charts';
import { CountrySelect } from '@/components/pickers';
import { Card, Csv, DataState, Kpi, KpiRow, NotAvailable, Page, SourceFooter } from '@/components/ui';
import { NotFound } from '@/pages/SystemPage';
import { CountryTabs, useGo } from './shared';

const lastIdx = (a: (number | null)[]) => {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return i;
  return -1;
};

export default function Diet() {
  const { iso2 = '' } = useParams();
  const mid = iso2.toUpperCase();
  const go = useGo();
  const { data, loading, error } = useDatasets('NUT', 'TS', 'summary');
  if (!data) return <DataState loading={loading} error={error} />;
  const { NUT, TS } = data;
  if (!TS.meta.markets[mid]) return <NotFound />;
  const name = TS.meta.markets[mid]!;
  const d = NUT.data[mid];
  const years = NUT.meta.years;

  const header = (
    <>
      <CountryTabs mid={mid} />
    </>
  );
  if (!d)
    return (
      <Page kicker="Countries" title={`Diet: ${name}`}>
        {header}
        <Card>
          <NotAvailable>Data not available: FAOSTAT publishes no food balance for {name}.</NotAvailable>
        </Card>
      </Page>
    );

  const li = lastIdx(d.tot.k);
  const y = years[li]!;
  const k0 = d.tot.k[0];
  const kl = d.tot.k[li]!;
  const pl = d.tot.p[li];
  const foods = Object.entries(d.f)
    .map(([c, v]) => ({ c, label: TS.comm[c]?.label ?? c, fg: TS.comm[c]?.fg ?? 'other', k: v.k[li] ?? null, p: v.p[li] ?? null, k0: v.k[0] ?? null }))
    .filter((x) => x.k != null || x.p != null);
  const topK = foods.slice().sort((a, b) => (b.k ?? 0) - (a.k ?? 0)).slice(0, 3);
  const groups = TS.meta.food_groups
    .map(([g, label]) => ({ g, label, list: foods.filter((f) => f.fg === g).sort((a, b) => (b.k ?? 0) - (a.k ?? 0)) }))
    .filter((x) => x.list.length);
  const kSeries = Object.fromEntries(years.map((yy, i) => [yy, d.tot.k[i] ?? null]));
  const pSeries = Object.fromEntries(years.map((yy, i) => [yy, d.tot.p[i] ?? null]));
  const share = (v: number | null, t: number | null | undefined) => (v == null || !t ? '–' : `${((v / t) * 100).toFixed(0)}%`);

  return (
    <Page
      kicker="Countries"
      title={`Diet: ${name}`}
      lead={`Calories and protein available per person per day, ${years[0]}–${y}, from the FAOSTAT food balances. ${NUT.meta.note}`}
      actions={
        <div className="w-60">
          <CountrySelect summary={data.summary} value={mid} onChange={(c) => go(`/countries/${c}/diet`)} label="Another country" />
        </div>
      }
    >
      {header}
      <KpiRow>
        <Kpi label={`Calories, ${y}`} value={Math.round(kl).toLocaleString('en-US')} sub="kcal per person per day" />
        <Kpi label={`Protein, ${y}`} value={pl == null ? '–' : `${pl.toFixed(1)} g`} sub="per person per day" />
        <Kpi label={`Change since ${years[0]}`} value={k0 == null ? '–' : `${kl - k0 >= 0 ? '+' : '−'}${Math.abs(Math.round(kl - k0)).toLocaleString('en-US')} kcal`} sub={k0 == null ? '' : `from ${Math.round(k0).toLocaleString('en-US')}`} />
        <Kpi label="Largest source" value={topK[0]?.label ?? '–'} sub={topK[0] ? `${share(topK[0].k, kl)} of calories` : ''} />
        <Kpi label="Next" value={topK[1]?.label ?? '–'} sub={topK[1] ? `${share(topK[1].k, kl)} of calories` : ''} />
      </KpiRow>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <LineChart title="Calories available" unit="kcal per person per day" years={years} name={`${mid}-kcal`} series={[{ key: 'k', label: 'Calories', color: '#c22e16', vals: kSeries }]} />
        </Card>
        <Card>
          <LineChart title="Protein available" unit="grams per person per day" years={years} name={`${mid}-protein`} series={[{ key: 'p', label: 'Protein', color: '#22804a', vals: pSeries }]} fmt={(v) => v.toFixed(1)} />
        </Card>
      </div>
      <Card
        title={`By food, ${y}`}
        aside={<Csv name={`${mid}-diet-${y}`} header={['Food', 'Group', `kcal ${y}`, `Protein g ${y}`, `kcal ${years[0]}`]} rows={foods.map((f) => [f.label, f.fg, f.k, f.p, f.k0])} />}
      >
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Food</th>
                <th className="n">kcal a day</th>
                <th className="n">Share of calories</th>
                <th className="n">Protein, g a day</th>
                <th className="n">Share of protein</th>
                <th className="n">kcal in {years[0]}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => [
                <tr key={g.g} className="grp">
                  <th colSpan={6} scope="colgroup">
                    {g.label}
                  </th>
                </tr>,
                ...g.list.map((f) => (
                  <tr key={f.c}>
                    <td>{f.label}</td>
                    <td className="n">{f.k == null ? '–' : Math.round(f.k).toLocaleString('en-US')}</td>
                    <td className="n">{share(f.k, kl)}</td>
                    <td className="n">{f.p == null ? '–' : f.p.toFixed(1)}</td>
                    <td className="n">{share(f.p, pl)}</td>
                    <td className="n">{f.k0 == null ? '–' : Math.round(f.k0).toLocaleString('en-US')}</td>
                  </tr>
                )),
              ])}
            </tbody>
            <tfoot>
              <tr>
                <td>All foods (including foods not listed)</td>
                <td className="n">{Math.round(kl).toLocaleString('en-US')}</td>
                <td className="n">100%</td>
                <td className="n">{pl == null ? '–' : pl.toFixed(1)}</td>
                <td className="n">100%</td>
                <td className="n">{k0 == null ? '–' : Math.round(k0).toLocaleString('en-US')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <SourceFooter ids="D1" asOf={NUT.meta.built} note={`${NUT.meta.source}. Food supply available for consumption before household waste; not measured intake.`} />
      </Card>
    </Page>
  );
}
