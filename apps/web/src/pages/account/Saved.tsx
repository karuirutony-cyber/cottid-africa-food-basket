import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { listSaved, moveLocalToAccount, removeSaved, type SavedItem } from '@/lib/saved';
import { Card, Page } from '@/components/ui';

/** Saved views and scenarios: in your account when signed in, on this device otherwise. */
export default function Saved() {
  const auth = useAuth();
  const [items, setItems] = useState<SavedItem[] | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!auth.ready) return;
    let live = true;
    void (async () => {
      if (auth.user) {
        const moved = await moveLocalToAccount(auth.user).catch(() => 0);
        if (moved && live) setNote(`${moved} item(s) saved on this device were moved into your account.`);
      }
      const list = await listSaved(auth.user).catch(() => []);
      if (live) setItems(list);
    })();
    return () => {
      live = false;
    };
  }, [auth.ready, auth.user]);
  const remove = async (it: SavedItem, i: number) => {
    await removeSaved(auth.user, it, i);
    setItems((old) => (old ?? []).filter((_, j) => j !== i));
  };
  return (
    <Page
      kicker="Account"
      title="Saved views"
      lead={auth.user ? 'Scenarios and views saved to your account. They follow you to any device and open offline once loaded.' : 'Scenarios and views saved on this device. Sign in to keep them in your account and use them on any device.'}
    >
      {note && (
        <p role="status" className="m-0 rounded-lg bg-[#e3f1e7] px-3 py-2 text-[#1d5e36]">
          {note}
        </p>
      )}
      <Card>
        {items == null ? (
          <p className="m-0 text-muted">Loading…</p>
        ) : items.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {items.map((it, i) => (
              <li key={`${it.id ?? it.href}${i}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                <span>
                  <Link to={it.href} className="font-semibold">
                    {it.title}
                  </Link>
                  <span className="block text-[12.5px] text-muted">
                    {it.kind}, saved {new Date(it.at).toLocaleString('en-GB')}
                  </span>
                </span>
                <button type="button" className="btn min-h-[34px] py-1 text-[13px]" onClick={() => void remove(it, i)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-muted">
            Nothing saved yet. Open <Link to="/analytics/projections">Projections</Link>, set a scenario and choose “Save this scenario”.
          </p>
        )}
        {!auth.user && (
          <p className="m-0 mt-3">
            <Link to="/signin?next=/account/saved">Sign in</Link> to keep them in your account.
          </p>
        )}
      </Card>
    </Page>
  );
}
