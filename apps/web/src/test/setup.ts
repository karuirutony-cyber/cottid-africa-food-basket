import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// jsdom has no layout; ScrollRestoration calls scrollTo.
window.scrollTo = () => {};

// Serve /data/* from apps/web/public (written by pnpm build:data), as Hosting does.
const publicDir = join(__dirname, '..', '..', 'public');
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  const path = join(publicDir, url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]!);
  if (!existsSync(path)) return new Response('Not found', { status: 404 });
  return new Response(readFileSync(path), { status: 200 });
}) as typeof fetch;
