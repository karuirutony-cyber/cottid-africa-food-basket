import { Suspense, useEffect, useRef } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { sectionFor } from '@/sections';
import { TopBar } from './TopBar';
import { SubNav } from './SubNav';
import { Footer } from './Footer';
import { OfflineBanner } from './OfflineBanner';

export function Shell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);
  const section = sectionFor(pathname);

  // Section colour for the whole document (focus rings, links, headings).
  useEffect(() => {
    const html = document.documentElement;
    if (section) html.dataset.section = section.id;
    else delete html.dataset.section;
  }, [section]);

  // After client-side navigation, move focus to the main region so screen readers announce the new page.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only-focusable absolute start-2 top-2 z-50 rounded-full bg-earth px-4 py-2 font-semibold text-white"
      >
        {t('a11y.skip')}
      </a>
      <TopBar />
      <OfflineBanner />
      <SubNav />
      <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 outline-none">
        <Suspense fallback={<p className="wrap py-10 text-muted">{t('status.loading')}</p>}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  );
}
