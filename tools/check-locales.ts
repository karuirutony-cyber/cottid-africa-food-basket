/**
 * Fails (exit 1) when any language is missing a key, has an empty value, or drops an
 * interpolation variable ({{x}}) or a legacy placeholder ([1], [N1]) that English uses.
 * English is the reference: every locales/en/*.json file must exist in every language.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'locales');
const LANGS = ['en', 'fr', 'pt', 'ar', 'sw'];
const REF = 'en';

type Json = { [k: string]: Json | string };
function flatten(obj: Json, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else flatten(v, key, out);
  }
  return out;
}
const vars = (s: string) =>
  [...s.matchAll(/\{\{\s*(\w+)\s*\}\}|\[(N?\d+)\]/g)].map((m) => m[1] ?? m[2]).sort().join(',');

const errors: string[] = [];
const files = readdirSync(join(root, REF)).filter((f) => f.endsWith('.json'));
for (const file of files) {
  const ref = flatten(JSON.parse(readFileSync(join(root, REF, file), 'utf8')));
  for (const lang of LANGS.filter((l) => l !== REF)) {
    const path = join(root, lang, file);
    if (!existsSync(path)) {
      errors.push(`${lang}/${file}: file missing`);
      continue;
    }
    const tr = flatten(JSON.parse(readFileSync(path, 'utf8')));
    let missing = 0;
    for (const [key, en] of Object.entries(ref)) {
      const v = tr[key];
      if (v === undefined || v.trim() === '') {
        if (missing++ < 10) errors.push(`${lang}/${file}: missing "${key}"`);
        continue;
      }
      // Names (names.json) may legitimately differ in placeholders; phrases may not.
      if (file !== 'names.json' && vars(en) !== vars(v)) {
        errors.push(`${lang}/${file}: "${key}" placeholders differ (${vars(en)} vs ${vars(v)})`);
      }
    }
    if (missing > 10) errors.push(`${lang}/${file}: …and ${missing - 10} more missing keys`);
    for (const key of Object.keys(tr)) if (!(key in ref)) errors.push(`${lang}/${file}: extra key "${key}"`);
  }
}

if (errors.length) {
  console.error(`Locale check failed (${errors.length}):\n` + errors.slice(0, 80).join('\n'));
  process.exit(1);
}
console.log(`Locales OK: ${files.length} namespaces × ${LANGS.length} languages`);
