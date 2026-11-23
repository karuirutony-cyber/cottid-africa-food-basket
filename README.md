# Africa Food Basket

**Africa Food Basket** by Cottid Africa: production, consumption, trade, diets and projections for 34 foods in 54 African countries, every figure sourced. Built for governments, the African Union, UN agencies, development banks, investors and food traders.

This repository is the production rebuild of the single-page prototype in `legacy/platform_v33.html`, which stays the source of truth for data until every figure has been reproduced (parity first).

## Folder layout

| Path | What it is |
| --- | --- |
| `apps/web` | The web app: React 18, TypeScript, Vite, React Router, TanStack Query, Tailwind, i18next, PWA |
| `functions` | Cloud Functions (2nd gen, Node 20, region `africa-south1`), bundled with esbuild |
| `packages/schema` | Shared types and Zod schemas: languages, roles, records |
| `packages/engines` | Forecast, advisor, cost-of-imports and planner engines (ported in M3) |
| `packages/ui` | Brand tokens and craft patterns (shuka, kiondo, heritage mosaic, the Cottid mark) |
| `tools` | Data and i18n tools (`migrate-i18n`, `check-locales`; `extract`, `seed`, `make-admin` from M1) |
| `locales/<lang>` | Interface strings: `common.json` (app), `legacy.json` and `names.json` (migrated from the legacy page) |
| `legacy` | The v33 prototype, the build prompt, and the previous v34 Firebase page setup (kept for reference) |
| `firestore.rules`, `storage.rules`, `firestore.indexes.json` | Security rules and indexes |

## Setup (Windows, macOS or Linux)

You need **Node.js 20 or later**, **pnpm 9** (`npm i -g pnpm@9`) and **Git**. For the Firebase emulators (from M1) you also need **Java 21** (for example `winget install EclipseAdoptium.Temurin.21.JRE`).

```
pnpm install
pnpm dev:web        # the app alone, at http://localhost:5173
pnpm dev            # the app against the local Firebase emulators (needs Java)
```

Other commands:

| Command | What it does |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Checks, as CI runs them |
| `pnpm check:locales` | Fails if any language is missing a key or a placeholder |
| `pnpm i18n:migrate` | Re-imports the legacy page's translations into `locales/*/legacy.json` and `names.json` |
| `pnpm build` | Builds the web app and the functions |
| `pnpm --filter @afb/web e2e` | Playwright journeys at 1280 px and 400 px, with axe accessibility checks (run `pnpm build` first) |
| `pnpm deploy` | Builds and publishes to the Hosting preview channel `next` |
| `pnpm deploy:live` | Builds and publishes Hosting, Firestore rules and Storage rules to the live site |

`pnpm firebase login` signs the Firebase CLI in (once per machine).

## Data pipeline

Every figure comes from `legacy/platform_v33.html` and keeps its source ID.

| Command | What it does |
| --- | --- |
| `pnpm extract` | Parses every data constant (TS, LIB, REG, SRC, NUT, FT, SELL, CALLS, EVENTS, POL, DEVT, DEVF, PROG, ABOUT, MAP, APIS) into `data/legacy/*.json`, and the three engines verbatim into `packages/engines/src/legacy/` |
| `pnpm build:data` | Checks the counts (54 countries, 34 foods in 9 groups, 275 sources, 161 buyers, 38 suppliers, 107 compliance entries, 35 events, Africa food imports 2024 US$77.6 bn, exports US$38.2 bn) and publishes the datasets to `apps/web/public/data/`. Fails, and publishes nothing, if any check fails |
| `pnpm capture` | Runs the legacy page in headless Chromium to record the About, Methods and Terms text (`data/content/`) and golden engine outputs (`packages/engines/test/golden.json`) |

`pnpm build` runs `extract` and `build:data` first. The web app reads the datasets from Hosting (`/data/*.json`), cached stale-while-revalidate by the service worker, so data pages work offline once opened. Seeding the same data into Firestore collections is the next milestone (M1).

**Parity checks.** The engines are the legacy code itself, wrapped as modules; `packages/engines` golden tests require their outputs to match what the legacy page computes within 1e-6. The Playwright test `e2e/parity.spec.ts` opens the legacy page and the new app side by side and requires the Kenya, Nigeria, Egypt and Ethiopia summaries to read identically.

## Firebase

Project `cottid-72d51`. The web config lives in `apps/web/src/lib/firebase.ts` and can be overridden with `VITE_FIREBASE_*` variables (see `apps/web/.env.example`). The SDK loads lazily, so it does not count toward the initial JavaScript budget. Google Analytics is never initialised: the Terms promise no tracking cookies.

### Firebase console steps

Do these once, in the Firebase console for `cottid-72d51`:

1. **Firestore**: create the database in **africa-south1** (production mode), if it does not exist yet. *(Needed from M1.)*
2. **Authentication → Settings → Authorised domains**: add the Hosting domains (`cottid-72d51.web.app`, the `next` preview channel domain, and any custom domain). *(M2.)*
3. **Authentication → Sign-in method**: enable Google and Email/Password. TOTP multi-factor needs **Identity Platform** (Authentication → Settings → upgrade), then enable it with `gcloud` or the REST call in the Firebase docs ("Add TOTP multi-factor authentication"). *(M2.)*
4. **Blaze plan**: Cloud Functions need the pay-as-you-go plan. *(M1.)*
5. **Storage**: open Storage once so the default bucket exists; dataset snapshots are kept under `datasets/`. *(M9.)*
6. **Extensions**: install **Trigger Email**, reading the `mail` collection, with your SMTP or SendGrid details. Until then alert and invitation e-mails wait in `mail`. *(M9.)*
7. **App Check**: register the web app with **reCAPTCHA Enterprise**, put the site key in `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` (a GitHub Actions variable, or `apps/web/.env.production`), deploy, watch the App Check metrics until almost all requests carry tokens, then set `APPCHECK_ENFORCE=true` in `functions/.env.cottid-72d51` and enforce App Check for Firestore in the console. *(M10.)*
8. **Secret Manager**: store `COMTRADE_KEY` when the Comtrade ingest is switched on. *(Later.)*

### Deploying

- **Preview** (safe at any time): `pnpm deploy` publishes the app to the Hosting channel `next`. Every push to `main` does the same from CI.
- **Live** (replaces the current site, deploys functions, rules and indexes): `pnpm deploy:live`, or run the CI workflow by hand with target `live`. **Before the first live deploy**, note that the new security rules replace the old page's rules: the v34 page's own collections (`published_*`, `signups`) become unreadable. Seed first (`pnpm seed`), check the preview, then go live.

### Deploying from CI

GitHub Actions (`.github/workflows/ci.yml`) runs, on every push: lint, typecheck, the locale check, unit and golden tests, the build, the performance budget, the security-rules tests, the public journeys (1280 px and 400 px, axe, parity with the legacy page, 4G LCP, all under the production Content Security Policy), the emulator journeys (accounts, contributions, API, datasets, alerts, maintenance) and the seed check.

- On `main` it then deploys to the preview channel `next`.
- The live deploy runs only when someone starts the workflow by hand with target `live`, and only after the reviewers of the GitHub environment **production** approve it (Settings → Environments → production → Required reviewers).
- Secrets: `FIREBASE_SERVICE_ACCOUNT_COTTID_72D51`, a service-account key JSON with the roles *Firebase Admin* and *Cloud Functions Admin*, *Service Account User* (`firebase init hosting:github` creates one for Hosting; add the other roles in Google Cloud IAM).

## Security and performance

- **Headers** (`security-headers.json`, sent by Hosting and by `vite preview`, so every journey runs under them): a Content Security Policy with no inline or `eval` scripts, `frame-ancestors 'none'`, HSTS, `nosniff`, a strict referrer policy and a closed permissions policy. A unit test fails if `firebase.json` drifts from the file.
- **Roles and two-step**: staff actions need the role and a second factor in the rules and again in every function; every staff write is in `auditLog`.
- **Budgets**: initial JavaScript 130 KB gzipped (budget 250 KB, `pnpm check:budget`); home page LCP about 2.1–2.3 s on a throttled 4G phone (budget 2.5 s, `e2e/perf.spec.ts`). Firebase, charts, the map, admin and each section load only when needed.
- **Maintenance mode**: `/admin/settings` switches the public site to the maintenance page; staff, sign-in and admin pages stay reachable.
- **Error pages**: not found, offline (when a page has never been opened while connected), maintenance, and a general error page with a retry.

## Adding a data source

1. Add the source to `SRC` in the legacy page (or, once the legacy page is retired, to `data/legacy/SRC.json`) with an ID: `D` for datasets, `S` for quotes and notices, `A` for Cottid Africa estimates.
2. For a new time series, add its key to the balance or macro data and map the key to its source in `seriesSource()` (`tools/seed-lib.ts`).
3. For an automatic update, add a step to the ingest in `functions/src/datasets.ts` that reads the source, compares, and records differences in `ingestRuns`; publishing stays a data steward's decision.
4. Run `pnpm data` (the checks must still pass), then build and publish a new dataset version at `/admin/datasets`.
## Datasets, ingest, alerts and organisations

- **Dataset versions** (`/admin/datasets`, data stewards): *Build* snapshots the published `/data/*.json` to Cloud Storage (`datasets/{version}/`) and runs the section 1 checks; *Publish* writes the reference collections from a snapshot that passed every check and points `meta/dataset` at it; *Roll back* republishes the version that was live before. Every step is audited.
- **Weekly ingest** (`scheduledIngest`, Mondays 03:00 Nairobi; or *Run now* at `/admin/ingest`): compares the latest World Bank WDI population with the published dataset and records each difference in `ingestRuns` for a data steward. It never publishes on its own. FAOSTAT, UN WPP and UN Comtrade (`COMTRADE_KEY` in Secret Manager) are the next sources.
- **Alerts** (`/account/alerts`): follow calls closing soon or upcoming events, by country and food. The `alerts` function runs daily at 06:00 (Nairobi), writes `users/{uid}/notifications` (shown at `/notifications`) and, if asked, queues an e-mail in `mail` for the Trigger Email extension. A platform admin can run it now from `/admin/settings`. A notification is never sent twice for the same alert and item.
- **Organisations** (`/org`): create one, invite colleagues by e-mail (they accept at `/org` after signing in with that address), set roles (member, analyst, administrator), remove members. An organisation always keeps at least one administrator.
- **Admin console**: users and roles (`/admin/users`; nobody grants a role above their own), organisations, platform settings and API quotas, and direct record correction for directory, content, prices, duties and sources (each change needs a reason and is audited).

## Public API

`GET /api/v1/...` on the Hosting domain (rewritten to the `api` function in africa-south1). Read-only, over the seeded Firestore data; every value keeps its source ID.

- **Keys:** signed-in users create up to 5 keys at `/account/api-keys`. The key is shown once; only its SHA-256 hash is stored (`apiKeys/{hash}`). Send it as `X-API-Key`.
- **Quotas:** daily per key (default 10,000; set `settings/platform.apiQuotas.member`), reset 00:00 UTC. Responses carry `X-RateLimit-Limit` and `X-RateLimit-Remaining`; over quota returns 429 with `Retry-After`; missing or revoked keys return 401.
- **Endpoints:** `/meta`, `/countries`, `/countries/{iso2}`, `/foods`, `/series/{iso2}/{food}`, `/projections/{iso2}/{food}`, `/nutrition/{iso2}`, `/trade/{iso2}?year=`, `/buyers?country=`, `/suppliers`, `/sources`, `/sources/{id}`. Full description: `/api/v1/openapi.json` (no key needed).
- **Downloads:** each dataset is also published whole at `/data/<NAME>.json`, with `/data/manifest.json` listing the version and checks.

## Languages

English, French, Portuguese, Arabic (laid out right to left) and Swahili. Strings live in `locales/<lang>/*.json`; English is the reference and `pnpm check:locales` (run in CI) fails on any missing key or placeholder. Numbers and dates are formatted per locale (Arabic keeps Latin digits, matching the sources).

**To add a language:** add its code to `LANGS` in `packages/schema/src/index.ts`, copy `locales/en` to `locales/<code>` and translate every value, add the language's own name to `apps/web/src/components/LanguageSelect.tsx` and its locale to `apps/web/src/lib/format.ts`, then run `pnpm check:locales`.

## Firestore: seeding and roles

Collections create themselves; nothing is made by hand.

- **On first sign-in** the client calls the `ensureProfile` function, which creates `users/{uid}` (role `member`) and, if missing, `settings/platform` with defaults.
- **Seeding** builds every reference collection (countries, foods, series, nutrition, trade, projections, prices, fx, duties, rate cards, buyers, suppliers, compliance, events, calls, policies, interventions, funders, sources and `meta/dataset`, 4,633 documents). It writes in batches of 400 with merge, so it can be rerun safely, and logs the count per collection.
  - Against the live project: run `gcloud auth application-default login` once (or set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account key file kept outside the repository), then `pnpm seed`.
  - Against the emulators: `pnpm emulators` in one terminal, `pnpm seed:emulator` in another.
  - `pnpm seed -- --dry-run` builds and counts the documents without writing.
  - The `bootstrap` callable function does the same for a platform admin (with two-step), reading the published `/data/*.json` from Hosting.
- **Roles** live in `users/{uid}.role` and are mirrored to a custom claim by the `syncRoleClaim` trigger, so rules read `request.auth.token.role`. Staff roles (verifier and above) must use two-step verification (TOTP); rules and functions refuse staff actions without it.

### Making the first admin

1. Sign in once on the site (Google or e-mail).
2. Run `pnpm make-admin you@example.com` (default role `super_admin`; `--role data_steward` etc. for others). It uses the same credentials as `pnpm seed`, and writes an audit entry.
3. Sign out and in again, then turn on two-step verification at `/account`.

### Tests for security and sign-in

- `pnpm test:rules`: one test per permission in the security rules, on the Firestore emulator (22 tests).
- `pnpm e2e:auth`: sign-up with e-mail verification, sign-in, password reset and role gating, in a browser against the Auth, Firestore and Functions emulators, at 1280 px and 400 px.

---

© 2026 Cottid Africa. All rights reserved.
