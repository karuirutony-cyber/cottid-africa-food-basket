import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { getFirebase } from '@/lib/firebase';
import { useDataset } from '@/data/datasets';
import { CountrySelect, FoodSelect } from '@/components/pickers';
import { Card, Page, Pill, Select } from '@/components/ui';

interface Rule {
  id: string;
  kind: 'calls' | 'events';
  country: string;
  food: string;
  days: number;
  email: boolean;
}
interface Note {
  id: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string | null;
}

/** Your alert rules: calls closing soon and upcoming events, for the countries and foods you follow. */
export function Alerts() {
  const { t } = useTranslation();
  const auth = useAuth();
  const summary = useDataset('summary').data;
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [kind, setKind] = useState<'calls' | 'events'>('calls');
  const [country, setCountry] = useState('');
  const [food, setFood] = useState('all');
  const [days, setDays] = useState('30');
  const [email, setEmail] = useState(true);
  const [msg, setMsg] = useState('');
  const uid = auth.user?.uid;

  const load = useCallback(async () => {
    if (!uid) return;
    const { db } = await getFirebase();
    const { collection, getDocs } = await import('firebase/firestore');
    try {
      const s = await getDocs(collection(db, `users/${uid}/alerts`));
      setRules(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Rule, 'id'>) })));
    } catch {
      // The live database rules do not cover alerts yet (they arrive with the Firebase deploy).
      setRules([]);
      setMsg(t('status.serverOff'));
    }
  }, [uid, t]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!auth.ready) return null;
  if (!auth.user) return <Navigate to="/signin?next=/account/alerts" replace />;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const { db } = await getFirebase();
    const { addDoc, collection } = await import('firebase/firestore');
    try {
      await addDoc(collection(db, `users/${uid}/alerts`), { kind, country, food: food === 'all' ? '' : food, days: Number(days), email });
      setMsg(t('alerts.saved'));
    } catch {
      setMsg(t('status.serverOff'));
      return;
    }
    void load();
  };
  const remove = async (id: string) => {
    const { db } = await getFirebase();
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(db, `users/${uid}/alerts/${id}`));
    void load();
  };
  const cname = (c: string) => (c ? summary?.markets[c] ?? c : t('alerts.anyCountry'));
  const fname = (f: string) => (f ? summary?.foods[f]?.label ?? f : t('alerts.anyFood'));

  return (
    <Page kicker={t('section.account')} title={t('page.alerts')} lead={t('alerts.lead')} actions={<Link to="/notifications" className="btn no-underline">{t('page.notifications')}</Link>}>
      <Card title={t('alerts.new')}>
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select label={t('alerts.kind')} value={kind} onChange={(v) => setKind(v as 'calls' | 'events')}>
            <option value="calls">{t('alerts.calls')}</option>
            <option value="events">{t('alerts.events')}</option>
          </Select>
          {summary && (
            <>
              <div className="grid">
                <CountrySelect summary={summary} value={country} onChange={setCountry} label={t('alerts.country')} />
                <button type="button" className="mt-1 justify-self-start text-[12.5px] text-sec-ink underline" onClick={() => setCountry('')}>
                  {t('alerts.anyCountry')}
                </button>
              </div>
              <FoodSelect summary={summary} value={food} onChange={setFood} label={t('alerts.food')} allLabel={t('alerts.anyFood')} />
            </>
          )}
          <Select label={t('alerts.window')} value={days} onChange={setDays}>
            {['7', '14', '30', '60', '90'].map((d) => (
              <option key={d} value={d}>
                {t('alerts.days', { n: d })}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 self-end pb-2 text-[14px]">
            <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="h-4 w-4 accent-[var(--sec)]" />
            {t('alerts.email')}
          </label>
          <button className="btn btn-primary justify-self-start lg:col-span-5">{t('alerts.add')}</button>
        </form>
        {msg && (
          <p role="status" className="m-0 mt-3 rounded-lg bg-[#e3f1e7] px-3 py-2 text-[#1d5e36]">
            {msg}
          </p>
        )}
      </Card>
      <Card title={t('alerts.yours')}>
        {rules == null ? (
          <p className="m-0 text-muted">{t('status.loading')}</p>
        ) : rules.length === 0 ? (
          <p className="m-0 text-muted">{t('alerts.none')}</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                <span>
                  <b>{r.kind === 'calls' ? t('alerts.calls') : t('alerts.events')}</b> · {cname(r.country)} · {fname(r.food)} · {t('alerts.days', { n: r.days })}
                  {r.email && (
                    <>
                      {' '}
                      <Pill tone="neutral">{t('alerts.byEmail')}</Pill>
                    </>
                  )}
                </span>
                <button type="button" className="btn min-h-[34px] py-1 text-[13px]" onClick={() => void remove(r.id)}>
                  {t('contribute.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}

export function Notifications() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [items, setItems] = useState<Note[] | null>(null);
  const uid = auth.user?.uid;
  const load = useCallback(async () => {
    if (!uid) return;
    const { db } = await getFirebase();
    const { collection, getDocs, orderBy, query, limit } = await import('firebase/firestore');
    let s;
    try {
      s = await getDocs(query(collection(db, `users/${uid}/notifications`), orderBy('createdAt', 'desc'), limit(100)));
    } catch {
      setItems([]);
      return;
    }
    setItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Note, 'id' | 'createdAt'>), createdAt: d.get('createdAt')?.toDate?.().toISOString() ?? null })));
  }, [uid]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!auth.ready) return null;
  if (!auth.user) return <Navigate to="/signin?next=/notifications" replace />;
  const markRead = async (id: string) => {
    const { db } = await getFirebase();
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, `users/${uid}/notifications/${id}`), { read: true });
    setItems((old) => (old ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)));
  };
  return (
    <Page kicker={t('section.account')} title={t('page.notifications')} lead={t('alerts.notesLead')} actions={<Link to="/account/alerts" className="btn no-underline">{t('page.alerts')}</Link>}>
      <Card>
        {items == null ? (
          <p className="m-0 text-muted">{t('status.loading')}</p>
        ) : items.length === 0 ? (
          <p className="m-0 text-muted">{t('alerts.noNotes')}</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {items.map((n) => (
              <li key={n.id} className={`border-b border-line pb-2 ${n.read ? 'opacity-70' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {!n.read && <Pill tone="watch">{t('alerts.new')}</Pill>}
                  <Link to={n.link} className="font-semibold" data-no-tr onClick={() => void markRead(n.id)}>
                    {n.title}
                  </Link>
                </div>
                <p className="m-0 mt-1 text-[14px] text-muted" data-no-tr>
                  {n.body}
                </p>
                {!n.read && (
                  <button type="button" className="mt-1 text-[12.5px] text-sec-ink underline" onClick={() => void markRead(n.id)}>
                    {t('alerts.markRead')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}
