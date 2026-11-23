import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchContent } from '@/data/datasets';
import { DataState, Page } from '@/components/ui';

/** Legacy panel ids -> routes, so links inside the captured text work in the new app. */
const ROUTES: Record<string, string> = {
  home: '/', countries: '/countries', nutrition: '/countries/KE/diet', foodtrade: '/countries/KE/trade',
  planner: '/analytics/planner', trends: '/analytics/review', forecast: '/analytics/projections', advisory: '/analytics/advisory',
  overview: '/cost/matrix', markets: '/cost/markets', calc: '/cost/calculator', origins: '/cost/origins',
  buyers: '/directory/buyers', sellers: '/directory/sellers', compliance: '/directory/compliance', events: '/directory/events',
  policy: '/policy/agreements', interventions: '/policy/interventions', funders: '/policy/funders', calls: '/policy/calls',
  data: '/data/explorer', apis: '/data/apis', sources: '/data/sources', about: '/about', methods: '/about/methods', terms: '/about/terms',
};

function rewrite(html: string): string {
  return html
    .replace(/<h2([^>]*)>/, '<h2$1 class="sr-only">') // the page header already shows the title
    .replace(/<button([^>]*?)data-go="([a-z]+)"([^>]*)>([\s\S]*?)<\/button>/g, (_m, _a, go: string, _b, text: string) => `<a href="${ROUTES[go] ?? '/'}" data-internal>${text}</a>`)
    .replace(/<button[^>]*data-src="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g, (_m, id: string, text: string) => `<a href="/data/sources#${id}" data-internal>${text}</a>`)
    .replace(/<a ([^>]*?)href="(https?:[^"]+)"/g, '<a $1href="$2" target="_blank" rel="noopener noreferrer"');
}

const TITLES = { about: 'About the platform', methods: 'Methods', terms: 'Terms and disclaimer' } as const;

export default function AboutPage({ page }: { page: 'about' | 'methods' | 'terms' }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['content', page], queryFn: () => fetchContent(page), staleTime: Infinity });
  if (!q.data) return <DataState loading={q.isLoading} error={q.error} />;
  return (
    <Page kicker="About" title={TITLES[page]}>
      {/* Text as published on the legacy platform (captured by tools/capture-legacy.ts), our own content.
          The click handler only intercepts real <a> links inside, which are keyboard-operable themselves. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="prose-legacy min-w-0"
        onClick={(e) => {
          const a = (e.target as HTMLElement).closest('a[data-internal]') as HTMLAnchorElement | null;
          if (a) {
            e.preventDefault();
            nav(a.getAttribute('href')!);
          }
        }}
        dangerouslySetInnerHTML={{ __html: rewrite(q.data) }}
      />
    </Page>
  );
}
