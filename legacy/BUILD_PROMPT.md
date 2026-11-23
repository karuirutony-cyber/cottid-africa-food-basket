# Build prompt: Africa Food Basket Platform (Cottid Africa)

Paste everything below the line into Claude Code, opened in the `cottid` folder.

---

You are the lead engineer building the production version of the **Africa Food Basket Platform** for Cottid Africa. The audience is governments, the African Union, UN agencies, development banks, investors and food traders, so build to an institutional standard: secure, accessible, fast on weak connections, and every figure traceable to its source.

## 0. How to work

1. Read this whole prompt first. Then inspect the folder. If `docs/PROJECT_SPEC.md` and `CLAUDE.md` exist (from the v33 repository zip), read them; this prompt overrides them where they differ.
2. Work **milestone by milestone** (section 9). For each one: plan briefly, build, run the checks, commit with a clear message, and tell me what is done and what I must do in the Firebase console, if anything. Do not start the next milestone while the current one's checks fail.
3. **Never invent data.** Every number comes from the legacy page or an official source, and keeps its source ID. Where data is missing, the UI shows "Data not available".
4. **Parity first:** every figure the legacy page shows must appear identically in the new app before you add anything new.
5. Keep it simple. No libraries beyond those listed unless one saves real effort; justify any addition in the commit message.
6. Ask me only when blocked by a decision that is mine (pricing, legal text, domain). Otherwise choose the sensible default and note it.

## 1. Source of truth for data

The working prototype is `legacy/platform_v33.html`, a single page with all data embedded as JavaScript constants: `TS` (balances, macro, prices, climate, foods, backtest), `LIB` (cost-of-imports library: commodities, origins, markets, duties, freight, FX), `REG` (buyers, suppliers, compliance), `SRC` (sources), `NUT` (diet), `FT` (food trade), `SELL` (sellers), `CALLS`, `EVENTS`, `POL` (policies), `DEVT` (interventions and funders), `ABOUT`, `MAP`, `APIS`, plus the engines `CottidForecast`, `CottidAdvisor` and `CottidStaples`, and the interface strings in five languages (`I18N`). If the file is elsewhere, find it; if it is missing, stop and ask me for it.

Write `tools/extract.ts`: it parses each constant from the legacy page into `data/legacy/*.json` and fails if any is missing. Checks after extraction: 54 countries, 34 foods in 9 groups, 275 sources, 161 buyers, 38 suppliers, 107 compliance entries, 35 events, Africa food imports 2024 = US$77.6 billion, exports = US$38.2 billion.

## 2. Stack

- **Monorepo** with pnpm workspaces: `apps/web`, `functions`, `packages/engines`, `packages/schema`, `packages/ui`, `tools`.
- **Web:** React 18, TypeScript (strict), Vite, React Router 6, TanStack Query, React Hook Form with Zod, Tailwind with CSS variables for tokens, Radix primitives, ECharts for charts, d3-geo for the Africa map, i18next, vite-plugin-pwa (Workbox).
- **Firebase (JS SDK v13):** Authentication (Google, Email/Password), Firestore with persistent local cache, Cloud Functions 2nd gen on Node 20, Storage, Hosting, App Check with reCAPTCHA Enterprise. **No Google Analytics:** the Terms promise no tracking cookies. Keep `measurementId` in the config but do not call `getAnalytics`.
- **Tests:** Vitest (units and engines), `@firebase/rules-unit-testing` (every rule), Playwright (journeys at 1280 px and 400 px), axe-core (accessibility).
- **CI:** GitHub Actions: lint, typecheck, test, build on every push; deploy to Firebase on `main` after all checks pass.

Firebase web config (public identifiers, not secrets; put it in `apps/web/src/lib/firebase.ts`, overridable with `VITE_FIREBASE_*` env vars):

```ts
export const firebaseConfig = {
  apiKey: "AIzaSyDcr9GjSDlrUWL_chpsxBvDQKBTKxeaTRE",
  authDomain: "cottid-72d51.firebaseapp.com",
  projectId: "cottid-72d51",
  storageBucket: "cottid-72d51.firebasestorage.app",
  messagingSenderId: "237588065418",
  appId: "1:237588065418:web:f983f4077f2c2682cc1173",
  measurementId: "G-MQ08CVE5EF",
};
```

`.firebaserc` default project: `cottid-72d51`. Functions region: `africa-south1` (if a feature is unavailable there, use `europe-west1` for that function and say so).

## 3. Firestore: collections that create themselves

Collections must never need creating by hand.

1. **On first sign-in**, the client calls the callable function `ensureProfile`, which creates `users/{uid}` (role `member`) and, if `settings/platform` is missing, creates it with defaults.
2. **Bootstrap:** the HTTPS function `bootstrap` (admin only, or run locally via `pnpm seed`) creates every reference collection from `data/legacy/*.json`. It is idempotent: it writes in batches of 400 and uses `set` with merge, so it can be rerun safely. Seed runs with the Admin SDK, using `GOOGLE_APPLICATION_CREDENTIALS` or `gcloud auth application-default login`. Log what was written per collection.
3. **First admin:** `pnpm make-admin you@example.com` sets that user's role to `super_admin` (the user must have signed in once). Document this in the README.

Collections (documents under 1 MiB; split by country or food where needed):

| Collection | Doc ID | Contents |
| --- | --- | --- |
| `meta/dataset` | fixed | version, built date, source counts, record years, projection horizon |
| `settings/platform` | fixed | languages, feature flags, API quotas |
| `countries` | ISO2 | name (5 languages), region, blocs, macro series |
| `foods` | food id | names (5 languages), group, units, basis, HS codes |
| `series` | `{iso2}_{food}` | production, imports, exports, use, stocks by year, with a source ID per value |
| `nutrition` | `{iso2}` | kcal and protein per person by food and year |
| `trade` | `{year}_{iso2}` | customs imports by supplier and exports by destination per food |
| `projections` | `{iso2}_{food}_{scenario}` | baseline outputs (recomputed by the engine) |
| `prices`, `fx`, `duties`, `rateCards` | as needed | cost-of-imports library inputs, each dated with a source |
| `buyers`, `suppliers`, `compliance`, `events`, `calls`, `policies`, `interventions`, `funders` | legacy ref or slug | directory and policy records with `status` (verified or lead), `checked` date, source IDs |
| `sources` | source ID | title, publisher, URL, date read |
| `users/{uid}` | auth uid | name, email, role, org, language, createdAt, lastSeen |
| `users/{uid}/saved` | auto | saved views and scenarios |
| `users/{uid}/alerts` | auto | followed countries, foods, prices, rules, call deadlines |
| `organisations/{orgId}` (+ `members`, `invites`) | auto | workspace, plan, members and org roles |
| `submissions` | auto | proposed corrections or new records: uid, target, text, source URL, status |
| `datasets/{version}` | version | build record, checks passed, published or rolled back |
| `apiKeys` | hash | owner, org, quota, usage |
| `auditLog` | auto | actor, action, target, before and after, time |

Add `firestore.indexes.json` for every compound query you use.

## 4. Roles and security

Platform roles, lowest to highest: `visitor` (not signed in), `member`, `contributor`, `verifier`, `content_editor`, `data_steward`, `platform_admin`, `super_admin`. Organisation roles: `org_member`, `org_analyst`, `org_admin`.

- Store the role in `users/{uid}.role` **and** mirror it to a custom claim from a Firestore trigger, so rules can use `request.auth.token.role` without an extra read.
- Public reference collections: read for all; write only for `data_steward` and above (or through functions).
- Users: create own profile only as `member`; never change own `role`, `email` or `createdAt`; admins change roles.
- Submissions: any signed-in user creates (status `pending`, text up to 4,000 characters); a user reads their own; verifiers and above read all and change only `status`, `reviewer`, `reviewedAt` and `note`.
- Audit log: written by functions only; read by `platform_admin` and above.
- Default deny.
- Two-step verification (TOTP) required for `verifier` and above; enforce it in the UI and in functions.
- Every permission in this list gets a passing rules test.

## 5. Pages (routes)

All public pages work without an account. Use the eight sections and names exactly as below.

- **Home** `/`: Africa map coloured by self-sufficiency, imports, trade balance, kcal or protein; country and food finder; task cards; coverage strip; global search.
- **Countries** `/countries`, `/countries/:iso2`, `/countries/:iso2/diet`, `/countries/:iso2/trade`, `/compare`.
- **Analytics** `/analytics/planner`, `/analytics/projections`, `/analytics/review`, `/analytics/advisory`, `/analytics/briefs` (PDF brief in any language).
- **Cost of Imports** `/cost/matrix`, `/cost/calculator`, `/cost/origins`, `/cost/markets`.
- **Directory** `/directory/buyers`, `/directory/sellers`, `/directory/compliance`, `/directory/events`.
- **Policy and development** `/policy/agreements`, `/policy/interventions`, `/policy/funders`, `/policy/calls`.
- **Data** `/data/explorer`, `/data/apis`, `/data/sources`.
- **About** `/about`, `/about/methods`, `/about/terms`.
- **Account:** `/signin`, `/signup`, `/reset`, `/account` (profile, language, two-step), `/account/saved`, `/account/alerts`, `/account/api-keys`, `/notifications`.
- **Organisation:** `/org`, `/org/members`, `/org/settings`.
- **Contribute:** `/contribute` (suggest a correction or new record; a "Suggest a correction" button on every page pre-fills the page and item).
- **Admin** (role-gated): `/admin` dashboard, `/admin/review` (queue with approve, reject and publish), `/admin/directory`, `/admin/content`, `/admin/prices`, `/admin/duties`, `/admin/sources`, `/admin/datasets` (build, publish, roll back), `/admin/ingest` (runs and logs), `/admin/users`, `/admin/organisations`, `/admin/audit`, `/admin/settings`.
- **System:** 404, offline page, maintenance page.

Each data page shows its sources and as-of date, a confidence grade where relevant, and CSV and PNG export.

## 6. Engines

Port `CottidForecast`, `CottidAdvisor` and `CottidStaples` (cost of imports) and the planner to TypeScript in `packages/engines`, as pure functions. Write golden-file tests: run the legacy engines in Node over at least 20 country, food and scenario cases, save the outputs, and require the TypeScript versions to match within 1e-6. Functions use the same package.

## 7. Cloud Functions

`ensureProfile`, `syncRoleClaim` (Firestore trigger), `bootstrap`, `submit` and `review` (with audit), `publishRecord`, `buildDataset`, `publishDataset`, `rollbackDataset`, `scheduledIngest` (weekly: FAOSTAT, World Bank, UN WPP, UN Comtrade with the secret `COMTRADE_KEY` from Secret Manager; publishes only if checks pass), `generateBrief` (PDF to Storage), `alerts` (daily; email through the Trigger Email extension), `api` (HTTPS `/api/v1/...` with API key, per-key quota, OpenAPI at `/api/v1/openapi.json`). All inputs are validated with Zod, and every write by staff is audited.

## 8. Look, language, access and performance

- **Brand:** "Africa Food Basket" by Cottid Africa. Footer: "© 2026 Cottid Africa. All rights reserved." No personal credits anywhere.
- **Tone:** millet cream page `#FBF3E6`; clay `#B5542B`, ochre `#D99A2B`, sisal `#E9D3A3`, leaf `#3C7A3B`, earth `#3A2416`, paprika `#C22E16`.
- **Section food colours:** Countries `#C8321B`, Analytics `#B07A00`, Cost of Imports `#8A5A26`, Directory `#17707F`, Policy and development `#2E7D32`, Data `#7A3B1D`, About `#B3261E`.
- **Patterns** (port the SVG from the legacy CSS variables `--shuka`, `--kiondo` and `--mosaic`, and the `FOODART` scenes as React components): a shuka strip under the top bar, kiondo bands under section headers and above the footer, and a heritage mosaic behind the home hero. Decorative art is `aria-hidden` and hidden in print.
- **Type:** Fraunces for headings, Figtree for text. Plain, active, sentence-case copy.
- **Languages:** en, fr, pt, ar (whole layout right to left; use logical CSS properties only) and sw. Migrate the legacy translations into `locales/<lang>/*.json`; CI fails if any key is missing in any language. Numbers and dates are formatted per locale.
- **Accessibility:** WCAG 2.2 AA, keyboard-complete, visible focus, axe-clean.
- **PWA:** installable; offline shell; reference data cached stale-while-revalidate; the user's saved items available offline.
- **Performance budget:** home page LCP under 2.5 s on a 4G phone; initial JavaScript under 250 KB gzipped (lazy-load charts, the map and admin).

## 9. Milestones and checks

| # | Deliver | Done when |
| --- | --- | --- |
| M0 | Monorepo, tooling, Firebase config, app shell, routing, tokens, five languages, PWA | App builds; installs; shell works offline; CI green |
| M1 | `extract`, `seed`, `make-admin`, `bootstrap`, rules and indexes | Seed creates every collection from empty; the counts in section 1 match; rules tests pass |
| M2 | Auth (Google, email with verification and reset), `ensureProfile`, role claims, two-step for staff | Sign-up, sign-in, reset and role gating pass in Playwright |
| M3 | Engines package with golden tests | All golden cases match |
| M4 | Home and Countries | Figures match legacy for Kenya, Nigeria, Egypt and Ethiopia |
| M5 | Analytics with saved scenarios and briefs | A saved plan reloads identically; a PDF brief generates |
| M6 | Cost of Imports | Five reference calculations match legacy |
| M7 | Directory, Policy and development, Contribute | A suggestion flows through review to a published record with an audit entry |
| M8 | Data explorer, downloads, public API with keys and quotas | API returns correct data; over-quota is refused |
| M9 | Organisations, alerts, admin console, dataset publish and rollback, weekly ingest | A dataset publishes and rolls back; an alert fires |
| M10 | Hardening: accessibility, performance, security headers, App Check, error pages, README | All budgets met; axe clean; deploys from CI |

## 10. Definition of done (whole project)

- `pnpm i && pnpm dev` runs locally against the Firebase emulators; `pnpm seed` fills an empty project; `pnpm deploy` publishes.
- All tests pass in CI; Playwright journeys pass at 1280 px and 400 px; no console errors.
- Every figure shows its source; no invented data; gaps read "Data not available".
- `README.md` covers setup, emulators, seeding, making the first admin, deploying, the Firebase console steps, and how to add a language or a data source.

**Firebase console steps for me** (list them in the README and remind me at the right milestone): create the Firestore database in `africa-south1`; add the Hosting domain to Authentication's authorised domains; enable App Check; install the Trigger Email extension; store `COMTRADE_KEY` in Secret Manager; enable TOTP multi-factor authentication.

Start with M0 now. First, show me the folder layout you will create and the commands I should run, then build.
