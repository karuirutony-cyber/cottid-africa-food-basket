# Working on this repository

- The full brief is `legacy/BUILD_PROMPT.md`. Work milestone by milestone (M0 to M10); do not start the next while the current one's checks fail.
- `legacy/platform_v33.html` is the data source of truth. Never invent data: every figure keeps its source ID; gaps read "Data not available".
- pnpm workspaces. Before committing, run `pnpm verify` (lint, typecheck, locale check, unit tests, build) and `pnpm --filter @afb/web e2e`.
- Every new interface string goes into all five `locales/<lang>/common.json` files; `pnpm check:locales` enforces it.
- Use logical CSS properties only (Arabic is right to left). Decorative art is `aria-hidden` and carries the `decor` class (hidden in print).
- Initial JavaScript budget: under 250 KB gzipped. Lazy-load Firebase, charts, the map and admin.
- The live site is on Vercel (`vercel.json`), built from every push to `main`. Its server is `apps/web/api` (Vercel functions: `/api/v1`, `/api/action`, `/api/cron`), tested by `pnpm test:api`; it needs `FIREBASE_SERVICE_ACCOUNT` and `CRON_SECRET` in Vercel's environment. Firebase Hosting deploys go to the preview channel `next`; live Firebase deploys are manual (CI workflow_dispatch, target live).
- `vercel.json` and `firebase.json` must send `security-headers.json` unchanged (unit test in `apps/web/src/security.test.ts`).
