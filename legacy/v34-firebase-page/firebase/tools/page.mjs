// Finds the platform page in base/ and reads constants embedded in it (CALLS, EVENTS, REG, ABOUT ...).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function pagePath() {
  const files = readdirSync(join(ROOT, 'base')).filter((f) => f.endsWith('.html'));
  if (!files.length) throw new Error('Put the platform page (the .html file) in the base folder first.');
  if (files.length > 1) console.warn(`Several pages in base/, using ${files.sort().at(-1)}`);
  return join(ROOT, 'base', files.sort().at(-1));
}

export function readConst(html, name) {
  const tag = `const ${name} = `;
  const i = html.indexOf(tag);
  if (i < 0) return undefined;
  const j = html.indexOf(';\n', i);
  try { return JSON.parse(html.slice(i + tag.length, j)); } catch { return undefined; }
}

export const readPage = () => readFileSync(pagePath(), 'utf8');
