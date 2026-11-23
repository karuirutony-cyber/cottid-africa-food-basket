import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { call, callMessage, type Submission } from '@/lib/call';
import { Card, Page, Pill } from '@/components/ui';

export const statusTone = (s: Submission['status']) => (s === 'published' ? 'go' : s === 'approved' ? 'neutral' : s === 'rejected' ? 'no' : 'watch');

function PatchRows({ rows, setRows }: { rows: [string, string][]; setRows: (r: [string, string][]) => void }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <fieldset className="m-0 grid gap-2 rounded-lg border border-line p-3">
      <legend className="px-1 text-[13px] font-semibold text-muted">{t('contribute.patch')}</legend>
      {rows.map(([k, v], i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_1fr_auto]">
          <label className="sr-only" htmlFor={`${id}k${i}`}>{t('contribute.field')}</label>
          <input id={`${id}k${i}`} value={k} placeholder={t('contribute.field')} onChange={(e) => setRows(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} className="min-h-[40px] rounded-lg border border-line bg-surface px-2" />
          <label className="sr-only" htmlFor={`${id}v${i}`}>{t('contribute.value')}</label>
          <input id={`${id}v${i}`} value={v} placeholder={t('contribute.value')} onChange={(e) => setRows(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} className="min-h-[40px] rounded-lg border border-line bg-surface px-2" />
          <button type="button" className="btn min-h-[40px]" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            {t('contribute.remove')}
          </button>
        </div>
      ))}
      <button type="button" className="btn justify-self-start" onClick={() => setRows([...rows, ['', '']])}>
        {t('contribute.addField')}
      </button>
    </fieldset>
  );
}

export default function Contribute() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [params] = useSearchParams();
  const page = params.get('page') ?? '';
  const item = params.get('item') ?? '';
  const target = params.get('target') ?? 'page';
  const [text, setText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [rows, setRows] = useState<[string, string][]>([]);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Submission[] | null>(null);
  const textId = useId();
  const srcId = useId();

  useEffect(() => {
    if (!auth.user) return;
    call<{ items: Submission[] }>('myContributions').then((r) => setMine(r.items), () => setMine([]));
  }, [auth.user, sent]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const patch = Object.fromEntries(rows.filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => [k.trim(), v.trim()]));
    try {
      const r = await call<{ id: string }>('submit', { target, page, item, text, sourceUrl: sourceUrl.trim(), ...(Object.keys(patch).length ? { patch } : {}) });
      setSent(r.id);
      setText('');
      setSourceUrl('');
      setRows([]);
    } catch (x) {
      setErr(callMessage(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page kicker={t('section.contribute')} title={t('page.contribute')} lead={t('contribute.lead')}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          {!auth.ready ? null : !auth.user ? (
            <p className="m-0">
              <Link to={`/signin?next=${encodeURIComponent(`/contribute?${params}`)}`}>{t('page.signin')}</Link> {t('contribute.signinFirst')}
            </p>
          ) : (
            <form onSubmit={submit} className="grid gap-3">
              {(page || item || target !== 'page') && (
                <p className="m-0 rounded-lg bg-sec-tint px-3 py-2 text-[14px]">
                  {t('contribute.about')} <b data-no-tr>{item || target}</b>
                  {page && (
                    <>
                      {' '}
                      · <Link to={page} data-no-tr>{page}</Link>
                    </>
                  )}
                </p>
              )}
              <label htmlFor={textId} className="grid gap-1 text-[13px] font-semibold text-muted">
                {t('contribute.what')}
                <textarea id={textId} required minLength={10} maxLength={4000} rows={6} value={text} onChange={(e) => setText(e.target.value)} className="rounded-lg border border-line bg-surface p-3 text-[15px] text-ink" />
                <span className="text-[12px] font-normal">{text.length.toLocaleString('en-US')} / 4,000</span>
              </label>
              <label htmlFor={srcId} className="grid gap-1 text-[13px] font-semibold text-muted">
                {t('contribute.source')}
                <input id={srcId} type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" className="min-h-[44px] rounded-lg border border-line bg-surface px-3 text-[15px] text-ink" />
              </label>
              {target !== 'page' && <PatchRows rows={rows} setRows={setRows} />}
              {err && (
                <p role="alert" className="m-0 rounded-lg bg-[#fde8dc] px-3 py-2 text-[#8f1f0d]">
                  {err}
                </p>
              )}
              {sent && (
                <p role="status" className="m-0 rounded-lg bg-[#e3f1e7] px-3 py-2 text-[#1d5e36]">
                  {t('contribute.thanks')}
                </p>
              )}
              <button className="btn btn-primary justify-self-start" disabled={busy} aria-busy={busy}>
                {busy ? t('status.loading') : t('contribute.send')}
              </button>
            </form>
          )}
        </Card>
        {auth.user && (
          <Card title={t('contribute.yours')}>
            {mine == null ? (
              <p className="m-0 text-muted">{t('status.loading')}</p>
            ) : mine.length ? (
              <ul className="m-0 grid list-none gap-2 p-0">
                {mine.map((s) => (
                  <li key={s.id} className="border-b border-line pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={statusTone(s.status)}>{t(`contribute.status.${s.status}`)}</Pill>
                      <span className="text-[12.5px] text-muted" data-no-tr>
                        {s.item || s.target} · {s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-GB') : ''}
                      </span>
                    </div>
                    <p className="m-0 mt-1 line-clamp-3 text-[14px]" data-no-tr>{s.text}</p>
                    {s.note && <p className="m-0 mt-1 text-[13px] text-muted">{t('contribute.reviewerNote')}: <span data-no-tr>{s.note}</span></p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-muted">{t('contribute.none')}</p>
            )}
          </Card>
        )}
      </div>
    </Page>
  );
}
