import type { SectionId } from '@afb/ui';

/** The eight public sections (section 5 of the build prompt). Labels are i18n keys in common.json. */
export interface NavPage {
  key: string; // page.<key>
  path: string;
}
export interface NavSection {
  id: SectionId;
  path: string;
  pages: NavPage[];
}

export const SECTIONS: NavSection[] = [
  { id: 'home', path: '/', pages: [] },
  {
    id: 'countries',
    path: '/countries',
    pages: [
      { key: 'countries', path: '/countries' },
      { key: 'compare', path: '/compare' },
    ],
  },
  {
    id: 'analytics',
    path: '/analytics/planner',
    pages: [
      { key: 'planner', path: '/analytics/planner' },
      { key: 'projections', path: '/analytics/projections' },
      { key: 'review', path: '/analytics/review' },
      { key: 'advisory', path: '/analytics/advisory' },
      { key: 'briefs', path: '/analytics/briefs' },
    ],
  },
  {
    id: 'cost',
    path: '/cost/matrix',
    pages: [
      { key: 'matrix', path: '/cost/matrix' },
      { key: 'calculator', path: '/cost/calculator' },
      { key: 'origins', path: '/cost/origins' },
      { key: 'markets', path: '/cost/markets' },
    ],
  },
  {
    id: 'directory',
    path: '/directory/buyers',
    pages: [
      { key: 'buyers', path: '/directory/buyers' },
      { key: 'sellers', path: '/directory/sellers' },
      { key: 'compliance', path: '/directory/compliance' },
      { key: 'events', path: '/directory/events' },
    ],
  },
  {
    id: 'policy',
    path: '/policy/agreements',
    pages: [
      { key: 'agreements', path: '/policy/agreements' },
      { key: 'interventions', path: '/policy/interventions' },
      { key: 'funders', path: '/policy/funders' },
      { key: 'calls', path: '/policy/calls' },
    ],
  },
  {
    id: 'data',
    path: '/data/explorer',
    pages: [
      { key: 'explorer', path: '/data/explorer' },
      { key: 'apis', path: '/data/apis' },
      { key: 'sources', path: '/data/sources' },
    ],
  },
  {
    id: 'about',
    path: '/about',
    pages: [
      { key: 'about', path: '/about' },
      { key: 'methods', path: '/about/methods' },
      { key: 'terms', path: '/about/terms' },
    ],
  },
];

/** Which section a path belongs to (drives the section colour and the sub-navigation). */
export function sectionFor(pathname: string): NavSection | null {
  if (pathname === '/') return SECTIONS[0]!;
  if (pathname === '/compare' || pathname.startsWith('/countries')) return byId('countries');
  const first = pathname.split('/')[1] ?? '';
  return SECTIONS.find((s) => s.id !== 'home' && s.path.split('/')[1] === first) ?? null;
}

function byId(id: SectionId): NavSection {
  return SECTIONS.find((s) => s.id === id)!;
}
