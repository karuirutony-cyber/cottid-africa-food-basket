import { useSearchParams, Link } from 'react-router-dom';
import { Forecast as F, pc, usd } from '@afb/engines';
import { useDatasets } from '@/data/datasets';
import { CountrySelect } from '@/components/pickers';
import { Card, Csv, DataState, Page, SourceFooter } from '@/components/ui';

const latest = (s: Record<string, number | null> | undefined) => {
  if (!s) return null;
  const y = Object.keys(s).filter((k) => s[k] != null).sort().pop();
  return y ? { y, v: s[y]! } : null;
};

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const ids = (params.get('c') ?? 'KE,NG,EG,ET').split(',').filter(Boolean).slice(0, 4);
  const { data, loading, error } = useDatasets('TS', 'summary');
  if (!data) return <DataState loading={loading} error={error} />;
  const { TS, summary } = data;
  const valid = ids.filter((i) => TS.meta.markets[i]);
  const set = (i: number, v: string) => {
    const next = [...valid];
    next[i] = v;
    setParams({ c: [...new Set(next)].join(',') }, { replace: true });
  };
  const BY = F.BASE_YEAR;
  const metrics: { label: string; unit?: string; val: (mid: string) => string; raw: (mid: string) => number | string | null }[] = [
    { label: 'Self-sufficiency, all foods', val: (m) => pc(summary.countries[m]?.ssr, 0), raw: (m) => summary.countries[m]?.ssr ?? null },
    { label: `Food imports, ${summary.tradeYear}`, val: (m) => usd(summary.countries[m]?.imp), raw: (m) => summary.countries[m]?.imp ?? null },
    { label: `Food exports, ${summary.tradeYear}`, val: (m) => usd(summary.countries[m]?.exp), raw: (m) => summary.countries[m]?.exp ?? null },
    { label: `Calories per person a day, ${summary.nutYear}`, val: (m) => (summary.countries[m]?.kcal == null ? '–' : Math.round(summary.countries[m]!.kcal!).toLocaleString('en-US')), raw: (m) => summary.countries[m]?.kcal ?? null },
    { label: `Protein per person a day (g), ${summary.nutYear}`, val: (m) => (summary.countries[m]?.prot == null ? '–' : summary.countries[m]!.prot!.toFixed(0)), raw: (m) => summary.countries[m]?.prot ?? null },
    { label: `Population, ${BY} (million)`, val: (m) => (TS.macro[m]?.pop_un?.[BY] != null ? TS.macro[m]!.pop_un![BY]!.toFixed(1) : '–'), raw: (m) => TS.macro[m]?.pop_un?.[BY] ?? null },
  ];
  for (const key of ['gdp_pc', 'gdp_growth', 'cpi', 'undernourished', 'food_insecure', 'agri_share', 'cereal_yield', 'food_imp_share']) {
    const s = TS.meta.macro_series.find((x) => x.key === key);
    if (!s) continue;
    metrics.push({
      label: s.label,
      unit: s.unit,
      val: (m) => {
        const l = latest(TS.macro[m]?.[key]);
        return l ? `${l.v.toLocaleString('en-US', { maximumFractionDigits: 1 })} (${l.y})` : '–';
      },
      raw: (m) => latest(TS.macro[m]?.[key])?.v ?? null,
    });
  }
  return (
    <Page kicker="Countries" title="Compare countries" lead="Up to four countries side by side. Choose a country in any column.">
      <Card aside={<Csv name="compare" header={['Measure', ...valid.map((m) => TS.meta.markets[m]!)]} rows={metrics.map((x) => [x.label, ...valid.map(x.raw)])} />}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <CountrySelect key={i} summary={summary} value={valid[i] ?? ''} onChange={(v) => set(i, v)} label={`Country ${i + 1}`} />
          ))}
        </div>
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x mt-4">
          <table className="tbl">
            <thead>
              <tr>
                <th>Measure</th>
                {valid.map((m) => (
                  <th key={m} className="n">
                    <Link to={`/countries/${m}`}>{TS.meta.markets[m]}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((x) => (
                <tr key={x.label}>
                  <td>
                    {x.label}
                    {x.unit && <span className="block text-[11.5px] text-muted">{x.unit}</span>}
                  </td>
                  {valid.map((m) => (
                    <td key={m} className="n">
                      {x.val(m)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SourceFooter ids={['D1', 'D5']} asOf={summary.built} note="Macro indicators: World Bank WDI and UN WPP." />
      </Card>
    </Page>
  );
}
