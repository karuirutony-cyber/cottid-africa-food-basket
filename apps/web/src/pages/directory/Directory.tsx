import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ktf, usd, type Buyer, type ComplianceStep, type EventRec, type Supplier } from '@afb/engines';
import { useDatasets } from '@/data/datasets';
import { overlay, usePublished } from '@/data/published';
import { ExtLink, optionsOf, RecordTable } from '@/components/RecordTable';
import { BarList } from '@/components/charts';
import { CountrySelect, FoodSelect } from '@/components/pickers';
import { Card, Csv, DataState, Kpi, KpiRow, Page, Pill, SourceFooter, SourceLinks } from '@/components/ui';

const statusTone = (s: string) => (/^verified/i.test(s) ? 'go' : /lead|unverified/i.test(s) ? 'watch' : 'neutral');

export function Buyers() {
  const [params] = useSearchParams();
  const { data, loading, error } = useDatasets('REG', 'TS');
  const pub = usePublished('buyers').data;
  if (!data) return <DataState loading={loading} error={error} />;
  const { TS } = data;
  const REG = { ...data.REG, buyers: overlay(data.REG.buyers, (b) => b.ref, pub) };
  const label = (c: string) => TS.comm[c]?.label ?? (c === 'all' ? 'All staples' : c);
  const initialCountry = params.get('c') ? TS.meta.markets[params.get('c')!.toUpperCase()] : undefined;
  return (
    <Page kicker="Directory" title="Buyers" lead={`${REG.buyers.length} importers, millers, packers and processors that buy the traded staples, each with the evidence and the date it was last checked. "Verified" means confirmed by a public source; a lead still needs checking.`}>
      <RecordTable<Buyer>
        name="buyers"
        rows={REG.buyers}
        suggest={(r) => ({ target: `buyers/${r.ref}`, item: `${r.name} (${r.ref})` })}
        search={(r) => `${r.name} ${r.city} ${r.country} ${r.type} ${r.segment} ${r.origins} ${r.evidence}`}
        filters={[
          { label: 'Country', all: 'All countries', options: optionsOf(REG.buyers.map((b) => b.country)), match: (r, v) => r.country === v, initial: initialCountry },
          { label: 'Food', all: 'All foods', options: optionsOf(REG.buyers.flatMap((b) => b.commodities), label), match: (r, v) => r.commodities.includes(v), initial: params.get('f') ?? undefined },
          { label: 'Status', all: 'Any status', options: optionsOf(REG.buyers.map((b) => b.status)), match: (r, v) => r.status === v },
        ]}
        columns={[
          { label: 'Buyer', cell: (r) => (<><b>{r.name}</b><span className="block text-[12px] text-muted">{r.ref}</span></>), csv: (r) => r.name },
          { label: 'Where', cell: (r) => `${r.city}, ${r.country}`, csv: (r) => `${r.city}, ${r.country}` },
          { label: 'Type', cell: (r) => (<>{r.type}<span className="block text-[12px] text-muted">{r.segment}</span></>), csv: (r) => `${r.type}; ${r.segment}` },
          { label: 'Foods', cell: (r) => r.commodities.map(label).join(', '), csv: (r) => r.commodities.join(' ') },
          { label: 'Origins', cell: (r) => r.origins, csv: (r) => r.origins },
          { label: 'Evidence', cell: (r) => (<>{r.evidence} <SourceLinks ids={r.src} /></>), csv: (r) => `${r.evidence} [${r.src}]` },
          { label: 'Status', cell: (r) => (<><Pill tone={statusTone(r.status)}>{r.status}</Pill><span className="block text-[12px] text-muted">checked {r.checked}</span></>), csv: (r) => `${r.status}; checked ${r.checked}` },
        ]}
      />
    </Page>
  );
}

export function Sellers() {
  const [params] = useSearchParams();
  const { data, loading, error } = useDatasets('REG', 'TS', 'SELL', 'FT', 'summary');
  const [mid, setMid] = useState((params.get('c') ?? 'KE').toUpperCase());
  const [food, setFood] = useState(params.get('f') ?? 'rice');
  const sellRows = useMemo(() => data?.SELL[mid]?.c[food] ?? null, [data, mid, food]);
  const pubSup = usePublished('suppliers').data;
  if (!data) return <DataState loading={loading} error={error} />;
  const { TS, SELL, FT } = data;
  const REG = { ...data.REG, suppliers: overlay(data.REG.suppliers, (s) => s.ref, pubSup) };
  const L = SELL[mid];
  const label = (c: string) => TS.comm[c]?.label ?? (c === 'all' ? 'All staples' : c);
  const d = sellRows;
  return (
    <Page kicker="Directory" title="Sellers" lead="Who sells each traded staple to each African country: customs imports by origin, and the exporters, boards and regulators at each origin.">
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <CountrySelect summary={data.summary} value={mid} onChange={setMid} only={(k) => !!SELL[k]} />
          <FoodSelect summary={data.summary} value={food} onChange={setFood} only={(k) => FT.staples.includes(k)} />
        </div>
      </Card>
      {L && d ? (
        <>
          <KpiRow>
            <Kpi label={`${label(food)} imports, ${L.y}`} value={usd(d.t[1])} sub={`${ktf(d.t[0])} thousand t`} />
            <Kpi label="Origins" value={String(d.r.length)} sub={L.b === 'I' ? 'as reported by the importer' : "partners' reported exports"} />
            <Kpi label="Largest origin" value={d.r[0]?.[0] ?? '–'} sub={d.r[0] ? `${usd(d.r[0][2])}, ${Math.round((d.r[0][2] / d.t[1]) * 100)}%` : ''} />
            <Kpi label="Average price" value={d.t[0] ? `$${Math.round((d.t[1] / d.t[0]) * 1000).toLocaleString('en-US')}` : '–'} sub="US$ a tonne, customs value" />
          </KpiRow>
          <Card title={`Where ${TS.meta.markets[mid]} buys ${label(food).toLowerCase()}`} aside={<Csv name={`sellers-${mid}-${food}`} header={['Origin', 'Thousand tonnes', 'US$ million']} rows={d.r.map((r) => [r[0], r[1], r[2]])} />}>
            <BarList rows={d.r.map((r) => ({ label: r[0], value: r[2], note: r[1] != null ? `${ktf(r[1])} kt` : undefined }))} color="var(--sec)" fmt={usd} />
            <SourceFooter ids="D5" asOf={String(L.y)} note="UN Comtrade customs imports." />
          </Card>
        </>
      ) : (
        <Card>
          <p className="m-0">Data not available: no customs imports of {label(food).toLowerCase()} are recorded for {TS.meta.markets[mid]}.</p>
        </Card>
      )}
      <RecordTable<Supplier>
        title="Exporters and origin bodies"
        name="suppliers"
        rows={REG.suppliers}
        suggest={(r) => ({ target: `suppliers/${r.ref}`, item: `${r.name} (${r.ref})` })}
        search={(r) => `${r.name} ${r.origin} ${r.role}`}
        filters={[
          { label: 'Origin', all: 'All origins', options: optionsOf(REG.suppliers.map((s) => s.origin)), match: (r, v) => r.origin === v },
          { label: 'Food', all: 'All foods', options: optionsOf(REG.suppliers.flatMap((s) => s.commodities), label), match: (r, v) => r.commodities.includes(v) || r.commodities.includes('all') },
        ]}
        columns={[
          { label: 'Name', cell: (r) => (<><b><ExtLink href={r.url}>{r.name}</ExtLink></b><span className="block text-[12px] text-muted">{r.ref}</span></>), csv: (r) => r.name },
          { label: 'Origin', cell: (r) => r.origin },
          { label: 'Role', cell: (r) => r.role },
          { label: 'Foods', cell: (r) => r.commodities.map(label).join(', '), csv: (r) => r.commodities.join(' ') },
          { label: 'Status', cell: (r) => (<><Pill tone={statusTone(r.status)}>{r.status}</Pill> <SourceLinks ids={r.src} /></>), csv: (r) => r.status },
        ]}
      />
    </Page>
  );
}

export function Compliance() {
  const { data, loading, error } = useDatasets('REG', 'TS');
  if (!data) return <DataState loading={loading} error={error} />;
  const { REG, TS } = data;
  const label = (c: string) => TS.comm[c]?.label ?? (c === 'all' ? 'All staples' : c);
  return (
    <Page kicker="Directory" title="Compliance" lead={`${REG.compliance.length} documents, permits and checks an importer needs in each market, with the authority that issues them and when they apply.`}>
      <RecordTable<ComplianceStep>
        name="compliance"
        rows={REG.compliance}
        suggest={(r) => ({ item: `compliance: ${r.country}, ${r.authority}` })}
        search={(r) => `${r.country} ${r.authority} ${r.document} ${r.when}`}
        filters={[
          { label: 'Country', all: 'All countries', options: optionsOf(REG.compliance.map((c) => c.country)), match: (r, v) => r.country === v },
          { label: 'Food', all: 'All foods', options: optionsOf(REG.compliance.flatMap((c) => c.commodities), label), match: (r, v) => r.commodities.includes(v) || r.commodities.includes('all') },
        ]}
        columns={[
          { label: 'Country', cell: (r) => <b>{r.country}</b>, csv: (r) => r.country },
          { label: 'Authority', cell: (r) => <ExtLink href={r.url}>{r.authority}</ExtLink>, csv: (r) => r.authority },
          { label: 'Document or step', cell: (r) => r.document },
          { label: 'When', cell: (r) => r.when },
          { label: 'Foods', cell: (r) => r.commodities.map(label).join(', '), csv: (r) => r.commodities.join(' ') },
          { label: 'Source', cell: (r) => <SourceLinks ids={r.src} />, csv: (r) => r.src },
        ]}
      />
    </Page>
  );
}

export function Events() {
  const { data, loading, error } = useDatasets('EVENTS', 'TS');
  if (!data) return <DataState loading={loading} error={error} />;
  const { EVENTS, TS } = data;
  const today = new Date().toISOString().slice(0, 10);
  const label = (c: string) => TS.comm[c]?.label ?? (c === 'all' ? 'All staples' : c);
  const rows = EVENTS.slice().sort((a, b) => a.k.localeCompare(b.k));
  return (
    <Page kicker="Directory" title="Events" lead={`${EVENTS.length} trade fairs, conferences and webinars for the food trade in and with Africa.`}>
      <RecordTable<EventRec>
        name="events"
        rows={rows}
        suggest={(r) => ({ item: `event: ${r.name} (${r.when})` })}
        search={(r) => `${r.name} ${r.city} ${r.country} ${r.org} ${r.why}`}
        filters={[
          { label: 'When', all: 'Upcoming and past', options: [['up', 'Upcoming'], ['past', 'Past']], match: (r, v) => (v === 'up' ? r.k >= today : r.k < today), initial: 'up' },
          { label: 'Scope', all: 'Any scope', options: optionsOf(EVENTS.map((e) => e.scope)), match: (r, v) => r.scope === v },
          { label: 'Food', all: 'All foods', options: optionsOf(EVENTS.flatMap((e) => e.staples), label), match: (r, v) => r.staples.includes(v) || r.staples.includes('all') },
        ]}
        columns={[
          { label: 'Date', cell: (r) => <span className="whitespace-nowrap">{r.when}</span>, csv: (r) => r.k },
          { label: 'Event', cell: (r) => (<><b><ExtLink href={r.url}>{r.name}</ExtLink></b><span className="block text-[12px] text-muted">{r.org}</span></>), csv: (r) => r.name },
          { label: 'Where', cell: (r) => [r.city, r.country].filter(Boolean).join(', ') },
          { label: 'Why it matters', cell: (r) => r.why },
          { label: 'Status', cell: (r) => (<><Pill tone={r.status === 'Confirmed' ? 'go' : 'watch'}>{r.status}</Pill> <SourceLinks ids={r.src} /></>), csv: (r) => r.status },
        ]}
      />
    </Page>
  );
}
