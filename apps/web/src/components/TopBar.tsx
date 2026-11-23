import { useEffect, useId, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CottidMark, ShukaStrip } from '@afb/ui';
import { SECTIONS, sectionFor } from '@/sections';
import { LanguageSelect } from './LanguageSelect';
import { useAuth } from '@/lib/auth';

export function TopBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const current = sectionFor(pathname);
  const auth = useAuth();
  const who = auth.user ? (auth.profile?.name || auth.user.displayName || auth.user.email || t('page.account')) : null;
  const accountLink = auth.user ? '/account' : '/signin';
  const accountLabel = who ?? t('action.signIn');

  // Close the mobile menu after navigating.
  useEffect(() => setOpen(false), [pathname]);

  const sectionLinks = SECTIONS.filter((s) => s.id !== 'home').map((s) => (
    <li key={s.id}>
      <NavLink
        to={s.path}
        data-section={s.id}
        aria-current={current?.id === s.id ? 'page' : undefined}
        className={`block rounded-full px-3 py-2 text-[14.5px] font-semibold no-underline ${
          current?.id === s.id ? 'bg-sec-tint text-sec-ink' : 'text-ink hover:bg-sisal/40'
        }`}
      >
        {t(`section.${s.id}`)}
      </NavLink>
    </li>
  ));

  return (
    <header className="sticky top-0 z-40 bg-[#fffaf2]/95 backdrop-blur supports-[backdrop-filter]:bg-[#fffaf2]/85">
      <div className="wrap flex min-h-[60px] items-center gap-3">
        <Link to="/" className="flex min-w-0 items-center gap-2 no-underline" aria-label={t('brand.home')}>
          <CottidMark size={30} className="shrink-0" />
          <span className="flex min-w-0 flex-col leading-none">
            <span className="truncate font-display text-[15px] font-bold text-earth sm:text-[17px]">
              {t('brand.name')}
            </span>
            <span className="mt-0.5 truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted sm:text-[11.5px]">
              {t('brand.by')}
            </span>
          </span>
        </Link>

        <nav aria-label={t('a11y.sections')} className="ms-2 hidden min-w-0 flex-1 xl:block">
          <ul className="m-0 flex list-none flex-wrap gap-1 p-0">{sectionLinks}</ul>
        </nav>

        <div className="ms-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <LanguageSelect />
          <Link to={accountLink} className="btn hidden max-w-[180px] no-underline sm:inline-flex">
            <span className="truncate" data-no-tr>{accountLabel}</span>
          </Link>
          <button
            type="button"
            className="btn px-2.5 sm:px-3.5 xl:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              )}
            </svg>
            <span className="sr-only sm:not-sr-only">{open ? t('a11y.closeMenu') : t('a11y.menu')}</span>
          </button>
        </div>
      </div>

      <nav id={menuId} aria-label={t('a11y.sections')} hidden={!open} className="border-t border-line xl:hidden">
        <ul className="wrap m-0 grid list-none grid-cols-1 gap-1 py-3 sm:grid-cols-2">
          {sectionLinks}
          <li className="sm:hidden">
            <NavLink to={accountLink} className="block rounded-full px-3 py-2 text-[14.5px] font-semibold text-ink">
              {accountLabel}
            </NavLink>
          </li>
        </ul>
      </nav>

      <ShukaStrip height={8} />
    </header>
  );
}
