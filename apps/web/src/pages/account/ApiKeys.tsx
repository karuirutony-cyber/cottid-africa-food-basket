import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { callMessage, serverIsOff } from '@/lib/call';
import { serverCall } from '@/lib/serverless';
import { Card, Page, Pill } from '@/components/ui';

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  quota: number;
  usedToday: number;
  total: number;
  revoked: boolean;
  createdAt: string | null;
  lastUsed: string | null;
}

export default function ApiKeys() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);
  const nameId = useId();
  const load = useCallback(() => {
    serverCall<{ items: KeyRow[] }>('listApiKeys').then(
      (r) => {
        setKeys(r.items.sort((a, b) => Number(a.revoked) - Number(b.revoked)));
        setOff(serverIsOff());
      },
      (e) => {
        setKeys([]);
        setOff(serverIsOff());
        if (!serverIsOff()) setErr(callMessage(e));
      },
    );
  }, []);
  useEffect(() => {
    if (auth.user) load();
  }, [auth.user, load]);
  if (!auth.ready) return null;
  if (!auth.user) return <Navigate to="/signin?next=/account/api-keys" replace />;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await serverCall<{ key: string }>('createApiKey', { name: name.trim() });
      setFresh(r.key);
      setName('');
      load();
    } catch (x) {
      setErr(callMessage(x));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (id: string) => {
    try {
      await serverCall('revokeApiKey', { id });
      load();
    } catch (x) {
      setErr(callMessage(x));
    }
  };

  return (
    <Page kicker={t('section.account')} title={t('page.apiKeys')} lead={t('apikeys.lead')}>
      <Card title={t('apikeys.create')}>
        {off && <p className="m-0 mb-3 rounded-lg bg-[#fdf1d8] px-3 py-2 text-[14px] text-[#6b4700]">{t('status.serverOff')}</p>}
        <form onSubmit={create} className="flex flex-wrap items-end gap-2">
          <label htmlFor={nameId} className="grid min-w-[240px] flex-1 gap-1 text-[13px] font-semibold text-muted">
            {t('apikeys.name')}
            <input id={nameId} required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="min-h-[44px] rounded-lg border border-line bg-surface px-3 text-[15px] text-ink" />
          </label>
          <button className="btn btn-primary" disabled={busy || off} aria-busy={busy}>
            {busy ? t('status.loading') : t('apikeys.createButton')}
          </button>
        </form>
        {fresh && (
          <div role="status" className="mt-3 grid gap-2 rounded-lg bg-[#e3f1e7] p-3 text-[#1d5e36]">
            <p className="m-0 font-semibold">{t('apikeys.copyNow')}</p>
            <code data-no-tr data-testid="new-key" className="select-all break-all rounded bg-white px-2 py-1 text-[14px] text-ink">
              {fresh}
            </code>
            <button type="button" className="btn justify-self-start" onClick={() => void navigator.clipboard?.writeText(fresh)}>
              {t('apikeys.copy')}
            </button>
          </div>
        )}
        {err && (
          <p role="alert" className="m-0 mt-3 rounded-lg bg-[#fde8dc] px-3 py-2 text-[#8f1f0d]">
            {err}
          </p>
        )}
      </Card>
      <Card title={t('apikeys.yours')}>
        {keys == null ? (
          <p className="m-0 text-muted">{t('status.loading')}</p>
        ) : keys.length === 0 ? (
          <p className="m-0 text-muted">{t('apikeys.none')}</p>
        ) : (
          <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('apikeys.name')}</th>
                  <th>{t('apikeys.key')}</th>
                  <th className="n">{t('apikeys.today')}</th>
                  <th className="n">{t('apikeys.total')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td data-no-tr>{k.name}</td>
                    <td>
                      <code data-no-tr>{k.prefix}…</code>
                    </td>
                    <td className="n">
                      {k.usedToday.toLocaleString('en-US')} / {k.quota.toLocaleString('en-US')}
                    </td>
                    <td className="n">{k.total.toLocaleString('en-US')}</td>
                    <td>
                      {k.revoked ? (
                        <Pill tone="no">{t('apikeys.revoked')}</Pill>
                      ) : (
                        <button type="button" className="btn min-h-[34px] py-1 text-[13px]" onClick={() => void revoke(k.id)}>
                          {t('apikeys.revoke')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="m-0 mt-3 text-[13.5px]">
          <Link to="/data/apis#api">{t('apikeys.docs')}</Link>
        </p>
      </Card>
    </Page>
  );
}
