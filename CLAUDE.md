# Working on this repository

- The full brief is `legacy/BUILD_PROMPT.md`. Work milestone by milestone (M0 to M10); do not start the next while the current one's checks fail.
- `legacy/platform_v33.html` is the data source of truth. Never invent data: every figure keeps its source ID; gaps read "Data not available".
- pnpm workspaces. Before committing, run `pnpm verify` (lint, typecheck, locale check, unit tests, build) and `pnpm --filter @afb/web e2e`.
- Every new interface string goes into all five `locales/<lang>/common.json` files; `pnpm check:locales` enforces it.
- Use logical CSS properties only (Arabic is right to left). Decorative art is `aria-hidden` and carries the `decor` class (hidden in print).
- Initial JavaScript budget: under 250 KB gzipped. Lazy-load Firebase, charts, the map and admin.
- Until parity (M4), deploy only to the Hosting preview channel `next`; the live site still serves the legacy page.
