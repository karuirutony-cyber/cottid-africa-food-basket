import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Page } from '@/components/ui';

interface SavedItem {
  kind: string;
  title: string;
  href: string;
  at: string;
}

function load(): SavedItem[] {
  try {
    return JSON.parse(localStorage.getItem('afb-saved') ?? '[]') as SavedItem[];
  } catch {
    return [];
  }
}

/** Saved views and scenarios. Kept on this device until sign-in (M2) syncs them to your account. */
export default function Saved() {
  const [items, setItems] = useState(load);
  const remove = (i: number) => {
    const next = items.filter((_, j) => j !== i);
    setItems(next);
    try {
      localStorage.setItem('afb-saved', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return (
    <Page kicker="Account" title="Saved views" lead="Scenarios and views you have saved. They are kept on this device, and work offline; once you sign in they will follow you to any device.">
      <Card>
        {items.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {items.map((it, i) => (
              <li key={`${it.href}${i}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                <span>
                  <Link to={it.href} className="font-semibold">
                    {it.title}
                  </Link>
                  <span className="block text-[12.5px] text-muted">
                    {it.kind}, saved {new Date(it.at).toLocaleString('en-GB')}
                  </span>
                </span>
                <button type="button" className="btn min-h-[34px] py-1 text-[13px]" onClick={() => remove(i)}>
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
      </Card>
    </Page>
  );
}
