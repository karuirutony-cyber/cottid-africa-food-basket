/**
 * Counts the documents in every seeded collection on the Firestore emulator and checks them against
 * what the seed builds (M1: "seed creates every collection from empty; the counts match").
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildDocs, countByCollection } from './seed-lib';
import { loadDatasets } from './seed';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
initializeApp({ projectId: process.argv[2] ?? 'demo-cottid' });
const want = countByCollection(buildDocs(loadDatasets()));
want.settings = 1;
const db = getFirestore();
let bad = 0;
for (const [coll, n] of Object.entries(want).sort()) {
  const got = (await db.collection(coll).count().get()).data().count;
  const ok = got === n;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${coll.padEnd(14)} ${got}${ok ? '' : ` (expected ${n})`}`);
}
const checks = (await db.doc('meta/dataset').get()).data();
console.log(`meta/dataset: version ${checks?.version}, ${checks?.sourceCount} sources, horizon ${checks?.projectionHorizon}`);
if (bad) process.exit(1);
