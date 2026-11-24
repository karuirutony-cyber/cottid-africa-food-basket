import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { Shell } from '@/components/Shell';
import Home from '@/pages/Home';
import type * as AdminMore from '@/pages/admin/AdminMore';
import { Maintenance, NotFound, Offline, RouteError } from '@/pages/SystemPage';

/** A staff page with its real component. */
const staffPage = (path: string, min: 'verifier' | 'data_steward' | 'platform_admin', name: 'Dashboard' | 'ReviewQueue' | 'AuditLog'): RouteObject => ({
  path,
  lazy: async () => {
    const [{ RequireRole }, admin] = await Promise.all([import('@/pages/account/Auth'), import('@/pages/admin/Admin')]);
    const C = admin[name];
    return { Component: () => <RequireRole min={min}><C /></RequireRole> };
  },
});

/** A staff page from AdminMore, behind a minimum role. */
const staffMore = (path: string, min: 'verifier' | 'data_steward' | 'platform_admin', pick: (m: typeof AdminMore) => React.ComponentType): RouteObject => ({
  path,
  lazy: async () => {
    const [{ RequireRole }, m] = await Promise.all([import('@/pages/account/Auth'), import('@/pages/admin/AdminMore')]);
    const C = pick(m);
    return { Component: () => <RequireRole min={min}><C /></RequireRole> };
  },
});

/** A lazily loaded page: each section is its own chunk, so the first load stays small. */
const page = (path: string, load: () => Promise<{ Component: React.ComponentType }>): RouteObject => ({ path, lazy: load });

/** Every route from section 5 of the build prompt; each section loads as its own chunk. */
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
          page('account/alerts', async () => ({ Component: (await import('@/pages/account/Alerts')).Alerts })),
          page('account/api-keys', async () => ({ Component: (await import('@/pages/account/ApiKeys')).default })),
          page('notifications', async () => ({ Component: (await import('@/pages/account/Alerts')).Notifications })),

          // Organisation (M9)
          page('org', async () => ({ Component: (await import('@/pages/org/Org')).OrgHome })),
          page('org/members', async () => ({ Component: (await import('@/pages/org/Org')).OrgMembers })),
          page('org/settings', async () => ({ Component: (await import('@/pages/org/Org')).OrgSettings })),

          // Contribute (M7)
          page('contribute', async () => ({ Component: (await import('@/pages/contribute/Contribute')).default })),

          // Admin (role-gated from M2; pages from M7–M9)
          {
            path: 'admin',
            lazy: async () => ({ Component: (await import('@/pages/admin/AdminLayout')).AdminLayout }),
            children: [
              { index: true, lazy: staffPage('', 'verifier', 'Dashboard').lazy },
              staffPage('review', 'verifier', 'ReviewQueue'),
              staffMore('directory', 'data_steward', (m) => () => <m.Records preset="directory" />),
              staffMore('content', 'data_steward', (m) => () => <m.Records preset="content" />),
              staffMore('prices', 'data_steward', (m) => () => <m.Records preset="prices" />),
              staffMore('duties', 'data_steward', (m) => () => <m.Records preset="duties" />),
              staffMore('sources', 'data_steward', (m) => () => <m.Records preset="sources" />),
              staffMore('datasets', 'data_steward', (m) => m.Datasets),
              staffMore('ingest', 'data_steward', (m) => m.Ingest),
              staffMore('users', 'platform_admin', (m) => m.Users),
              staffMore('organisations', 'platform_admin', (m) => m.Organisations),
              staffPage('audit', 'platform_admin', 'AuditLog'),
              staffMore('settings', 'platform_admin', (m) => m.Settings),
            ],
          },


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
