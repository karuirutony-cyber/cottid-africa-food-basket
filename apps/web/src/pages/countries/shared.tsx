import { useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

export function useGo() {
  const nav = useNavigate();
  return useCallback((to: string) => nav(to), [nav]);
}

/** Summary, Diet and Food trade for one country. */
export function CountryTabs({ mid }: { mid: string }) {
  const tabs = [
    ['Summary', `/countries/${mid}`],
    ['Diet', `/countries/${mid}/diet`],
    ['Food trade', `/countries/${mid}/trade`],
    ['Projections', `/analytics/projections?c=${mid}`],
    ['Advisory', `/analytics/advisory?c=${mid}`],
  ] as const;
  return (
    <nav aria-label="Country views" className="flex flex-wrap gap-1.5">
      {tabs.map(([label, to]) => (
        <NavLink
          key={label}
          to={to}
          end
          className={({ isActive }) =>
            `rounded-full border px-3 py-1.5 text-sm font-semibold no-underline ${
              isActive ? 'border-sec-ink bg-sec-ink text-white' : 'border-line bg-surface text-sec-ink hover:bg-sec-tint'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
