/**
 * Migrates the legacy interface translations (the I18N block in legacy/platform_v33.html) into
 * locales/<lang>/legacy.json (phrases) and locales/<lang>/names.json (country, food and place names).
 *
 * The legacy dictionary is keyed by the English phrase, with [fr, pt, ar, sw] values. Placeholders
 * such as [1] (a number) and [N1] (a name) are kept as they are; the web app's legacy translator
 * fills them in the same way the legacy page did.
 *
 * Usage: pnpm i18n:migrate   (or: tsx tools/migrate-i18n.ts <path-to-legacy-html>)
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = resolve(root, process.argv[2] ?? 'legacy/platform_v33.html');
const LANGS = ['en', 'fr', 'pt', 'ar', 'sw'] as const;

const html = readFileSync(htmlPath, 'utf8');
const line = html.split(/\r?\n/).find((l) => /^\s*const T = \{/.test(l));
if (!line) throw new Error(`No "const T = {" line found in ${htmlPath}; is this the legacy page?`);

type Dict = Record<string, string[]>;
// The line is the legacy page's own declaration list: const T = {...}, H1 = [...], LEAD = [...], NM = {...}, LANGS = [...];
const evaluate = new Function(`${line}\nreturn { T, H1, LEAD, NM, LANGS };`) as () => {
  T: Dict;
  H1: string[];
  LEAD: string[];
  NM: Dict;
  LANGS: string[];
};
const { T, H1, LEAD, NM, LANGS: legacyLangs } = evaluate();

if (legacyLangs.join() !== LANGS.join()) {
  throw new Error(`Legacy languages ${legacyLangs.join()} differ from ${LANGS.join()}`);
}

function build(dict: Dict, langIndex: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(dict).sort()) {
    const values = dict[key]!;
    if (values.length !== 4) throw new Error(`Entry "${key}" has ${values.length} translations, expected 4`);
    out[key] = langIndex < 0 ? key : (values[langIndex] ?? '');
    if (!out[key]) throw new Error(`Entry "${key}" is empty for ${LANGS[langIndex + 1]}`);
  }
  return out;
}

// The English hero heading and lead, as on the legacy page (index 0 = en).
const H1_EN = "<em>Africa's</em> food basket: grown, traded, imported";
const LEAD_EN =
  'What each country grows, consumes and buys of {{n}} foods, from cereals and roots to vegetables, fruits, meat, fish, milk, coffee, tea and cocoa. What it will need by {{y}}, and what it would take to grow more of its own.';

LANGS.forEach((lang, li) => {
  const i = li - 1; // -1 for English
  const dir = join(root, 'locales', lang);
  mkdirSync(dir, { recursive: true });
  const phrases = build(T, i);
  phrases['__hero.h1'] = i < 0 ? H1_EN : H1[i]!;
  phrases['__hero.lead'] = i < 0 ? LEAD_EN : LEAD[i]!.replace('{n}', '{{n}}').replace('{y}', '{{y}}');
  writeFileSync(join(dir, 'legacy.json'), JSON.stringify(phrases, null, 0) + '\n');
  writeFileSync(join(dir, 'names.json'), JSON.stringify(build(NM, i), null, 0) + '\n');
  console.log(`${lang}: ${Object.keys(phrases).length} phrases, ${Object.keys(NM).length} names`);
});
