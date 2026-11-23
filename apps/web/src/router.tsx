import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { Shell } from '@/components/Shell';
import Home from '@/pages/Home';
import Building from '@/pages/Building';
import { Maintenance, NotFound, Offline, RouteError } from '@/pages/SystemPage';

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
          placeholder('countries', 'page.countries'),
          placeholder('countries/:iso2', 'page.country'),
          placeholder('countries/:iso2/diet', 'page.diet'),
          placeholder('countries/:iso2/trade', 'page.trade'),
          placeholder('compare', 'page.compare'),

          // Analytics
          { path: 'analytics', element: <Navigate to="/analytics/planner" replace /> },
          placeholder('analytics/planner', 'page.planner'),
          placeholder('analytics/projections', 'page.projections'),
          placeholder('analytics/review', 'page.review'),
          placeholder('analytics/advisory', 'page.advisory'),
          placeholder('analytics/briefs', 'page.briefs'),

          // Cost of Imports
          { path: 'cost', element: <Navigate to="/cost/matrix" replace /> },
          placeholder('cost/matrix', 'page.matrix'),
          placeholder('cost/calculator', 'page.calculator'),
          placeholder('cost/origins', 'page.origins'),
          placeholder('cost/markets', 'page.markets'),

          // Directory
          { path: 'directory', element: <Navigate to="/directory/buyers" replace /> },
          placeholder('directory/buyers', 'page.buyers'),
          placeholder('directory/sellers', 'page.sellers'),
          placeholder('directory/compliance', 'page.compliance'),
          placeholder('directory/events', 'page.events'),

          // Policy and development
          { path: 'policy', element: <Navigate to="/policy/agreements" replace /> },
          placeholder('policy/agreements', 'page.agreements'),
          placeholder('policy/interventions', 'page.interventions'),
          placeholder('policy/funders', 'page.funders'),
          placeholder('policy/calls', 'page.calls'),

          // Data
          { path: 'data', element: <Navigate to="/data/explorer" replace /> },
          placeholder('data/explorer', 'page.explorer'),
          placeholder('data/apis', 'page.apis'),
          placeholder('data/sources', 'page.sources'),

          // About
          placeholder('about', 'page.about'),
          placeholder('about/methods', 'page.methods'),
          placeholder('about/terms', 'page.terms'),

          // Account (M2)
          placeholder('signin', 'page.signin'),
          placeholder('signup', 'page.signup'),
          placeholder('reset', 'page.reset'),
          placeholder('account', 'page.account'),
          placeholder('account/saved', 'page.saved'),
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
          placeholder('admin', 'page.adminHome'),
          placeholder('admin/review', 'page.adminReview'),
          placeholder('admin/directory', 'page.adminDirectory'),
          placeholder('admin/content', 'page.adminContent'),
          placeholder('admin/prices', 'page.adminPrices'),
          placeholder('admin/duties', 'page.adminDuties'),
          placeholder('admin/sources', 'page.adminSources'),
          placeholder('admin/datasets', 'page.adminDatasets'),
          placeholder('admin/ingest', 'page.adminIngest'),
          placeholder('admin/users', 'page.adminUsers'),
          placeholder('admin/organisations', 'page.adminOrganisations'),
          placeholder('admin/audit', 'page.adminAudit'),
          placeholder('admin/settings', 'page.adminSettings'),

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
