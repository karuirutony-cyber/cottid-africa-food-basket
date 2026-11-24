/* The staff console frame: a dark header, a grouped sidebar (collapsible on phones), breadcrumbs and a way
 * back to the public site. Items above the signed-in role are hidden. Pages render in the main column. */
import { useEffect, useId, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { hasRole, type Role } from '@afb/schema';
import { useAuth } from '@/lib/auth';
import { RequireRole } from '@/pages/account/Auth';

interface Item {
  to: string;
  label: string;
  min: Role;
  icon: string; // SVG path data, 24 px grid
}
const GROUPS: { label: string; items: Item[] }[] = [
  { label: 'Overview', items: [{ to: '/admin', label: 'Dashboard', min: 'verifier', icon: 'M4 13h6V4H4zm0 7h6v-5H4zm10 0h6v-9h-6zm0-16v5h6V4z' }] },
  { label: 'Review', items: [{ to: '/admin/review', label: 'Review queue', min: 'verifier', icon: 'M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11' }] },
  {
    label: 'Records',
    items: [
      { to: '/admin/directory', label: 'Directory', min: 'data_steward', icon: 'M4 6h16M4 12h16M4 18h10' },
      { to: '/admin/content', label: 'Policy and development', min: 'data_steward', icon: 'M6 4h9l3 3v13H6zM9 10h6M9 14h6' },
      { to: '/admin/prices', label: 'Prices and rate cards', min: 'data_steward', icon: 'M4 17l5-5 4 4 7-7M15 9h5v5' },
      { to: '/admin/duties', label: 'Duties', min: 'data_steward', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6' },
      { to: '/admin/sources', label: 'Sources', min: 'data_steward', icon: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11' },
    ],
  },
  {
    label: 'Data',
    items: [
      { to: '/admin/datasets', label: 'Datasets', min: 'data_steward', icon: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' },
      { to: '/admin/ingest', label: 'Ingest runs', min: 'data_steward', icon: 'M12 3v12m0 0l-4-4m4 4l4-4M5 21h14' },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/admin/users', label: 'Users and roles', min: 'platform_admin', icon: 'M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
      { to: '/admin/organisations', label: 'Organisations', min: 'platform_admin', icon: 'M4 20V8l8-4 8 4v12M9 20v-6h6v6' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/settings', label: 'Platform settings', min: 'platform_admin', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z' },
      { to: '/admin/audit', label: 'Audit log', min: 'platform_admin', icon: 'M12 8v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z' },
    ],
  },
];

const ROLE_NAME: Record<string, string> = {
  verifier: 'Verifier',
  content_editor: 'Content editor',
  data_steward: 'Data steward',
  platform_admin: 'Platform administrator',
  super_admin: 'Super administrator',
};

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

function Frame() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const navId = useId();
  useEffect(() => setOpen(false), [pathname]);

  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => hasRole(auth.role, i.min)) })).filter((g) => g.items.length);
  const current = GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))).find((i) => (i.to === '/admin' ? pathname === '/admin' : pathname.startsWith(i.to)));

  const nav = (
    <nav id={navId} aria-label="Admin sections" className={`${open ? 'block' : 'hidden'} border-b border-[#4a3020] lg:block lg:border-b-0`}>
      {groups.map((g) => (
        <div key={g.label} className="mb-4">
          <p className="m-0 px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#c9b08a]">{g.label}</p>
          <ul className="m-0 grid list-none gap-0.5 p-0">
            {g.items.map((i) => (
              <li key={i.to}>
                <NavLink
                  to={i.to}
                  end={i.to === '/admin'}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg border-s-4 px-3 py-2 text-[14px] font-semibold no-underline ${
                      isActive ? 'border-[#d99a2b] bg-[#4a3020] text-white' : 'border-transparent text-[#f3e4cb] hover:bg-[#3f2919]'
                    }`
                  }
                >
                  <Icon d={i.icon} />
                  {i.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="border-t-4 border-[#d99a2b] bg-[#f6efe4]">
      <header className="bg-[#2a1a10] text-[#fbf3e6]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
          <p className="m-0 font-display text-[18px] font-bold">Admin console</p>
          <span className="rounded-full border border-[#d99a2b] px-2.5 py-0.5 text-[12px] font-semibold text-[#f3d9a8]">{ROLE_NAME[auth.role] ?? auth.role}</span>
          <span className="hidden text-[13px] text-[#c9b08a] sm:inline">{auth.user?.email}</span>
          <div className="ms-auto flex items-center gap-2">
            <Link to="/" className="rounded-full border border-[#6b4a32] px-3 py-1.5 text-[13px] font-semibold text-[#fbf3e6] no-underline hover:bg-[#3f2919]">
              ← Back to the site
            </Link>
            <button type="button" className="rounded-full border border-[#6b4a32] px-3 py-1.5 text-[13px] font-semibold text-[#fbf3e6] lg:hidden" aria-expanded={open} aria-controls={navId} onClick={() => setOpen((o) => !o)}>
              {open ? 'Close menu' : 'Admin menu'}
            </button>
          </div>
        </div>
        {!auth.twoStep && (
          <p role="status" className="m-0 bg-[#7a4b00] px-4 py-2 text-center text-[13px] font-semibold text-white">
            Two-step verification is not on for this account. You can view the console; changes that the server protects with two-step stay blocked until you turn it on in{' '}
            <Link to="/account" className="text-white underline">
              your account
            </Link>
            .
          </p>
        )}
      </header>
      <div className="mx-auto grid max-w-[1400px] gap-0 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="bg-[#2a1a10] px-3 py-4 lg:min-h-[calc(100dvh-140px)]">{nav}</aside>
        <div className="min-w-0 pb-8">
          <nav aria-label="Breadcrumb" className="px-4 pt-4 text-[13px] text-muted">
            <ol className="m-0 flex list-none flex-wrap gap-1 p-0">
              <li>
                <Link to="/admin">Admin</Link>
              </li>
              {current && current.to !== '/admin' && (
                <>
                  <li aria-hidden="true">/</li>
                  <li>{current.group}</li>
                  <li aria-hidden="true">/</li>
                  <li aria-current="page" className="font-semibold text-ink">
                    {current.label}
                  </li>
                </>
              )}
            </ol>
          </nav>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function AdminLayout() {
  return (
    <RequireRole min="verifier">
      <Frame />
    </RequireRole>
  );
}
