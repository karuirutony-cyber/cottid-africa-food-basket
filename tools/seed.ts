/**
 * pnpm seed: fills every reference collection in Firestore from data/legacy/*.json.
 * Idempotent: writes in batches of 400 with set(..., { merge: true }), so it can be rerun safely.
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS (a service-account key) or `gcloud auth application-default login`.
 * Against the emulator: set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 (pnpm seed:emulator does this).
 * Project: --project <id> or FIREBASE_PROJECT, default cottid-72d51.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildDocs, countByCollection, LANGS, PLATFORM_DEFAULTS, type Datasets } from './seed-lib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const projectId = arg('project') ?? process.env.FIREBASE_PROJECT ?? 'cottid-72d51';
const dry = process.argv.includes('--dry-run');
if (process.argv.includes('--emulator')) process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

export function loadDatasets(): Datasets {
  const dir = join(root, 'data', 'legacy');
  if (!existsSync(join(dir, 'TS.json'))) throw new Error('data/legacy is empty: run pnpm extract first.');
  const j = (n: string) => JSON.parse(readFileSync(join(dir, `${n}.json`), 'utf8'));
  const names = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(join(root, 'locales', l, 'names.json'), 'utf8'))]));
  return {
    TS: j('TS'), LIB: j('LIB'), REG: j('REG'), SRC: j('SRC'), NUT: j('NUT'), FT: j('FT'), SELL: j('SELL'),
    CALLS: j('CALLS'), EVENTS: j('EVENTS'), POL: j('POL'), DEVT: j('DEVT'), DEVF: j('DEVF'), PROG: j('PROG'), names,
  };
}

async function main() {
  const docs = buildDocs(loadDatasets());
  const counts = countByCollection(docs);
  const biggest = docs.reduce((a, d) => Math.max(a, Buffer.byteLength(JSON.stringify(d.data))), 0);
  console.log(`Built ${docs.length} documents; largest ${(biggest / 1024).toFixed(0)} KB (limit 1,024 KB).`);
  if (biggest > 1_000_000) throw new Error('A document exceeds 1 MiB; split it before seeding.');
  if (dry) {
    console.table(counts);
    return;
  }

  if (!getApps().length) initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { projectId, credential: applicationDefault() });
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  console.log(`Seeding project ${projectId}${process.env.FIRESTORE_EMULATOR_HOST ? ` (emulator ${process.env.FIRESTORE_EMULATOR_HOST})` : ''}…`);

  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + 400)) batch.set(db.doc(d.path), d.data, { merge: true });
    await batch.commit();
    process.stdout.write(`\r  ${Math.min(i + 400, docs.length)} / ${docs.length}`);
  }
  process.stdout.write('\n');

  const settings = db.doc('settings/platform');
  if (!(await settings.get()).exists) {
    await settings.set(PLATFORM_DEFAULTS);
    counts.settings = 1;
  }
  for (const [coll, n] of Object.entries(counts).sort()) console.log(`  ${coll.padEnd(14)} ${n}`);
  console.log('Seed complete.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
