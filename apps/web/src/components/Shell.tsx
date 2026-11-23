import { Suspense, useEffect, useRef } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { sectionFor } from '@/sections';
import { TopBar } from './TopBar';
import { SubNav } from './SubNav';
import { Footer } from './Footer';
import { OfflineBanner } from './OfflineBanner';
import { SuggestLink } from './SuggestLink';
import { loadTranslator, noteEnglish, translateTree } from '@/lib/legacyI18n';

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

  // Data pages are written in English from the figures; in other languages the legacy phrase
  // dictionary translates them in place, as the legacy page did. React text updates are noted as new English.
  const { i18n } = useTranslation();
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const lang = i18n.language;
    const pending = loadTranslator(lang);
    let t: Awaited<NonNullable<typeof pending>> | null = null;
    let raf = 0;
    const obs = new MutationObserver((records) => {
      for (const r of records) if (r.type === 'characterData') noteEnglish(r.target);
      if (!raf) raf = requestAnimationFrame(run);
    });
    function run() {
      raf = 0;
      translateTree(main!, t);
      obs.takeRecords(); // our own edits are not new English
    }
    obs.observe(main, { childList: true, subtree: true, characterData: true });
    if (pending) void pending.then((x) => ((t = x), run()));
    else run();
    return () => {
      obs.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [i18n.language]);

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
      {pathname !== '/contribute' && !pathname.startsWith('/admin') && (
        <div className="wrap no-print mt-6 flex justify-end">
          <SuggestLink />
        </div>
      )}
      <Footer />
      <ScrollRestoration />
    </div>
  );
}
