import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { Shell } from '@/components/Shell';
import Home from '@/pages/Home';
import Building from '@/pages/Building';
import { Maintenance, NotFound, Offline, RouteError } from '@/pages/SystemPage';

/** Admin pages: staff only (verifier and above, with two-step verification). */
const staff = (path: string, titleKey: string): RouteObject => ({
  path,
  lazy: async () => {
    const { RequireRole } = await import('@/pages/account/Auth');
    return { Component: () => <RequireRole min="verifier"><Building titleKey={titleKey} /></RequireRole> };
  },
});

/** A lazily loaded page: each section is its own chunk, so the first load stays small. */
const page = (path: string, load: () => Promise<{ Component: React.ComponentType }>): RouteObject => ({ path, lazy: load });

/**
 * Every route from section 5 of the build prompt. Pages whose milestone has not landed render
 * <Building>, which shows no figures. Each milestone swaps its routes for lazy-loaded pages.
 */
const placeholder = (path: string, titleKey: string): RouteObject => ({
  path,
  element: <Building titleKey={titleKey} />,
});

export const routes: RouteObject[] = [
  {
    element: <Shell />,
    errorElement: <RouteError />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Home /> },

          // Countries
          page('countries', async () => ({ Component: (await import('@/pages/countries/Countries')).default })),
          page('countries/:iso2', async () => ({ Component: (await import('@/pages/countries/Country')).default })),
          page('countries/:iso2/diet', async () => ({ Component: (await import('@/pages/countries/Diet')).default })),
          page('countries/:iso2/trade', async () => ({ Component: (await import('@/pages/countries/Trade')).default })),
          page('compare', async () => ({ Component: (await import('@/pages/countries/Compare')).default })),

          // Analytics
          { path: 'analytics', element: <Navigate to="/analytics/planner" replace /> },
          page('analytics/planner', async () => ({ Component: (await import('@/pages/analytics/Analytics')).Planner })),
          page('analytics/projections', async () => ({ Component: (await import('@/pages/analytics/Analytics')).Projections })),
          page('analytics/review', async () => ({ Component: (await import('@/pages/analytics/Analytics')).Review })),
          page('analytics/advisory', async () => ({ Component: (await import('@/pages/analytics/Analytics')).Advisory })),
          page('analytics/briefs', async () => ({ Component: (await import('@/pages/analytics/Analytics')).Briefs })),

          // Cost of Imports
          { path: 'cost', element: <Navigate to="/cost/matrix" replace /> },
          page('cost/matrix', async () => ({ Component: (await import('@/pages/cost/Cost')).Matrix })),
          page('cost/calculator', async () => ({ Component: (await import('@/pages/cost/Cost')).Calculator })),
          page('cost/origins', async () => ({ Component: (await import('@/pages/cost/Cost')).Origins })),
          page('cost/markets', async () => ({ Component: (await import('@/pages/cost/Cost')).Markets })),

          // Directory
          { path: 'directory', element: <Navigate to="/directory/buyers" replace /> },
          page('directory/buyers', async () => ({ Component: (await import('@/pages/directory/Directory')).Buyers })),
          page('directory/sellers', async () => ({ Component: (await import('@/pages/directory/Directory')).Sellers })),
          page('directory/compliance', async () => ({ Component: (await import('@/pages/directory/Directory')).Compliance })),
          page('directory/events', async () => ({ Component: (await import('@/pages/directory/Directory')).Events })),

          // Policy and development
          { path: 'policy', element: <Navigate to="/policy/agreements" replace /> },
          page('policy/agreements', async () => ({ Component: (await import('@/pages/policy/Policy')).Agreements })),
          page('policy/interventions', async () => ({ Component: (await import('@/pages/policy/Policy')).Interventions })),
          page('policy/funders', async () => ({ Component: (await import('@/pages/policy/Policy')).Funders })),
          page('policy/calls', async () => ({ Component: (await import('@/pages/policy/Policy')).Calls })),

          // Data
          { path: 'data', element: <Navigate to="/data/explorer" replace /> },
          page('data/explorer', async () => ({ Component: (await import('@/pages/data/Data')).Explorer })),
          page('data/apis', async () => ({ Component: (await import('@/pages/data/Data')).Apis })),
          page('data/sources', async () => ({ Component: (await import('@/pages/data/Data')).Sources })),

          // About
          page('about', async () => { const A = (await import('@/pages/about/About')).default; return { Component: () => <A page="about" /> }; }),
          page('about/methods', async () => { const A = (await import('@/pages/about/About')).default; return { Component: () => <A page="methods" /> }; }),
          page('about/terms', async () => { const A = (await import('@/pages/about/About')).default; return { Component: () => <A page="terms" /> }; }),

          // Account (M2)
          page('signin', async () => ({ Component: (await import('@/pages/account/Auth')).SignIn })),
          page('signup', async () => ({ Component: (await import('@/pages/account/Auth')).SignUp })),
          page('reset', async () => ({ Component: (await import('@/pages/account/Auth')).Reset })),
          page('account', async () => ({ Component: (await import('@/pages/account/Auth')).Account })),
          page('account/saved', async () => ({ Component: (await import('@/pages/account/Saved')).default })),
          placeholder('account/alerts', 'page.alerts'),
          placeholder('account/api-keys', 'page.apiKeys'),
          placeholder('notifications', 'page.notifications'),

          // Organisation (M9)
          placeholder('org', 'page.org'),
          placeholder('org/members', 'page.members'),
          placeholder('org/settings', 'page.settings'),

          // Contribute (M7)
          placeholder('contribute', 'page.contribute'),

          // Admin (role-gated from M2; pages from M7–M9)
          staff('admin', 'page.adminHome'),
          staff('admin/review', 'page.adminReview'),
          staff('admin/directory', 'page.adminDirectory'),
          staff('admin/content', 'page.adminContent'),
          staff('admin/prices', 'page.adminPrices'),
          staff('admin/duties', 'page.adminDuties'),
          staff('admin/sources', 'page.adminSources'),
          staff('admin/datasets', 'page.adminDatasets'),
          staff('admin/ingest', 'page.adminIngest'),
          staff('admin/users', 'page.adminUsers'),
          staff('admin/organisations', 'page.adminOrganisations'),
          staff('admin/audit', 'page.adminAudit'),
          staff('admin/settings', 'page.adminSettings'),

          // System
          { path: 'offline', element: <Offline /> },
          { path: 'maintenance', element: <Maintenance /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
];

/** Opt in to React Router v7 behaviour now, so the later upgrade changes nothing. */
export const routerFuture = {
  v7_relativeSplatPath: true,
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_partialHydration: true,
  v7_skipActionErrorRevalidation: true,
} as const;

export const createRouter = () => createBrowserRouter(routes, { future: routerFuture });
