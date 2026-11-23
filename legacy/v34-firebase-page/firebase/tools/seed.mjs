// Creates and fills the public collections from the data embedded in the platform page:
// meta/dataset, published_calls, published_events, published_buyers. Safe to re-run (it overwrites by id).
import { createHash } from 'node:crypto';
import { db } from './admin.mjs';
import { readPage, readConst } from './page.mjs';

const html = readPage();
const id = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 20);
const now = new Date();

async function put(col, rows, keyOf) {
  if (!Array.isArray(rows) || !rows.length) { console.log(`${col}: nothing found in the page, skipped`); return; }
  for (let i = 0; i < rows.length; i += 400) {
    const b = db.batch();
    rows.slice(i, i + 400).forEach((r) => b.set(db.collection(col).doc(id(keyOf(r))), { ...r, seededAt: now }, { merge: true }));
    await b.commit();
  }
  console.log(`${col}: ${rows.length} records`);
}

const ABOUT = readConst(html, 'ABOUT') || {};
const REG = readConst(html, 'REG') || {};
await put('published_calls', readConst(html, 'CALLS'), (r) => r.name);
await put('published_events', readConst(html, 'EVENTS'), (r) => r.name);
await put('published_buyers', (REG.buyers || []).filter((b) => b.status && !/lead/i.test(b.status)), (r) => r.ref || r.name);
await db.doc('meta/dataset').set({ version: String(ABOUT.version || ''), updated: ABOUT.updated || '', seededAt: now }, { merge: true });
console.log('meta/dataset written. Done.');
