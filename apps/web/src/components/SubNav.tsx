import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { sectionFor } from '@/sections';

/** Pages within the current section, as a row of links under the top bar. */
export function SubNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const section = sectionFor(pathname);
  if (!section || section.pages.length < 2) return null;

  return (
    <nav aria-label={t('a11y.pages')} className="border-b border-line bg-surface/70">
      <ul className="wrap m-0 flex list-none gap-1 overflow-x-auto py-2">
        {section.pages.map((p) => (
          <li key={p.path} className="shrink-0">
            <NavLink
              to={p.path}
              end
              className={({ isActive }) =>
                `block rounded-full px-3 py-1.5 text-sm font-semibold no-underline ${
                  isActive ? 'bg-sec-ink text-white' : 'text-sec-ink hover:bg-sec-tint'
                }`
              }
            >
              {t(`page.${p.key}`)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
