import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { africaTrade, exportsOf, flowTotal, importsOf, ktf, topPartners, usd, type Flow, type TSData } from '@afb/engines';
import { useDatasets } from '@/data/datasets';
import { BarList } from '@/components/charts';
import { CountrySelect } from '@/components/pickers';
import { Card, Csv, DataState, Kpi, KpiRow, Page, SourceFooter } from '@/components/ui';
import { NotFound } from '@/pages/SystemPage';
import { CountryTabs, useGo } from './shared';

const share = (v: number, t: number) => (t ? `${Math.round((v / t) * 100)}%` : '');
const uv = (t: Flow['t']) => (t[0] ? `$${Math.round((t[1] / t[0]) * 1000).toLocaleString('en-US')}` : '–');
const parts = (d: Flow, n: number) =>
  d.r
    .filter((r) => !/^Other \(/.test(r[0]) && r[2] / d.t[1] >= 0.005)
    .slice(0, n)
    .map((r) => `${r[0]} ${share(r[2], d.t[1])}`)
    .join(', ');

function FlowTable({ TS, S, who, year, food, onPick, name }: { TS: TSData; S: Record<string, Flow>; who: string; year: number; food: string | null; onPick: (c: string) => void; name: string }) {
  if (!Object.keys(S).length) return <p className="m-0">Data not available: no customs trade is recorded for these foods.</p>;
  const groups = TS.meta.food_groups.map(([g, label]) => [label, Object.keys(S).filter((c) => TS.comm[c]?.fg === g)] as const).filter((x) => x[1].length);
  return (
    <>
      <div className="mb-2 flex justify-end">
        <Csv name={name} header={['Food', 'Thousand tonnes', 'US$ million', 'US$ a tonne', who]} rows={Object.entries(S).map(([c, d]) => [TS.comm[c]?.label ?? c, d.t[0], d.t[1], d.t[0] ? Math.round((d.t[1] / d.t[0]) * 1000) : '', parts(d, 3)])} />
      </div>
      <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x">
        <table className="tbl">
          <thead>
            <tr>
              <th>Food</th>
              <th className="n">Thousand tonnes</th>
              <th className="n">Value</th>
              <th className="n">US$ a tonne</th>
              <th>{who}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([label, list]) => [
              <tr key={label} className="grp">
                <th colSpan={5} scope="colgroup">
                  {label}
                </th>
              </tr>,
              ...list.map((c) => (
                <tr key={c} className={c === food ? 'bg-sec-tint' : ''}>
                  <td>
                    <button type="button" className="text-start font-semibold text-sec-ink hover:underline" onClick={() => onPick(c)} aria-pressed={c === food}>
                      {TS.comm[c]!.label}
                    </button>
                    {S[c]!.b === 'mirror' && <span className="text-xs text-muted"> partner reports</span>}
                    {S[c]!.b === 'mixed' && <span className="text-xs text-muted"> partly partner reports</span>}
                    {S[c]!.y && S[c]!.y !== year ? <span className="text-xs text-muted"> {S[c]!.y}</span> : null}
                  </td>
                  <td className="n">{ktf(S[c]!.t[0])}</td>
                  <td className="n">{usd(S[c]!.t[1])}</td>
                  <td className="n">{uv(S[c]!.t)}</td>
                  <td>{parts(S[c]!, 3)}</td>
                </tr>
              )),
            ])}
          </tbody>
          <tfoot>
            <tr>
              <td>All traded foods</td>
              <td />
              <td className="n">{usd(flowTotal(S))}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

export default function Trade() {
  const { iso2 = '' } = useParams();
  const mid = iso2.toUpperCase();
  const go = useGo();
  const { data, loading, error } = useDatasets('TS', 'FT', 'SELL', 'summary');
  const [picked, setPicked] = useState<string | null>(null);
  const A = useMemo(() => (data ? africaTrade(data.TS, data.FT, data.SELL) : []), [data]);
  if (!data) return <DataState loading={loading} error={error} />;
  const { TS, FT, SELL } = data;
  if (!TS.meta.markets[mid]) return <NotFound />;
  const name = TS.meta.markets[mid]!;
  const I = importsOf(FT, SELL, mid);
  const E = exportsOf(FT, mid);
  const have = FT.foods.filter((c) => I[c] || E[c]);
  const food =
    picked && have.includes(picked)
      ? picked
      : (have.slice().sort((a, b) => (I[b]?.t[1] ?? 0) + (E[b]?.t[1] ?? 0) - (I[a]?.t[1] ?? 0) - (E[a]?.t[1] ?? 0))[0] ?? null);
  const ti = flowTotal(I);
  const te = flowTotal(E);
  const big = (S: Record<string, Flow>) => Object.entries(S).sort((a, b) => b[1].t[1] - a[1].t[1])[0];
  const bi = big(I);
  const be = big(E);
  const Ai = A.reduce((a, x) => a + x.i, 0);
  const Ae = A.reduce((a, x) => a + x.e, 0);
  const Aia = A.reduce((a, x) => a + x.ia, 0);
  const bars = (d: Flow | undefined) => (d ? d.r.map((r) => ({ label: r[0], value: r[2], note: share(r[2], d.t[1]) })) : []);
  const years = [...new Set(Object.values(SELL).map((x) => x.y))].sort().reverse().join(' or ');

  return (
    <Page
      kicker="Countries"
      title={`Food trade: ${name}, ${FT.year}`}
      lead="Customs trade in every traded food, from cereals, sugar and oils to meat, fish, dairy, vegetables, fruits, coffee, tea and cocoa: who supplies each country, where its exports go, and the balance between the two."
      actions={
        <div className="w-60">
          <CountrySelect summary={data.summary} value={mid} onChange={(c) => go(`/countries/${c}/trade`)} label="Another country" />
        </div>
      }
    >
      <CountryTabs mid={mid} />
      <KpiRow>
        <Kpi label="Food imports" value={usd(ti)} sub={`${FT.year}, ${Object.keys(I).length} foods`} />
        <Kpi label="Food exports" value={usd(te)} sub={`${FT.year}, ${Object.keys(E).length} foods`} />
        <Kpi label="Food trade balance" value={`${te >= ti ? '+' : '−'}${usd(Math.abs(te - ti))}`} sub={te >= ti ? 'exports exceed imports' : 'imports exceed exports'} />
        <Kpi label="Largest import" value={bi ? TS.comm[bi[0]]!.label : 'n/a'} sub={bi ? `${usd(bi[1].t[1])}, mainly from ${bi[1].r[0]?.[0] ?? ''}` : ''} />
        <Kpi label="Largest export" value={be ? TS.comm[be[0]]!.label : 'n/a'} sub={be ? `${usd(be[1].t[1])}, mainly to ${be[1].r[0]?.[0] ?? ''}` : ''} />
      </KpiRow>

      <Card title="Imports by food">
        <p className="m-0 mb-2 text-[13px] text-muted">
          As reported by {name} unless a row says "partner reports", which means the country's own report is missing and what its trading partners reported is used. Select a food for its suppliers.
        </p>
        <FlowTable TS={TS} S={I} who="Main suppliers, share of value" year={FT.year} food={food} onPick={setPicked} name={`${mid}-imports-${FT.year}`} />
      </Card>
      <Card title="Exports by food">
        <FlowTable TS={TS} S={E} who="Main destinations, share of value" year={FT.year} food={food} onPick={setPicked} name={`${mid}-exports-${FT.year}`} />
      </Card>
      {food && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title={`${TS.comm[food]!.label}: suppliers`}>
            <BarList rows={bars(I[food])} color="var(--paprika)" fmt={usd} />
          </Card>
          <Card title={`${TS.comm[food]!.label}: destinations`}>
            <BarList rows={bars(E[food])} color="var(--leaf)" fmt={usd} />
          </Card>
        </div>
      )}

      <Card title={`All Africa, ${FT.year}`}>
        <p className="m-0">
          African countries imported {usd(Ai)} of food and exported {usd(Ae)}: {Ae >= Ai ? 'a surplus' : 'a deficit'} of {usd(Math.abs(Ae - Ai))}. About {share(Aia, Ai)} of the imports came from other African countries.
        </p>
        <p className="m-0 mt-2">
          The largest import bills are{' '}
          {A.slice()
            .sort((a, b) => b.i - a.i)
            .slice(0, 4)
            .map((x) => `${TS.comm[x.c]!.label.toLowerCase()} (${usd(x.i)})`)
            .join(', ')}
          . The largest export earners are{' '}
          {A.slice()
            .sort((a, b) => b.e - a.e)
            .slice(0, 4)
            .map((x) => `${TS.comm[x.c]!.label.toLowerCase()} (${usd(x.e)})`)
            .join(', ')}
          .
        </p>
        <div className="mt-2 flex justify-end">
          <Csv name={`africa-food-trade-${FT.year}`} header={['Food', 'Imports US$m', 'Exports US$m', 'Share from Africa', 'Main suppliers', 'Main destinations']} rows={A.map((x) => [TS.comm[x.c]!.label, x.i, x.e, x.i ? x.ia / x.i : '', topPartners(x.sup, x.i), topPartners(x.dst, x.e)])} />
        </div>
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x mt-2">
          <table className="tbl">
            <thead>
              <tr>
                <th>Food</th>
                <th className="n">Imports</th>
                <th className="n">Exports</th>
                <th className="n">From Africa</th>
                <th>Main suppliers</th>
                <th>Main destinations</th>
              </tr>
            </thead>
            <tbody>
              {TS.meta.food_groups.map(([g, label]) => {
                const list = A.filter((x) => TS.comm[x.c]!.fg === g);
                return list.length
                  ? [
                      <tr key={g} className="grp">
                        <th colSpan={6} scope="colgroup">
                          {label}
                        </th>
                      </tr>,
                      ...list.map((x) => (
                        <tr key={x.c}>
                          <td>{TS.comm[x.c]!.label}</td>
                          <td className="n">{usd(x.i)}</td>
                          <td className="n">{usd(x.e)}</td>
                          <td className="n">{share(x.ia, x.i)}</td>
                          <td>{topPartners(x.sup, x.i)}</td>
                          <td>{topPartners(x.dst, x.e)}</td>
                        </tr>
                      )),
                    ]
                  : null;
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>All traded foods</td>
                <td className="n">{usd(Ai)}</td>
                <td className="n">{usd(Ae)}</td>
                <td className="n">{share(Aia, Ai)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="m-0 mt-2 text-[12.5px] text-muted">Trade between African countries is counted on both sides, as one country's import and another's export. Informal cross-border trade is not in customs data.</p>
      </Card>
      <SourceFooter
        ids="D5"
        asOf={String(FT.year)}
        note={
          <>
            UN Comtrade, annual, {FT.foods.length} foods with customs headings. Imports of the ten traded staples are for {years}, as on the{' '}
            <Link to="/directory/sellers">Sellers</Link> page. Tonnes are product weight as declared at customs, not comparable with the balances on other pages. Partner-report import values exclude freight and insurance.
          </>
        }
      />
    </Page>
  );
}
