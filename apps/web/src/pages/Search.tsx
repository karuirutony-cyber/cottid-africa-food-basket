/* Global search across the platform's records and pages. Builds a small index from the published
 * datasets (loaded on first use, then cached) and matches every word of the query, accents ignored. */
import { useMemo, useState, useEffect, useRef, useId } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDatasets } from '@/data/datasets';
import { SECTIONS } from '@/sections';
import { Page } from '@/components/ui';

interface Hit {
  type: string;
  title: string;
  sub: string;
  href: string;
  text: string; // normalised haystack
}

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const q = (s: string) => encodeURIComponent(s);
const GROUP_ORDER = ['pages', 'countries', 'foods', 'buyers', 'suppliers', 'compliance', 'events', 'policies', 'interventions', 'calls', 'sources'];
const PER_GROUP = 8;

export default function Search() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const inputId = useId();
  const ref = useRef<HTMLInputElement>(null);
  const { data, loading } = useDatasets('summary', 'REG', 'SRC', 'EVENTS', 'POL', 'PROG', 'CALLS');

  useEffect(() => ref.current?.focus(), []);
  // Keep the query in the address (shareable, survives reload). Updated on each change, never later:
  // a delayed update could fire after a result was clicked and pull the visitor back here.
  const change = (v: string) => {
    setQuery(v);
    setParams(v ? { q: v } : {}, { replace: true });
  };

  const index = useMemo<Hit[]>(() => {
    const hits: Hit[] = [];
    const add = (type: string, title: string, sub: string, href: string, extra = '') => hits.push({ type, title, sub, href, text: norm(`${title} ${sub} ${extra}`) });
    for (const s of SECTIONS) {
      if (s.id !== 'home') add('pages', t(`section.${s.id}`), '', s.path);
      for (const p of s.pages) add('pages', t(`page.${p.key}`), t(`section.${s.id}`), p.path);
    }
    if (!data) return hits;
    const S = data.summary;
    const regionOf = (id: string) => Object.entries(S.regions).find(([, ids]) => ids.includes(id))?.[0] ?? '';
    for (const [id, name] of Object.entries(S.markets)) add('countries', name, `${regionOf(id)} Africa · ${id}`, `/countries/${id}`);
    const groupName = Object.fromEntries(S.foodGroups);
    for (const [id, f] of Object.entries(S.foods)) add('foods', f.label, groupName[f.fg] ?? '', `/analytics/projections?f=${id}`, id);
    for (const b of data.REG.buyers) add('buyers', b.name, `${b.city}, ${b.country} · ${b.type}`, `/directory/buyers?q=${q(b.name)}`, `${b.segment} ${b.ref}`);
    for (const s of data.REG.suppliers) add('suppliers', s.name, `${s.origin} · ${s.role}`, `/directory/sellers?q=${q(s.name)}`, s.ref);
    for (const c of data.REG.compliance) add('compliance', c.document, `${c.country} · ${c.authority}`, `/directory/compliance?q=${q(`${c.country} ${c.authority}`)}`);
    for (const e of data.EVENTS) add('events', e.name, `${e.when} · ${[e.city, e.country].filter(Boolean).join(', ')}`, `/directory/events?q=${q(e.name)}`, e.org);
    for (const p of data.POL) add('policies', p.name, `${p.body} · ${p.period}`, `/policy/agreements?q=${q(p.name)}`, p.kind);
    for (const p of data.PROG) add('interventions', p.name, p.funder, `/policy/interventions?q=${q(p.name)}`, p.what);
    for (const c of data.CALLS) add('calls', c.name, `${c.funder} · ${c.dl}`, `/policy/calls?q=${q(c.name)}`, c.who);
    for (const s of data.SRC) add('sources', `${s.id}: ${s.title}`, s.date, `/data/sources#${s.id}`, s.url);
    return hits;
  }, [data, t]);

  const groups = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const matched = index.filter((h) => words.every((w) => h.text.includes(w)));
    // Titles that start with the query first.
    const first = norm(query).trim();
    matched.sort((a, b) => Number(!norm(a.title).startsWith(first)) - Number(!norm(b.title).startsWith(first)));
    return GROUP_ORDER.map((g) => ({ g, all: matched.filter((h) => h.type === g) })).filter((x) => x.all.length);
  }, [index, query]);
  const total = groups.reduce((a, x) => a + x.all.length, 0);

  return (
    <Page kicker={t('search.kicker')} title={t('search.title')} lead={t('search.lead')}>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="card">
        <label htmlFor={inputId} className="grid gap-1 text-[13px] font-semibold text-muted">
          {t('search.label')}
          <input
            ref={ref}
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => change(e.target.value)}
            placeholder={t('search.placeholder')}
            autoComplete="off"
            className="min-h-[48px] rounded-xl border border-line bg-surface px-4 text-[17px] text-ink"
          />
        </label>
        <p className="m-0 mt-2 text-[12.5px] text-muted">{t('search.shortcut')}</p>
      </form>
      <p role="status" aria-live="polite" className="m-0 text-[14px] text-muted">
        {query.trim() ? (loading && !data ? t('status.loading') : t('search.count', { n: total })) : ''}
      </p>
      {query.trim() && !loading && total === 0 && <p className="m-0">{t('search.none')}</p>}
      {groups.map(({ g, all }) => (
        <section key={g} className="card" aria-labelledby={`sg-${g}`}>
          <h2 id={`sg-${g}`} className="m-0 mb-2 font-body text-[15px] font-bold">
            {t(`search.group.${g}`)} <span className="font-normal text-muted">({all.length})</span>
          </h2>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {all.slice(0, PER_GROUP).map((h) => (
              <li key={h.href + h.title}>
                <Link to={h.href} className="font-semibold">
                  {h.title}
                </Link>
                {h.sub && <span className="block text-[13px] text-muted">{h.sub}</span>}
              </li>
            ))}
          </ul>
          {all.length > PER_GROUP && <p className="m-0 mt-2 text-[13px] text-muted">{t('search.more', { n: all.length - PER_GROUP })}</p>}
        </section>
      ))}
    </Page>
  );
}
