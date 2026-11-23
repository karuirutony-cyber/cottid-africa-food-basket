import { useMemo } from 'react';
import type { Call, Intervention, Policy } from '@afb/engines';
import { useDatasets } from '@/data/datasets';
import { optionsOf, RecordTable } from '@/components/RecordTable';
import { DataState, Kpi, KpiRow, Page, Pill, SourceLinks } from '@/components/ui';

function useLabels() {
  const { data } = useDatasets('TS');
  return {
    country: (c: string) => data?.TS.meta.markets[c] ?? c,
    food: (c: string) => (c === 'all' ? 'All foods' : data?.TS.comm[c]?.label ?? c),
  };
}
/** Programme coverage: a list of ISO2 codes, or "ALL" (every African country) or "SSA" (sub-Saharan Africa). */
const COVER: Record<string, string> = { ALL: 'All African countries', SSA: 'Sub-Saharan Africa' };
const countries = (ids: string[] | string, name: (c: string) => string) =>
  typeof ids === 'string' ? (COVER[ids] ?? ids) : ids.length > 6 ? `${ids.length} countries` : ids.map(name).join(', ');
/** Whether a programme covers a country; "SSA" excludes North Africa. */
const covers = (ids: string[] | string, mid: string, north: string[]) =>
  typeof ids === 'string' ? ids === 'ALL' || (ids === 'SSA' && !north.includes(mid)) : ids.includes(mid);
const codes = (ids: string[] | string) => (typeof ids === 'string' ? ids : ids.join(' '));
const statusTone = (s: string) => (/ongoing|in force|active|open/i.test(s) ? 'go' : /planned|pending|draft/i.test(s) ? 'watch' : 'neutral');

export function Agreements() {
  const { data, loading, error } = useDatasets('POL', 'TS');
  const L = useLabels();
  if (!data) return <DataState loading={loading} error={error} />;
  const { POL, TS } = data;
  return (
    <Page kicker="Policy and development" title="Policies and agreements" lead="CAADP, the continental free trade area, regional bloc tariffs and national rules that bear on each food in each country.">
      <RecordTable<Policy>
        name="agreements"
        rows={POL}
        search={(r) => `${r.name} ${r.body} ${r.kind} ${r.what}`}
        filters={[
          { label: 'Level', all: 'All levels', options: optionsOf(POL.map((p) => p.level)), match: (r, v) => r.level === v },
          { label: 'Country', all: 'All countries', options: optionsOf(Object.keys(TS.meta.markets), L.country), match: (r, v) => r.c.includes(v) },
          { label: 'Food', all: 'All foods', options: optionsOf(Object.keys(TS.comm), L.food), match: (r, v) => r.staples.includes(v) || r.staples.includes('all') },
        ]}
        columns={[
          { label: 'Policy or agreement', cell: (r) => (<><b>{r.name}</b><span className="block text-[12px] text-muted">{r.kind} · {r.body}</span></>), csv: (r) => r.name },
          { label: 'Level', cell: (r) => r.level },
          { label: 'Countries', cell: (r) => countries(r.c, L.country), csv: (r) => r.c.join(' ') },
          { label: 'Period', cell: (r) => r.period },
          { label: 'What it does', cell: (r) => r.what },
          { label: 'Status', cell: (r) => (<><Pill tone={statusTone(r.status)}>{r.status}</Pill> <SourceLinks ids={r.src} /></>), csv: (r) => r.status },
        ]}
      />
    </Page>
  );
}

export function Interventions() {
  const { data, loading, error } = useDatasets('PROG', 'DEVT', 'DEVF', 'TS');
  const L = useLabels();
  if (!data) return <DataState loading={loading} error={error} />;
  const { PROG, DEVT, DEVF, TS } = data;
  const type = (t: string) => DEVT.find((x) => x[0] === t)?.[1] ?? t;
  return (
    <Page kicker="Policy and development" title="Interventions" lead={`What would raise output of each food in each country, sorted by type: ${DEVT.map((t) => t[1].toLowerCase()).join(', ')}. ${PROG.length} programmes, with the funders behind them.`}>
      <KpiRow>
        <Kpi label="Programmes" value={String(PROG.length)} sub={`${PROG.filter((p) => p.st === 'Ongoing').length} ongoing`} />
        <Kpi label="Funders" value={String(new Set(PROG.map((p) => p.funder)).size)} />
        <Kpi label="Countries reached" value={String(new Set(PROG.flatMap((p) => p.c)).size)} />
        <Kpi label="Intervention types" value={String(DEVT.length)} />
      </KpiRow>
      <RecordTable<Intervention>
        name="interventions"
        rows={PROG}
        search={(r) => `${r.name} ${r.funder} ${r.what} ${r.scope}`}
        filters={[
          { label: 'Type', all: 'All types', options: DEVT.map(([k, l]) => [k, l]), match: (r, v) => r.types.includes(v) },
          { label: 'Country', all: 'All countries', options: optionsOf(Object.keys(TS.meta.markets), L.country), match: (r, v) => covers(r.c, v, TS.meta.regions.North ?? []) },
          { label: 'Food', all: 'All foods', options: optionsOf(Object.keys(TS.comm), L.food), match: (r, v) => r.staples.includes(v) || r.staples.includes('all') },
          { label: 'Status', all: 'Any status', options: optionsOf(PROG.map((p) => p.st)), match: (r, v) => r.st === v },
        ]}
        columns={[
          { label: 'Programme', cell: (r) => (<><b>{r.name}</b><span className="block text-[12px] text-muted">{r.funder} · {r.ft.map((f) => DEVF[f] ?? f).join(', ')}</span></>), csv: (r) => r.name },
          { label: 'Types', cell: (r) => r.types.map(type).join(', ') },
          { label: 'Where', cell: (r) => (<>{countries(r.c, L.country)}<span className="block text-[12px] text-muted">{r.scope}</span></>), csv: (r) => codes(r.c) },
          { label: 'Foods', cell: (r) => r.staples.map(L.food).join(', ') },
          { label: 'Amount and period', cell: (r) => (<>{r.amount}<span className="block text-[12px] text-muted">{r.period}</span></>), csv: (r) => `${r.amount}; ${r.period}` },
          { label: 'What it does', cell: (r) => r.what },
          { label: 'Status', cell: (r) => (<><Pill tone={statusTone(r.st)}>{r.st}</Pill> <SourceLinks ids={r.src} /></>), csv: (r) => r.st },
        ]}
      />
    </Page>
  );
}

export function Funders() {
  const { data, loading, error } = useDatasets('PROG', 'DEVF', 'DEVT', 'TS');
  const L = useLabels();
  const rows = useMemo(() => {
    if (!data) return [];
    const by = new Map<string, Intervention[]>();
    for (const p of data.PROG) by.set(p.funder, [...(by.get(p.funder) ?? []), p]);
    return [...by.entries()].map(([funder, list]) => ({
      funder,
      ft: [...new Set(list.flatMap((p) => p.ft))],
      n: list.length,
      ongoing: list.filter((p) => p.st === 'Ongoing').length,
      c: [...new Set(list.flatMap((p) => (typeof p.c === 'string' ? Object.keys(data.TS.meta.markets).filter((m) => covers(p.c, m, data.TS.meta.regions.North ?? [])) : p.c)))],
      types: [...new Set(list.flatMap((p) => p.types))],
      staples: [...new Set(list.flatMap((p) => p.staples))],
      progs: list.map((p) => p.name),
      src: [...new Set(list.map((p) => p.src))],
    }));
  }, [data]);
  if (!data) return <DataState loading={loading} error={error} />;
  const { DEVF, DEVT, TS } = data;
  type R = (typeof rows)[number];
  return (
    <Page kicker="Policy and development" title="Funders" lead="Development banks, agencies, governments, foundations and private funders behind programmes that raise food output in Africa.">
      <RecordTable<R>
        name="funders"
        rows={rows.sort((a, b) => b.n - a.n)}
        search={(r) => `${r.funder} ${r.progs.join(' ')}`}
        filters={[
          { label: 'Funder type', all: 'All types', options: Object.entries(DEVF), match: (r, v) => r.ft.includes(v) },
          { label: 'Country', all: 'All countries', options: optionsOf(Object.keys(TS.meta.markets), L.country), match: (r, v) => r.c.includes(v) },
          { label: 'Intervention', all: 'All interventions', options: DEVT.map(([k, l]) => [k, l]), match: (r, v) => r.types.includes(v) },
        ]}
        columns={[
          { label: 'Funder', cell: (r) => (<><b>{r.funder}</b><span className="block text-[12px] text-muted">{r.ft.map((f) => DEVF[f] ?? f).join(', ')}</span></>), csv: (r) => r.funder },
          { label: 'Programmes', className: 'n', cell: (r) => `${r.n} (${r.ongoing} ongoing)`, csv: (r) => r.n },
          { label: 'Countries', cell: (r) => countries(r.c, L.country), csv: (r) => r.c.join(' ') },
          { label: 'What they fund', cell: (r) => r.types.map((t) => DEVT.find((x) => x[0] === t)?.[1] ?? t).join(', ') },
          { label: 'Programme names', cell: (r) => (<>{r.progs.join('; ')} <SourceLinks ids={r.src} /></>), csv: (r) => r.progs.join('; ') },
        ]}
      />
    </Page>
  );
}

export function Calls() {
  const { data, loading, error } = useDatasets('CALLS', 'DEVT', 'TS');
  const L = useLabels();
  if (!data) return <DataState loading={loading} error={error} />;
  const { CALLS, DEVT, TS } = data;
  const today = new Date().toISOString().slice(0, 10);
  const days = (dl: string) => Math.ceil((new Date(dl).getTime() - new Date(today).getTime()) / 86400000);
  const rows = CALLS.slice().sort((a, b) => a.dl.localeCompare(b.dl));
  return (
    <Page kicker="Policy and development" title="Calls for proposals" lead="Open calls for grants, finance and technical support for food production, with who can apply and the deadline.">
      <RecordTable<Call>
        name="calls"
        rows={rows}
        search={(r) => `${r.name} ${r.funder} ${r.who} ${r.note}`}
        filters={[
          { label: 'Deadline', all: 'Open and closed', options: [['open', 'Still open'], ['closed', 'Closed']], match: (r, v) => (v === 'open' ? r.dl >= today : r.dl < today), initial: 'open' },
          { label: 'Country', all: 'All countries', options: optionsOf(Object.keys(TS.meta.markets), L.country), match: (r, v) => r.c.includes(v) || r.c.length === 0 },
          { label: 'Type', all: 'All types', options: DEVT.map(([k, l]) => [k, l]), match: (r, v) => r.types.includes(v) },
        ]}
        columns={[
          { label: 'Deadline', cell: (r) => (<span className="whitespace-nowrap"><b>{r.dl}</b><span className="block text-[12px] text-muted">{days(r.dl) >= 0 ? `${days(r.dl)} days left` : 'closed'}</span></span>), csv: (r) => r.dl },
          { label: 'Call', cell: (r) => (<><b>{r.name}</b><span className="block text-[12px] text-muted">{r.funder}</span></>), csv: (r) => `${r.name} (${r.funder})` },
          { label: 'Who can apply', cell: (r) => r.who },
          { label: 'Where', cell: (r) => (r.c.length ? countries(r.c, L.country) : 'Any African country'), csv: (r) => r.c.join(' ') },
          { label: 'Amount', cell: (r) => r.amount },
          { label: 'Notes', cell: (r) => (<>{r.note} <SourceLinks ids={r.src} /></>), csv: (r) => r.note },
        ]}
      />
    </Page>
  );
}
