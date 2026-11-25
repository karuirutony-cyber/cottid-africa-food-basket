/* Staff console (verifier and above, with two-step). Reads and writes go through Cloud Functions,
 * which check the role and second factor again and write the audit log. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { callMessage, type Submission } from '@/lib/call';
import { serverCall } from '@/lib/serverless';
import { Card, Kpi, KpiRow, Page, Pill } from '@/components/ui';
import { statusTone } from '@/pages/contribute/Contribute';

const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-GB') : '–');

interface Stats {
  pending: number;
  approved: number;
  published: number;
  rejected: number;
  users: number;
  dataset: { version: string; built: string; seeded: string } | null;
}

export function Dashboard() {
  const auth = useAuth();
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    serverCall<Stats>('adminStats').then(setS, (e) => setErr(callMessage(e)));
  }, []);
  const links: [string, string, boolean][] = [
    ['/admin/review', 'Review queue', auth.can('verifier')],
    ['/admin/audit', 'Audit log', auth.can('platform_admin')],
    ['/admin/datasets', 'Datasets', auth.can('data_steward')],
    ['/admin/users', 'Users', auth.can('platform_admin')],
    ['/admin/sources', 'Sources', auth.can('data_steward')],
    ['/admin/settings', 'Platform settings', auth.can('platform_admin')],
  ];
  return (
    <Page kicker="Admin" title="Admin dashboard" lead={`Signed in as ${auth.user?.email ?? ''} (${auth.role.replace('_', ' ')}).`}>
      {err && <p role="alert" className="m-0 text-[#8f1f0d]">{err}</p>}
      <KpiRow>
        <Kpi label="Waiting for review" value={s ? String(s.pending) : '–'} />
        <Kpi label="Approved, to publish" value={s ? String(s.approved) : '–'} />
        <Kpi label="Published" value={s ? String(s.published) : '–'} />
        <Kpi label="Not accepted" value={s ? String(s.rejected) : '–'} />
        <Kpi label="Accounts" value={s ? String(s.users) : '–'} />
      </KpiRow>
      <Card title="Dataset">
        <p className="m-0">{s?.dataset ? `Version ${s.dataset.version}, built ${s.dataset.built}, seeded ${s.dataset.seeded}.` : 'Not seeded yet: run pnpm seed or the bootstrap function.'}</p>
      </Card>
      <Card title="Work areas">
        <ul className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2">
          {links.filter((l) => l[2]).map(([to, label]) => (
            <li key={to}>
              <Link to={to}>{label}</Link>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}

function PublishForm({ sub, onDone }: { sub: Submission; onDone: () => void }) {
  const [target, setTarget] = useState(sub.target.includes('/') ? sub.target : '');
  const [rows, setRows] = useState<[string, string][]>(Object.entries(sub.patch ?? {}));
  const [current, setCurrent] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!/^[a-zA-Z]+\/[\w.-]+$/.test(target)) {
      setCurrent(null);
      return;
    }
    serverCall<{ exists: boolean; data: Record<string, unknown> | null }>('getRecord', { path: target }).then(
      (r) => setCurrent(r.exists ? r.data : null),
      () => setCurrent(null),
    );
  }, [target]);
  const publish = async () => {
    setErr('');
    setBusy(true);
    try {
      await serverCall('publishRecord', { id: sub.id, target, patch: Object.fromEntries(rows.filter(([k, v]) => k && v)) });
      onDone();
    } catch (e) {
      setErr(callMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-line p-3">
      <label className="grid gap-1 text-[13px] font-semibold text-muted">
        Record to change (collection/id)
        <input value={target} onChange={(e) => setTarget(e.target.value)} className="min-h-[40px] rounded-lg border border-line bg-surface px-2 font-mono text-[14px]" />
      </label>
      {current && (
        <details>
          <summary className="cursor-pointer text-[13px] font-semibold">Current record</summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-[#f7efe3] p-2 text-[12px]">{JSON.stringify(current, null, 2)}</pre>
        </details>
      )}
      {rows.map(([k, v], i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
          <input aria-label="Field" value={k} onChange={(e) => setRows(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} className="min-h-[40px] rounded-lg border border-line bg-surface px-2" />
          <input aria-label={`New value for ${k}`} value={v} onChange={(e) => setRows(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} className="min-h-[40px] rounded-lg border border-line bg-surface px-2" />
          <span className="self-center text-[12px] text-muted">was: {current ? String(current[k] ?? '—') : '…'}</span>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => setRows([...rows, ['', '']])}>
          Add a field
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || !rows.some(([k, v]) => k && v)} onClick={() => void publish()}>
          Publish to the record
        </button>
      </div>
      {err && <p role="alert" className="m-0 text-[#8f1f0d]">{err}</p>}
    </div>
  );
}

export function ReviewQueue() {
  const auth = useAuth();
  const [status, setStatus] = useState<Submission['status']>('pending');
  const [items, setItems] = useState<Submission[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const load = useCallback(() => {
    setItems(null);
    serverCall<{ items: Submission[] }>('reviewQueue', { status }).then((r) => setItems(r.items), (e) => {
      setMsg(callMessage(e));
      setItems([]);
    });
  }, [status]);
  useEffect(load, [load]);
  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      await serverCall('review', { id, decision, note: notes[id] ?? '' });
      setMsg(decision === 'approved' ? 'Approved. A data steward can now publish it.' : 'Marked as not accepted.');
      load();
    } catch (e) {
      setMsg(callMessage(e));
    }
  };
  return (
    <Page kicker="Admin" title="Review queue" lead="Suggestions from users. Verifiers approve or reject; data stewards publish approved changes to the record. Every decision is written to the audit log.">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
        {(['pending', 'approved', 'published', 'rejected'] as const).map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1.5 text-[13.5px] font-semibold ${status === s ? 'border-sec-ink bg-sec-ink text-white' : 'border-line bg-surface'}`}>
            {s[0]!.toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {msg && (
        <p role="status" className="m-0 rounded-lg bg-[#f4f8fd] px-3 py-2">
          {msg}
        </p>
      )}
      {items == null ? (
        <p className="text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <Card>
          <p className="m-0">Nothing {status} right now.</p>
        </Card>
      ) : (
        items.map((s) => (
          <Card key={s.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={statusTone(s.status)}>{s.status}</Pill>
              <b className="font-mono text-[13.5px]">{s.target}</b>
              {s.item && <span className="text-muted">· {s.item}</span>}
              <span className="text-[12.5px] text-muted">
                · {s.email ?? s.uid} · {when(s.createdAt)}
              </span>
            </div>
            <p className="m-0 mt-2 whitespace-pre-wrap">{s.text}</p>
            <p className="m-0 mt-1 text-[13px] text-muted">
              {s.page && (
                <>
                  Page: <Link to={s.page}>{s.page}</Link>.{' '}
                </>
              )}
              {s.sourceUrl && (
                <>
                  Source:{' '}
                  <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {s.sourceUrl}
                  </a>
                </>
              )}
            </p>
            {s.patch && <p className="m-0 mt-1 text-[13px]">Proposed: {Object.entries(s.patch).map(([k, v]) => `${k} = “${v}”`).join('; ')}</p>}
            {s.note && <p className="m-0 mt-1 text-[13px] text-muted">Reviewer’s note: {s.note}</p>}
            {s.status === 'pending' && (
              <div className="mt-3 grid gap-2">
                <label className="grid gap-1 text-[13px] font-semibold text-muted">
                  Note to the contributor (optional)
                  <input value={notes[s.id] ?? ''} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} className="min-h-[40px] rounded-lg border border-line bg-surface px-2" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" onClick={() => void decide(s.id, 'approved')}>
                    Approve
                  </button>
                  <button type="button" className="btn" onClick={() => void decide(s.id, 'rejected')}>
                    Reject
                  </button>
                </div>
              </div>
            )}
            {s.status === 'approved' &&
              (auth.can('data_steward') ? (
                <PublishForm sub={s} onDone={() => {
                  setMsg('Published. The record is updated and the change is in the audit log.');
                  load();
                }} />
              ) : (
                <p className="m-0 mt-2 text-[13px] text-muted">Waiting for a data steward to publish.</p>
              ))}
            {s.status === 'published' && s.publishedPatch && (
              <p className="m-0 mt-1 text-[13px]">
                Published {when(s.publishedAt)}: {Object.entries(s.publishedPatch).map(([k, v]) => `${k} = “${v}”`).join('; ')}
              </p>
            )}
          </Card>
        ))
      )}
    </Page>
  );
}

interface AuditRow {
  id: string;
  actor: string;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
  time: string | null;
}

export function AuditLog() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    serverCall<{ items: AuditRow[] }>('auditList', { limit: 200 }).then((r) => setRows(r.items), (e) => {
      setErr(callMessage(e));
      setRows([]);
    });
  }, []);
  return (
    <Page kicker="Admin" title="Audit log" lead="Every staff action: who, what, which record, and the values before and after.">
      {err && <p role="alert" className="m-0 text-[#8f1f0d]">{err}</p>}
      <Card>
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{when(r.time)}</td>
                  <td className="font-mono text-[12px]">{r.actor}</td>
                  <td>{r.action}</td>
                  <td className="font-mono text-[12px]">{r.target}</td>
                  <td className="font-mono text-[12px]">{JSON.stringify(r.before)}</td>
                  <td className="font-mono text-[12px]">{JSON.stringify(r.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows && rows.length === 0 && !err && <p className="m-0 mt-2 text-muted">No entries yet.</p>}
      </Card>
    </Page>
  );
}
