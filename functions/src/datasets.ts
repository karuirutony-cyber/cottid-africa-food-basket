/**
 * Dataset versions (section 7): buildDataset -> publishDataset -> rollbackDataset, and the weekly ingest.
 *
 * A version is a snapshot of the published datasets in Cloud Storage (datasets/{version}/*.json) plus a
 * record in datasets/{version} with its checks. Only a version whose checks all pass can be published.
 * Publishing writes the reference collections from the snapshot and points meta/dataset at it; rolling
 * back republishes the version that was live before.
 */
import './options';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import { z } from 'zod';
import { buildDocs, countByCollection, runChecks, type Datasets } from '../../tools/seed-lib';
import namesEn from '../../locales/en/names.json';
import namesFr from '../../locales/fr/names.json';
import namesPt from '../../locales/pt/names.json';
import namesAr from '../../locales/ar/names.json';
import namesSw from '../../locales/sw/names.json';
import { audit, requireStaff } from './review';

const db = () => getFirestore();
const bucket = () => getStorage().bucket();
export const DATA_BASE_URL = defineString('DATA_BASE_URL', { default: 'https://cottid-africa-food-basket.vercel.app' });
const NAMES = ['TS', 'LIB', 'REG', 'SRC', 'NUT', 'FT', 'SELL', 'CALLS', 'EVENTS', 'POL', 'DEVT', 'DEVF', 'PROG'] as const;
const names = { en: namesEn, fr: namesFr, pt: namesPt, ar: namesAr, sw: namesSw };

/** Reads the published datasets: from Hosting, or (emulator only) from the local build folder. */
export async function loadPublished(): Promise<Record<(typeof NAMES)[number], unknown>> {
  const local = process.env.FUNCTIONS_EMULATOR === 'true' ? process.env.LOCAL_DATA_DIR : undefined;
  const get = async (n: string) => {
    if (local) return JSON.parse(await readFile(join(process.cwd(), local, `${n}.json`), 'utf8'));
    const r = await fetch(`${DATA_BASE_URL.value().replace(/\/$/, '')}/data/${n}.json`);
    if (!r.ok) throw new Error(`Could not fetch ${n}.json (${r.status})`);
    return r.json();
  };
  const vals = await Promise.all(NAMES.map(get));
  return Object.fromEntries(NAMES.map((n, i) => [n, vals[i]])) as Record<(typeof NAMES)[number], unknown>;
}
const asDatasets = (raw: Record<string, unknown>) => ({ ...raw, names }) as unknown as Datasets;

async function snapshot(version: string, raw: Record<string, unknown>) {
  await Promise.all(
    Object.entries(raw).map(([n, v]) => bucket().file(`datasets/${version}/${n}.json`).save(JSON.stringify(v), { contentType: 'application/json', resumable: false })),
  );
}
async function readSnapshot(version: string): Promise<Record<string, unknown>> {
  const vals = await Promise.all(NAMES.map(async (n) => JSON.parse((await bucket().file(`datasets/${version}/${n}.json`).download())[0].toString('utf8'))));
  return Object.fromEntries(NAMES.map((n, i) => [n, vals[i]]));
}

async function writeCollections(D: Datasets) {
  const docs = buildDocs(D);
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db().batch();
    for (const d of docs.slice(i, i + 400)) batch.set(db().doc(d.path), d.data, { merge: true });
    await batch.commit();
  }
  return countByCollection(docs);
}

/** Build a version from the currently published files and run the checks. */
export async function build(actor: string, origin: string) {
  const raw = await loadPublished();
  const D = asDatasets(raw);
  const checks = runChecks(D);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const version = `v33-${D.TS.meta.built}-${stamp}`;
  await snapshot(version, raw);
  const passed = checks.every((c) => c.passed);
  await db().doc(`datasets/${version}`).set({
    version,
    built: D.TS.meta.built,
    builtAt: FieldValue.serverTimestamp(),
    builtBy: actor,
    origin,
    checks,
    checksPassed: passed,
    status: passed ? 'built' : 'failed_checks',
    snapshot: `datasets/${version}/`,
  });
  await audit(actor, 'buildDataset', `datasets/${version}`, null, { passed });
  return { version, passed, checks };
}

async function publish(version: string, actor: string, action: 'publishDataset' | 'rollbackDataset') {
  const rec = await db().doc(`datasets/${version}`).get();
  if (!rec.exists) throw new HttpsError('not-found', `No dataset ${version}.`);
  if (!rec.get('checksPassed')) throw new HttpsError('failed-precondition', 'This version failed its checks and cannot be published.');
  const meta = (await db().doc('meta/dataset').get()).data() ?? {};
  const current = (meta.version as string | undefined) ?? null;
  const counts = await writeCollections(asDatasets(await readSnapshot(version)));
  await db().doc('meta/dataset').set({ version, publishedAt: FieldValue.serverTimestamp(), publishedBy: actor, previous: action === 'publishDataset' ? current : (meta.previous ?? null) }, { merge: true });
  await db().doc(`datasets/${version}`).set({ status: 'published', publishedAt: FieldValue.serverTimestamp(), previous: action === 'publishDataset' ? current : rec.get('previous') ?? null }, { merge: true });
  if (current && current !== version) {
    const cur = db().doc(`datasets/${current}`);
    if ((await cur.get()).exists) await cur.set({ status: action === 'rollbackDataset' ? 'rolled_back' : 'superseded' }, { merge: true });
  }
  await audit(actor, action, `datasets/${version}`, { version: current }, { version, counts });
  return { version, previous: current, counts };
}

export const buildDataset = onCall({ timeoutSeconds: 300, memory: '1GiB' }, async (req) => {
  await requireStaff(req, 'data_steward');
  return build(req.auth!.uid, 'manual');
});

export const publishDataset = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (req) => {
  await requireStaff(req, 'data_steward');
  const { version } = z.object({ version: z.string().min(3).max(80) }).strict().parse(req.data ?? {});
  return publish(version, req.auth!.uid, 'publishDataset');
});

export const rollbackDataset = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (req) => {
  await requireStaff(req, 'data_steward');
  const meta = (await db().doc('meta/dataset').get()).data() ?? {};
  const current = meta.version as string | undefined;
  const prev = current ? ((await db().doc(`datasets/${current}`).get()).get('previous') as string | null) : null;
  if (!prev) throw new HttpsError('failed-precondition', 'There is no earlier published version to roll back to.');
  if (!(await db().doc(`datasets/${prev}`).get()).exists) throw new HttpsError('not-found', `The earlier version ${prev} has no snapshot to restore.`);
  return publish(prev, req.auth!.uid, 'rollbackDataset');
});

export const listDatasets = onCall(async (req) => {
  await requireStaff(req, 'data_steward');
  const s = await db().collection('datasets').orderBy('builtAt', 'desc').limit(50).get();
  const meta = (await db().doc('meta/dataset').get()).data() ?? {};
  return {
    live: meta.version ?? null,
    items: s.docs.map((d) => ({
      version: d.id,
      status: d.get('status'),
      checksPassed: d.get('checksPassed'),
      checks: d.get('checks'),
      origin: d.get('origin'),
      previous: d.get('previous') ?? null,
      builtAt: d.get('builtAt')?.toDate?.().toISOString() ?? null,
      publishedAt: d.get('publishedAt')?.toDate?.().toISOString() ?? null,
    })),
  };
});

// ---- Weekly ingest ------------------------------------------------------------------------------------
/**
 * First ingest source: World Bank WDI population (no key). It compares the latest values with the
 * published dataset and records a run with every difference for a data steward; it never publishes on
 * its own. FAOSTAT, UN WPP and UN Comtrade (COMTRADE_KEY in Secret Manager) are added the same way.
 */
async function ingest(actor: string) {
  const runRef = db().collection('ingestRuns').doc();
  const log: string[] = [];
  await runRef.set({ startedAt: FieldValue.serverTimestamp(), actor, status: 'running', sources: ['World Bank WDI: SP.POP.TOTL'] });
  try {
    const countries = await db().collection('countries').select('iso3', 'macro').get();
    const byIso3 = new Map(countries.docs.map((d) => [String(d.get('iso3') ?? ''), { iso2: d.id, pop: d.get('macro')?.pop?.values ?? {} }]));
    const iso3 = [...byIso3.keys()].filter(Boolean);
    log.push(`Checking population for ${iso3.length} countries.`);
    const url = `https://api.worldbank.org/v2/country/${iso3.join(';')}/indicator/SP.POP.TOTL?format=json&per_page=1000&mrv=2`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`World Bank API answered ${r.status}`);
    const [, rows] = (await r.json()) as [unknown, { countryiso3code: string; date: string; value: number | null }[]];
    const changed: { iso2: string; year: string; published: number | null; latest: number }[] = [];
    for (const row of rows ?? []) {
      const c = byIso3.get(row.countryiso3code);
      if (!c || row.value == null) continue;
      const latest = Math.round(row.value / 1e4) / 100; // millions, 2 dp
      const published = c.pop[row.date] ?? null;
      if (published == null || Math.abs(published - latest) > 0.01) changed.push({ iso2: c.iso2, year: row.date, published, latest });
    }
    log.push(`${rows?.length ?? 0} values read; ${changed.length} differ from the published dataset.`);
    await runRef.set({ finishedAt: FieldValue.serverTimestamp(), status: 'ok', changed: changed.slice(0, 200), changedCount: changed.length, published: false, log }, { merge: true });
    return { id: runRef.id, changed: changed.length };
  } catch (e) {
    log.push(`Failed: ${(e as Error).message}`);
    await runRef.set({ finishedAt: FieldValue.serverTimestamp(), status: 'failed', published: false, log }, { merge: true });
    logger.error('ingest failed', e);
    return { id: runRef.id, error: (e as Error).message };
  }
}

export const scheduledIngest = onSchedule({ schedule: 'every monday 03:00', timeZone: 'Africa/Nairobi', timeoutSeconds: 540 }, async () => {
  await ingest('system:scheduledIngest');
});

export const runIngest = onCall({ timeoutSeconds: 300 }, async (req) => {
  await requireStaff(req, 'data_steward');
  const out = await ingest(req.auth!.uid);
  await audit(req.auth!.uid, 'runIngest', `ingestRuns/${out.id}`, null, out);
  return out;
});

export const listIngestRuns = onCall(async (req) => {
  await requireStaff(req, 'data_steward');
  const s = await db().collection('ingestRuns').orderBy('startedAt', 'desc').limit(30).get();
  return { items: s.docs.map((d) => ({ id: d.id, ...d.data(), startedAt: d.get('startedAt')?.toDate?.().toISOString() ?? null, finishedAt: d.get('finishedAt')?.toDate?.().toISOString() ?? null })) };
});
