/* Admin console, continued: datasets, ingest, users, organisations, settings and record editing.
 * Every action goes through a Cloud Function that re-checks the role and second factor and audits. */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { call, callMessage } from '@/lib/call';
import { Card, Page, Pill } from '@/components/ui';

const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('en-GB') : '–');

function useCall<T>(name: string, data: unknown = {}) {
  const [value, setValue] = useState<T | null>(null);
  const [err, setErr] = useState('');
  const key = JSON.stringify(data);
  const load = useCallback(() => {
    setErr('');
    call<T>(name, JSON.parse(key)).then(setValue, (e) => setErr(callMessage(e)));
  }, [name, key]);
  useEffect(load, [load]);
  return { value, err, setErr, load };
}

function Msg({ ok, err }: { ok?: string; err?: string }) {
  return (
    <>
      {ok && (
        <p role="status" className="m-0 rounded-lg bg-[#e3f1e7] px-3 py-2 text-[#1d5e36]">
          {ok}
        </p>
      )}
      {err && (
        <p role="alert" className="m-0 rounded-lg bg-[#fde8dc] px-3 py-2 text-[#8f1f0d]">
          {err}
        </p>
      )}
    </>
  );
}

interface DatasetRow {
  version: string;
  status: string;
  checksPassed: boolean;
  checks: { name: string; value: string | number; expected: string | number; passed: boolean }[];
  origin: string;
  previous: string | null;
  builtAt: string | null;
  publishedAt: string | null;
}

export function Datasets() {
  const { value, err, setErr, load } = useCall<{ live: string | null; items: DatasetRow[] }>('listDatasets');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState('');
  const act = async (label: string, name: string, data: unknown, done: (r: Record<string, unknown>) => string) => {
    setOk('');
    setErr('');
    setBusy(label);
    try {
      const r = await call<Record<string, unknown>>(name, data);
      setOk(done(r));
      load();
    } catch (e) {
      setErr(callMessage(e));
    } finally {
      setBusy('');
    }
  };
  const tone = (s: string) => (s === 'published' ? 'go' : s === 'failed_checks' || s === 'rolled_back' ? 'no' : s === 'built' ? 'neutral' : 'watch');
  return (
    <Page
      kicker="Admin"
      title="Datasets"
      lead="Build a version from the published data (it is snapshotted and checked), publish it to the database, or roll back to the version that was live before. Only versions that pass every check can be published."
      actions={
        <>
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void act('build', 'buildDataset', {}, (r) => `Built ${r.version}: ${r.passed ? 'all checks passed' : 'some checks failed'}.`)}>
            {busy === 'build' ? 'Building…' : 'Build a new version'}
          </button>
          <button type="button" className="btn" disabled={!!busy || !value?.live} onClick={() => void act('rollback', 'rollbackDataset', {}, (r) => `Rolled back: ${r.version} is live again.`)}>
            {busy === 'rollback' ? 'Rolling back…' : 'Roll back'}
          </button>
        </>
      }
    >
      <Msg ok={ok} err={err} />
      <Card>
        <p className="m-0">
          Live version: <b className="font-mono" data-testid="live-version">{value?.live ?? 'none yet'}</b>
        </p>
      </Card>
      {(value?.items ?? []).map((d) => (
        <Card key={d.version}>
          <div className="flex flex-wrap items-center gap-2">
            <b className="font-mono text-[14px]">{d.version}</b>
            <Pill tone={tone(d.status)}>{d.status.replace('_', ' ')}</Pill>
            {d.version === value?.live && <Pill tone="go">live</Pill>}
            <span className="text-[12.5px] text-muted">
              built {when(d.builtAt)} ({d.origin}){d.publishedAt ? ` · published ${when(d.publishedAt)}` : ''}
              {d.previous ? ` · previous ${d.previous}` : ''}
            </span>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-[13px] font-semibold">
              Checks: {d.checks?.filter((c) => c.passed).length ?? 0} of {d.checks?.length ?? 0} passed
            </summary>
            <ul className="m-0 mt-1 grid gap-0.5 ps-5 text-[13px]">
              {d.checks?.map((c) => (
                <li key={c.name} className={c.passed ? '' : 'font-semibold text-[#8f1f0d]'}>
                  {c.passed ? '✓' : '✗'} {c.name}: {String(c.value)} {c.passed ? '' : `(expected ${c.expected})`}
                </li>
              ))}
            </ul>
          </details>
          {d.checksPassed && d.version !== value?.live && (
            <button type="button" className="btn btn-primary mt-3" disabled={!!busy} onClick={() => void act(d.version, 'publishDataset', { version: d.version }, (r) => `Published ${r.version}. Previous: ${r.previous ?? 'none'}.`)}>
              {busy === d.version ? 'Publishing…' : 'Publish this version'}
            </button>
          )}
        </Card>
      ))}
    </Page>
  );
}

interface IngestRun {
  id: string;
  status: string;
  sources?: string[];
  changedCount?: number;
  changed?: { iso2: string; year: string; published: number | null; latest: number }[];
  log?: string[];
  startedAt: string | null;
  finishedAt: string | null;
}

export function Ingest() {
  const { value, err, setErr, load } = useCall<{ items: IngestRun[] }>('listIngestRuns');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await call<{ changed?: number; error?: string }>('runIngest');
      setOk(r.error ? `Run finished with an error: ${r.error}` : `Run finished: ${r.changed} values differ from the published dataset.`);
      load();
    } catch (e) {
      setErr(callMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page
      kicker="Admin"
      title="Ingest runs"
      lead="Every Monday at 03:00 (Nairobi) the ingest compares the latest official figures with the published dataset and lists the differences for a data steward. It never publishes by itself. Sources so far: World Bank WDI population; FAOSTAT, UN WPP and UN Comtrade follow."
      actions={
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run()}>
          {busy ? 'Running…' : 'Run now'}
        </button>
      }
    >
      <Msg ok={ok} err={err} />
      {(value?.items ?? []).length === 0 && <Card><p className="m-0 text-muted">No runs yet.</p></Card>}
      {(value?.items ?? []).map((r) => (
        <Card key={r.id}>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={r.status === 'ok' ? 'go' : r.status === 'failed' ? 'no' : 'watch'}>{r.status}</Pill>
            <span className="text-[13px]">{when(r.startedAt)}</span>
            <span className="text-[13px] text-muted">{r.sources?.join(', ')}</span>
            {r.changedCount != null && <span className="text-[13px]">{r.changedCount} differences</span>}
          </div>
          {r.log && <p className="m-0 mt-1 text-[13px] text-muted">{r.log.join(' ')}</p>}
          {r.changed && r.changed.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[13px] font-semibold">Differences</summary>
              <ul className="m-0 mt-1 grid gap-0.5 ps-5 text-[13px]">
                {r.changed.slice(0, 60).map((c) => (
                  <li key={c.iso2 + c.year}>
                    {c.iso2} {c.year}: published {c.published ?? '–'} m, latest {c.latest} m
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      ))}
    </Page>
  );
}

const ROLES = ['member', 'contributor', 'verifier', 'content_editor', 'data_steward', 'platform_admin', 'super_admin'];

export function Users() {
  const { value, err, setErr, load } = useCall<{ items: { uid: string; name: string; email: string; role: string; org: string | null; lastSeen: string | null }[] }>('adminListUsers');
  const [ok, setOk] = useState('');
  const [q, setQ] = useState('');
  const auth = useAuth();
  const setRole = async (uid: string, role: string) => {
    setErr('');
    try {
      await call('setUserRole', { uid, role });
      setOk('Role changed. It reaches their sign-in within a minute (or when they sign in again).');
      load();
    } catch (e) {
      setErr(callMessage(e));
    }
  };
  const rows = (value?.items ?? []).filter((u) => !q || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page kicker="Admin" title="Users" lead="Everyone with an account, and their platform role. Staff roles (verifier and above) must turn on two-step verification before staff actions work.">
      <Msg ok={ok} err={err} />
      <Card>
        <label className="grid max-w-sm gap-1 text-[13px] font-semibold text-muted">
          Search
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-[40px] rounded-lg border border-line bg-surface px-3" />
        </label>
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x mt-3">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>E-mail</th>
                <th>Role</th>
                <th>Organisation</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.uid}>
                  <td>{u.name || '–'}</td>
                  <td>{u.email}</td>
                  <td>
                    <select aria-label={`Role for ${u.email}`} value={u.role} disabled={u.uid === auth.user?.uid} onChange={(e) => void setRole(u.uid, e.target.value)} className="min-h-[36px] rounded-lg border border-line bg-surface px-2">
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="font-mono text-[12px]">{u.org ?? '–'}</td>
                  <td className="whitespace-nowrap">{when(u.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}

export function Organisations() {
  const { value, err } = useCall<{ items: { id: string; name: string; plan: string; memberCount: number | null; createdAt: string | null }[] }>('adminListOrgs');
  return (
    <Page kicker="Admin" title="Organisations" lead="Every organisation workspace on the platform.">
      <Msg err={err} />
      <Card>
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Plan</th>
                <th className="n">Members</th>
                <th>Created</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {(value?.items ?? []).map((o) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>{o.plan}</td>
                  <td className="n">{o.memberCount ?? '–'}</td>
                  <td>{when(o.createdAt)}</td>
                  <td className="font-mono text-[12px]">{o.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {value && value.items.length === 0 && <p className="m-0 mt-2 text-muted">No organisations yet.</p>}
      </Card>
    </Page>
  );
}

interface PlatformSettings {
  features: Record<string, boolean>;
  apiQuotas: Record<string, number>;
  maintenance: boolean;
}

export function Settings() {
  const [s, setS] = useState<PlatformSettings | null>(null);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    void (async () => {
      const { getFirebase } = await import('@/lib/firebase');
      const { db } = await getFirebase();
      const { doc, getDoc } = await import('firebase/firestore');
      setS(((await getDoc(doc(db, 'settings/platform'))).data() as PlatformSettings) ?? null);
    })();
  }, []);
  const save = async () => {
    if (!s) return;
    setErr('');
    try {
      await call('updateSettings', { features: s.features, apiQuotas: s.apiQuotas, maintenance: s.maintenance });
      setOk('Settings saved.');
    } catch (e) {
      setErr(callMessage(e));
    }
  };
  const runAlerts = async () => {
    setErr('');
    try {
      const r = await call<{ rules: number; fired: number; emails: number }>('runAlertsNow');
      setOk(`Alerts checked: ${r.rules} rules, ${r.fired} new notifications, ${r.emails} e-mails queued.`);
    } catch (e) {
      setErr(callMessage(e));
    }
  };
  return (
    <Page kicker="Admin" title="Platform settings" actions={<button type="button" className="btn" onClick={() => void runAlerts()}>Run alerts now</button>}>
      <Msg ok={ok} err={err} />
      {s && (
        <>
          <Card title="Features">
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.keys(s.features ?? {}).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" checked={!!s.features[k]} onChange={(e) => setS({ ...s, features: { ...s.features, [k]: e.target.checked } })} className="h-4 w-4" />
                  {k}
                </label>
              ))}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!s.maintenance} onChange={(e) => setS({ ...s, maintenance: e.target.checked })} className="h-4 w-4" />
                maintenance mode
              </label>
            </div>
          </Card>
          <Card title="API quotas (requests a day per key)">
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.keys(s.apiQuotas ?? {}).map((k) => (
                <label key={k} className="grid gap-1 text-[13px] font-semibold text-muted">
                  {k}
                  <input type="number" min={0} value={s.apiQuotas[k]} onChange={(e) => setS({ ...s, apiQuotas: { ...s.apiQuotas, [k]: Number(e.target.value) } })} className="min-h-[40px] rounded-lg border border-line bg-surface px-2" />
                </label>
              ))}
            </div>
          </Card>
          <button type="button" className="btn btn-primary justify-self-start" onClick={() => void save()}>
            Save settings
          </button>
        </>
      )}
    </Page>
  );
}

const PRESETS: Record<string, string[]> = {
  directory: ['buyers', 'suppliers', 'compliance', 'events'],
  content: ['calls', 'policies', 'interventions', 'funders'],
  prices: ['prices', 'fx', 'rateCards'],
  duties: ['duties'],
  sources: ['sources'],
};
const TITLES: Record<string, string> = { directory: 'Directory records', content: 'Policy and development content', prices: 'Prices, exchange rates and rate cards', duties: 'Duties', sources: 'Sources' };

/** Browse and correct records directly (data stewards). Text and number fields only; every change audited. */
export function Records({ preset }: { preset: keyof typeof PRESETS }) {
  const colls = PRESETS[preset]!;
  const [coll, setColl] = useState(colls[0]!);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { value, err, setErr, load } = useCall<{ items: { id: string; data: Record<string, unknown> }[] }>('adminList', { collection: coll, limit: 50, ...(query ? { q: query } : {}) });
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [ok, setOk] = useState('');
  const editable = (d: Record<string, unknown>) => Object.entries(d).filter(([k, v]) => (typeof v === 'string' || typeof v === 'number') && !['ref', 'id', 'src'].includes(k) && !k.startsWith('_'));
  const save = async (id: string, data: Record<string, unknown>) => {
    const patch: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(draft)) if (String(data[k]) !== v) patch[k] = typeof data[k] === 'number' ? Number(v) : v;
    if (!Object.keys(patch).length) return setErr('Nothing changed.');
    try {
      await call('adminUpdate', { path: `${coll}/${id}`, patch, reason });
      setOk(`Saved ${coll}/${id}.`);
      setOpen(null);
      load();
    } catch (e) {
      setErr(callMessage(e));
    }
  };
  return (
    <Page kicker="Admin" title={TITLES[preset]!} lead="Correct a record directly. Changes go live in the directory at once and are written to the audit log with your reason. For changes suggested by users, use the review queue.">
      <Msg ok={ok} err={err} />
      <Card>
        <div className="flex flex-wrap items-end gap-2">
          {colls.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Collection">
              {colls.map((c) => (
                <button key={c} type="button" aria-pressed={coll === c} onClick={() => setColl(c)} className={`rounded-full border px-3 py-1.5 text-[13.5px] font-semibold ${coll === c ? 'border-sec-ink bg-sec-ink text-white' : 'border-line bg-surface'}`}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <form className="ms-auto flex gap-2" onSubmit={(e) => (e.preventDefault(), setQuery(q.trim()))}>
            <label className="sr-only" htmlFor="rec-q">Search records</label>
            <input id="rec-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="min-h-[40px] rounded-lg border border-line bg-surface px-3" />
            <button className="btn">Search</button>
          </form>
        </div>
      </Card>
      {(value?.items ?? []).map(({ id, data }) => (
        <Card key={id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <b className="font-mono text-[13px]">{id}</b> <span className="text-muted">{String(data.name ?? data.title ?? data.commodity ?? data.country ?? '')}</span>
            </span>
            <button
              type="button"
              className="btn min-h-[34px] py-1 text-[13px]"
              onClick={() => {
                setOpen(open === id ? null : id);
                setDraft(Object.fromEntries(editable(data).map(([k, v]) => [k, String(v)])));
                setReason('');
              }}
            >
              {open === id ? 'Close' : 'Edit'}
            </button>
          </div>
          {open === id && (
            <div className="mt-3 grid gap-2">
              {editable(data).map(([k]) => (
                <label key={k} className="grid gap-1 text-[12.5px] font-semibold text-muted sm:grid-cols-[10rem_1fr] sm:items-center">
                  {k}
                  <input value={draft[k] ?? ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="min-h-[38px] rounded-lg border border-line bg-surface px-2 text-[14px] text-ink" />
                </label>
              ))}
              <label className="grid gap-1 text-[12.5px] font-semibold text-muted">
                Reason for the change (kept in the audit log)
                <input value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[38px] rounded-lg border border-line bg-surface px-2 text-[14px] text-ink" />
              </label>
              <button type="button" className="btn btn-primary justify-self-start" disabled={reason.trim().length < 5} onClick={() => void save(id, data)}>
                Save and publish
              </button>
            </div>
          )}
        </Card>
      ))}
    </Page>
  );
}
