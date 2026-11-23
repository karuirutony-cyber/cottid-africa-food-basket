/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Staples as E, type Landed } from '@afb/engines';
import { useDatasets } from '@/data/datasets';
import { Card, Csv, DataState, Kpi, KpiRow, Page, Select, SourceFooter, SourceLinks } from '@/components/ui';

const money = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '–' : `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const t1 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function useCost() {
  const [params, setParams] = useSearchParams();
  const q = useDatasets('LIB');
  const LIB = q.data?.LIB;
  const comms: { id: string; name: string }[] = LIB?.commodities ?? [];
  const cid = comms.some((c) => c.id === params.get('f')) ? params.get('f')! : 'rice';
  const view = useMemo(() => (LIB ? E.forCommodity(LIB, cid) : null), [LIB, cid]);
  const dests: { id: string; name: string; city: string; currency: string; lreg: string }[] = view?.destinations ?? [];
  const mid = dests.some((d) => d.id === (params.get('c') ?? '').toUpperCase()) ? params.get('c')!.toUpperCase() : 'KE';
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true });
  };
  return { ...q, LIB, comms, cid, view, dests, mid, set, params };
}

function Pickers({ c, market = true }: { c: ReturnType<typeof useCost>; market?: boolean }) {
  const byReg = (c.LIB?.lregs ?? {}) as Record<string, string>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Select label="Commodity" value={c.cid} onChange={(v) => c.set('f', v)}>
        {c.comms.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </Select>
      {market && (
        <Select label="Market" value={c.mid} onChange={(v) => c.set('c', v)}>
          {Object.entries(byReg).map(([r, label]) => (
            <optgroup key={r} label={label}>
              {c.dests
                .filter((d) => d.lreg === r)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      )}
    </div>
  );
}

const costFooter = (LIB: any) => (
  <SourceFooter ids={['A3', 'A10', 'D8']} asOf={LIB.meta.date} note={`${LIB.meta.costNote} US$ per tonne.`} />
);

/** Cheapest origin for every market: the legacy overview matrix. */
export function Matrix() {
  const c = useCost();
  const rows = useMemo(() => {
    if (!c.view) return [];
    return c.dests.map((d) => {
      const list = E.compare(c.view, d.id).filter((r) => r.available);
      return { d, list };
    });
  }, [c.view, c.dests]);
  if (!c.LIB || !c.view) return <DataState loading={c.loading} error={c.error} />;
  const origins: { id: string; name: string }[] = c.view.origins;
  const regs = c.LIB.lregs as Record<string, string>;
  return (
    <Page kicker="Cost of Imports" title={`Who supplies each market cheapest: ${c.view.commodity.name.toLowerCase()}`} lead="Landed cost, delivered to each market's main city, on the default route and duty regime, for every origin. The cheapest origin is highlighted.">
      <Card>
        <Pickers c={c} market={false} />
      </Card>
      <Card
        aside={
          <Csv
            name={`landed-cost-matrix-${c.cid}`}
            header={['Market', 'City', 'Cheapest origin', 'Cheapest landed US$/t', ...origins.map((o) => o.name)]}
            rows={rows.map(({ d, list }) => [d.name, d.city, list[0]?.origin ?? '', list[0]?.total ?? '', ...origins.map((o) => list.find((r) => r.originId === o.id)?.total ?? '')])}
          />
        }
      >
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x max-h-[760px] overflow-y-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Market</th>
                <th>Cheapest</th>
                {origins.map((o) => (
                  <th key={o.id} className="n">
                    {o.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(regs).map(([r, label]) => [
                <tr key={r} className="grp">
                  <th colSpan={origins.length + 2} scope="colgroup">
                    {label}
                  </th>
                </tr>,
                ...rows
                  .filter(({ d }) => d.lreg === r)
                  .map(({ d, list }) => (
                    <tr key={d.id}>
                      <td>
                        <Link to={`/cost/calculator?f=${c.cid}&c=${d.id}`} className="font-semibold">
                          {d.name}
                        </Link>
                        <span className="block text-[12px] text-muted">{d.city}</span>
                      </td>
                      <td>{list[0] ? <b>{list[0].origin}</b> : '–'}</td>
                      {origins.map((o) => {
                        const x = list.find((l) => l.originId === o.id);
                        const best = x && list[0] && x.originId === list[0].originId;
                        return (
                          <td key={o.id} className={`n ${best ? 'bg-[#e3f1e7] font-bold text-[#1d5e36]' : ''}`}>
                            {x ? money(x.total) : '–'}
                          </td>
                        );
                      })}
                    </tr>
                  )),
              ])}
            </tbody>
          </table>
        </div>
        {costFooter(c.LIB)}
      </Card>
    </Page>
  );
}

/** The landed-cost calculator: every line from FOB to delivered, editable. */
export function Calculator() {
  const c = useCost();
  const [over, setOver] = useState<Record<string, string>>({});
  const view = c.view;
  const dest = view?.destinations.find((d: any) => d.id === c.mid);
  const origins: any[] = view?.origins ?? [];
  const originId = origins.some((o) => o.id === over.originId) ? over.originId! : (view ? E.compare(view, c.mid).find((r) => r.available)?.originId ?? origins[0]?.id : '');
  const origin = origins.find((o) => o.id === originId);
  const gradeId = origin?.grades.some((g: any) => g.id === over.gradeId) ? over.gradeId : origin?.grades[0]?.id;
  const regimeId = dest?.regimes?.some((r: any) => r.id === over.regimeId) ? over.regimeId : dest?.regimes?.find((r: any) => r.default)?.id ?? dest?.regimes?.[0]?.id;
  const routeId = dest?.routes?.some((r: any) => r.id === over.routeId) ? over.routeId : dest?.routes?.[0]?.id;
  const num = (k: string) => (over[k] != null && over[k] !== '' && Number.isFinite(+over[k]!) ? +over[k]! : undefined);
  const s = { originId, gradeId, destId: c.mid, routeId, regimeId, qty: num('qty') ?? 25, fob: num('fob'), ocean: num('ocean'), portCost: num('portCost'), inland: num('inland'), customsValue: num('customsValue') };
  const r: Landed | null = view && origin ? E.landed(view, s) : null;
  const peers = view && dest ? origins.map((o) => E.landed(view, { originId: o.id, destId: c.mid, routeId, regimeId })).filter((x) => x.available).sort((a, b) => a.total - b.total) : [];
  const cheapest = peers[0];
  const toMatch = r?.available && cheapest && cheapest.originId !== originId ? E.fobToReach(view, s, cheapest.total) : null;
  if (!c.LIB || !view) return <DataState loading={c.loading} error={c.error} />;
  const set = (k: string, v: string) => setOver((o) => ({ ...o, [k]: v }));
  const numberField = (k: string, label: string, placeholder?: number | string) => (
    <label className="grid gap-1 text-[12.5px] font-semibold text-muted">
      {label}
      <input type="number" min={0} step={1} inputMode="decimal" value={over[k] ?? ''} placeholder={placeholder != null ? String(placeholder) : ''} onChange={(e) => set(k, e.target.value)} className="min-h-[40px] rounded-lg border border-line bg-surface px-2 text-[14.5px] text-ink" />
    </label>
  );
  return (
    <Page kicker="Cost of Imports" title="Landed-cost calculator" lead="Builds the delivered cost per tonne from the FOB price through freight, insurance, duty, levies, VAT, port and inland charges. Select the commodity, market, origin and duty regime, then adjust any input to test a quotation.">
      <Card>
        <Pickers c={c} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Origin" value={originId ?? ''} onChange={(v) => setOver({ originId: v })}>
            {origins.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
          <Select label="Grade" value={gradeId ?? ''} onChange={(v) => set('gradeId', v)}>
            {origin?.grades.map((g: any) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
          <Select label="Route" value={routeId ?? ''} onChange={(v) => set('routeId', v)}>
            {dest?.routes.map((x: any) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
          <Select label="Duty regime" value={regimeId ?? ''} onChange={(v) => set('regimeId', v)}>
            {dest?.regimes?.map((x: any) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
          {numberField('fob', 'FOB or ex-works price (US$/t)', r?.available ? r.fob : undefined)}
          {numberField('ocean', 'Ocean freight (US$/t)', r?.available ? r.ocean : undefined)}
          {numberField('portCost', 'Port and clearing (US$/t)', r?.available ? r.portCost : undefined)}
          {numberField('inland', 'Inland or road (US$/t)', r?.available ? r.inland : undefined)}
          {numberField('qty', 'Quantity (t)', 25)}
          {numberField('customsValue', 'Customs value (US$/t), optional', 'CIF')}
        </div>
        <div className="mt-3">
          <button type="button" className="btn" onClick={() => setOver({})}>
            Reset to default
          </button>
        </div>
      </Card>
      {r && r.available ? (
        <>
          <KpiRow>
            <Kpi label="Landed cost" value={`${money(r.total, 1)}/t`} sub={`delivered ${dest.city}`} />
            <Kpi label="Per kilo" value={`$${r.perKg.toFixed(2)}`} sub={r.localPerKg ? `${r.currency} ${t1(r.localPerKg)}` : ''} />
            <Kpi label={`Shipment of ${r.qty} t`} value={money(r.shipment)} />
            <Kpi label="Cheapest origin" value={cheapest?.origin ?? '–'} sub={cheapest ? `${money(cheapest.total, 1)}/t` : ''} />
            <Kpi label="Retail benchmark" value={r.benchmark ? `${money(r.benchmark)}/t` : '–'} sub={r.headroom != null ? `headroom ${t1(r.headroom)}%` : ''} />
          </KpiRow>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={`${r.origin} → ${r.dest}: ${r.grade}`} aside={<Csv name={`landed-${c.cid}-${r.originId}-${c.mid}`} header={['Line', 'US$ per tonne', 'Rule']} rows={r.lines.map((l) => [l.label, l.value, l.rule ?? ''])} />}>
              <table className="tbl">
                <tbody>
                  {r.lines.map((l, i) => (
                    <tr key={i} className={l.subtotal ? 'font-bold' : ''}>
                      <td>
                        {l.label}
                        {l.rule && <span className="block text-[12px] font-normal text-muted">{l.rule}</span>}
                      </td>
                      <td className="n">{money(l.value, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="m-0 mt-2 text-[12.5px] text-muted">
                {r.route}; about {r.days} days inland. {toMatch != null && cheapest ? `To match ${cheapest.origin} at ${money(cheapest.total, 1)}/t, the FOB price would need to be ${money(toMatch, 0)}/t.` : ''}
              </p>
            </Card>
            <Card title="Every origin into this market" aside={<Csv name={`origins-${c.cid}-${c.mid}`} header={['Origin', 'Grade', 'FOB', 'CIF', 'Duty', 'Landed']} rows={peers.map((p) => [p.origin, p.grade, p.fob, p.cif, p.duty, p.total])} />}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Origin</th>
                    <th className="n">FOB</th>
                    <th className="n">CIF</th>
                    <th className="n">Duty</th>
                    <th className="n">Landed</th>
                  </tr>
                </thead>
                <tbody>
                  {peers.map((p) => (
                    <tr key={p.originId} className={p.originId === originId ? 'bg-sec-tint' : ''}>
                      <td>
                        <button type="button" className="text-start font-semibold text-sec-ink hover:underline" onClick={() => setOver({ originId: p.originId })}>
                          {p.origin}
                        </button>
                        <span className="block text-[12px] text-muted">{p.grade}</span>
                      </td>
                      <td className="n">{money(p.fob)}</td>
                      <td className="n">{money(p.cif, 1)}</td>
                      <td className="n">{money(p.duty, 1)}</td>
                      <td className="n font-bold">{money(p.total, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
          <SourceFooter ids={[origin.grades.find((g: any) => g.id === gradeId)?.src, dest.regimes?.find((x: any) => x.id === regimeId)?.src, 'A3'].filter(Boolean)} asOf={c.LIB.meta.date} note={c.LIB.meta.costNote} />
        </>
      ) : (
        <Card>
          <p className="m-0">Data not available: {r && !r.available ? r.reason : 'no origin supplies this market.'}</p>
        </Card>
      )}
    </Page>
  );
}

/** Origins: export prices by grade, with policy notes and sources. */
export function Origins() {
  const c = useCost();
  if (!c.LIB || !c.view) return <DataState loading={c.loading} error={c.error} />;
  const origins: any[] = c.view.origins;
  return (
    <Page kicker="Cost of Imports" title={`Origins: ${c.view.commodity.name.toLowerCase()}`} lead="Where the commodity is bought, the grades on offer and the latest export price for each, with the source and date of every quote.">
      <Card>
        <Pickers c={c} market={false} />
      </Card>
      <Card aside={<Csv name={`origins-${c.cid}`} header={['Origin', 'Port', 'Grade', 'FOB US$/t', 'Note', 'Source']} rows={origins.flatMap((o) => o.grades.map((g: any) => [o.name, o.port ?? 'by road', g.label, g.fob, g.note ?? '', g.src ?? '']))} />}>
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Origin</th>
                <th>Grade</th>
                <th className="n">FOB US$/t</th>
                <th>Quote</th>
                <th>Policy</th>
              </tr>
            </thead>
            <tbody>
              {origins.flatMap((o) =>
                o.grades.map((g: any, i: number) => (
                  <tr key={`${o.id}${g.id}`}>
                    <td>{i === 0 ? (<><b>{o.name}</b><span className="block text-[12px] text-muted">{o.regional ? 'by road' : o.port}</span></>) : ''}</td>
                    <td>{g.label}</td>
                    <td className="n font-bold">{money(g.fob)}</td>
                    <td className="text-[13px]">
                      {g.note} <SourceLinks ids={g.src} />
                    </td>
                    <td className="text-[13px] text-muted">{i === 0 ? o.policy : ''}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        {costFooter(c.LIB)}
      </Card>
    </Page>
  );
}

/** Markets: routes, duty regimes, VAT and levies in each market. */
export function Markets() {
  const c = useCost();
  if (!c.LIB || !c.view) return <DataState loading={c.loading} error={c.error} />;
  const d = c.view.destinations.find((x: any) => x.id === c.mid);
  const best = E.compare(c.view, c.mid).filter((r) => r.available);
  return (
    <Page kicker="Cost of Imports" title={`Markets: ${d.name}`} lead="How a cargo reaches the market, the duty regimes that apply, VAT, levies and the retail benchmark the landed cost is compared with.">
      <Card>
        <Pickers c={c} />
      </Card>
      <KpiRow>
        <Kpi label="Delivered to" value={d.city} sub={`${d.depth === 'full' ? 'Full' : 'Standard'} depth`} />
        <Kpi label="Cheapest landed" value={best[0] ? `${money(best[0].total, 1)}/t` : '–'} sub={best[0]?.origin} />
        <Kpi label="Retail benchmark" value={d.benchmark ? `${money(d.benchmark)}/t` : '–'} sub={d.benchmarkNote} />
        <Kpi label="Currency" value={d.currency} sub={c.LIB.meta.fx?.[d.currency] ? `${c.LIB.meta.fx[d.currency]} per US$` : ''} />
      </KpiRow>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Routes">
          <table className="tbl">
            <thead>
              <tr>
                <th>Route</th>
                <th className="n">Port and clearing</th>
                <th className="n">Inland</th>
                <th className="n">Days</th>
              </tr>
            </thead>
            <tbody>
              {d.routes.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  <td className="n">{money(r.portCost)}</td>
                  <td className="n">{money(r.inland)}</td>
                  <td className="n">{r.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Duty regimes">
          <ul className="m-0 grid gap-2 ps-5 text-[14px]">
            {(d.regimes ?? []).map((r: any) => (
              <li key={r.id}>
                {r.label} {r.default && <b>(default)</b>} <SourceLinks ids={r.src} />
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[13px] text-muted">
            VAT: {d.vat != null ? `${(d.vat * 100).toFixed(0)}%` : '–'}. {d.vatNote}
          </p>
          {d.levies?.length ? (
            <p className="m-0 mt-1 text-[13px] text-muted">Levies: {d.levies.map((l: any) => `${l.label ?? l.name} (${((l.rate ?? 0) * 100).toFixed(1)}%)`).join('; ')}.</p>
          ) : null}
        </Card>
      </div>
      {costFooter(c.LIB)}
    </Page>
  );
}
