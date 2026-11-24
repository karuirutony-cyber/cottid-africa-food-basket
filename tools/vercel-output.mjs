/**
 * Vercel output: the web build lands in apps/web/dist. Vercel looks for the output directory ("dist")
 * relative to the project's Root Directory, which may be apps/web or the repository root, so a copy is
 * also placed at <repo>/dist. Run by `pnpm build:vercel`.
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'apps', 'web', 'dist');
const to = join(root, 'dist');
if (!existsSync(join(from, 'index.html'))) throw new Error('apps/web/dist is missing: the web build did not run.');
if (!existsSync(join(from, 'data', 'summary.json'))) throw new Error('apps/web/dist/data is missing: run pnpm data before building.');
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log('Vercel output ready: apps/web/dist and dist');
