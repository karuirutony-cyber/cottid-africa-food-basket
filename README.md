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
3. **Authentication → Sign-in method**: enable Google and Email/Password; enable **TOTP multi-factor authentication**. *(M2.)*
4. **App Check**: register the web app with reCAPTCHA Enterprise. *(M10.)*
5. **Extensions**: install **Trigger Email**. *(M9.)*
6. **Secret Manager**: store `COMTRADE_KEY`. *(M9.)*

### Deploying from CI

GitHub Actions runs lint, typecheck, locale check, unit tests, build and the Playwright journeys on every push. On `main` it then deploys to the Hosting preview channel `next` (not the live site, until the new app reaches parity with the legacy page). To enable it, add a repository secret `FIREBASE_SERVICE_ACCOUNT_COTTID_72D51` holding a service-account key JSON with the *Firebase Hosting Admin* role (`firebase init hosting:github` creates one for you).

## Languages

English, French, Portuguese, Arabic (laid out right to left) and Swahili. Strings live in `locales/<lang>/*.json`; English is the reference and `pnpm check:locales` (run in CI) fails on any missing key or placeholder. Numbers and dates are formatted per locale (Arabic keeps Latin digits, matching the sources).

**To add a language:** add its code to `LANGS` in `packages/schema/src/index.ts`, copy `locales/en` to `locales/<code>` and translate every value, add the language's own name to `apps/web/src/components/LanguageSelect.tsx` and its locale to `apps/web/src/lib/format.ts`, then run `pnpm check:locales`.

## Making the first admin

From M1: sign in once on the site, then run `pnpm make-admin you@example.com`.

---

© 2026 Cottid Africa. All rights reserved.
