/**
 * The public data API (GET /api/v1/...): an API key in X-API-Key (or ?key=), a daily quota per key,
 * and the OpenAPI description at /api/v1/openapi.json (no key needed). Reads the seeded collections.
 * Keys are stored only as SHA-256 hashes (apiKeys/{hash}); the plain key is shown once, at creation.
 */
import { createHash } from 'node:crypto';
import { FieldValue, type Query } from 'firebase-admin/firestore';
import { db } from './server.js';

export const hashKey = (k: string) => createHash('sha256').update(k).digest('hex');
export const today = () => new Date().toISOString().slice(0, 10);
export const DEFAULT_QUOTA = 10_000;
const VERSION = '1.0.0';

type Charge = { ok: true; limit: number; remaining: number } | { ok: false; status: number; code: string; message: string; limit?: number };

/** Charges one request to the key. */
export async function charge(key: string): Promise<Charge> {
  const ref = db().doc(`apiKeys/${hashKey(key)}`);
  const day = today();
  return db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.get('revoked')) return { ok: false, status: 401, code: 'invalid_key', message: 'This API key is not valid. Create one at /account/api-keys.' };
    const limit = Number(s.get('quota') ?? DEFAULT_QUOTA);
    const used = Number(s.get(`usage.${day}`) ?? 0);
    if (used >= limit) return { ok: false, status: 429, code: 'quota_exceeded', message: `Daily quota of ${limit} requests reached. It resets at 00:00 UTC.`, limit };
    tx.update(ref, { [`usage.${day}`]: FieldValue.increment(1), lastUsed: FieldValue.serverTimestamp(), total: FieldValue.increment(1) });
    return { ok: true, limit, remaining: limit - used - 1 };
  });
}

type Out = { status?: number; body: unknown };
type Handler = (p: Record<string, string>, q: URLSearchParams) => Promise<Out>;
const notFound = (what: string): Out => ({ status: 404, body: { error: { code: 'not_found', message: `${what} not found.` } } });
const doc = async (path: string, what: string): Promise<Out> => {
  const s = await db().doc(path).get();
  return s.exists ? { body: { id: s.id, ...s.data() } } : notFound(what);
};
const list = async (coll: string, fields?: string[], where?: [string, string]): Promise<Out> => {
  let q: Query = db().collection(coll);
  if (where) q = q.where(where[0], '==', where[1]);
  if (fields) q = q.select(...fields);
  const s = await q.get();
  return { body: { count: s.size, items: s.docs.map((d) => ({ id: d.id, ...d.data() })) } };
};
export const ISO2 = /^[A-Z]{2}$/;
export const FOOD = /^[a-z_]{2,20}$/;

export const ROUTES: [RegExp, string[], Handler, string][] = [
  [/^\/meta$/, [], async () => doc('meta/dataset', 'Dataset metadata'), 'Dataset version, build date, record years and source counts'],
  [/^\/countries$/, [], async () => list('countries', ['iso2', 'iso3', 'name', 'region', 'core', 'blocs']), 'All 54 countries'],
  [/^\/countries\/([A-Za-z]{2})$/, ['iso2'], async (p) => doc(`countries/${p.iso2!.toUpperCase()}`, 'Country'), 'One country with its macro series'],
  [/^\/foods$/, [], async () => list('foods'), 'All 34 foods with names in five languages'],
  [/^\/series\/([A-Za-z]{2})\/([a-z_]+)$/, ['iso2', 'food'], async (p) => doc(`series/${p.iso2!.toUpperCase()}_${p.food}`, 'Series'), 'Production, trade and use for a country and food, by year, with source IDs'],
  [/^\/projections\/([A-Za-z]{2})\/([a-z_]+)$/, ['iso2', 'food'], async (p) => doc(`projections/${p.iso2!.toUpperCase()}_${p.food}_base`, 'Projection'), 'Base-case projection for a country and food'],
  [/^\/nutrition\/([A-Za-z]{2})$/, ['iso2'], async (p) => doc(`nutrition/${p.iso2!.toUpperCase()}`, 'Nutrition'), 'Calories and protein per person by food and year'],
  [/^\/trade\/([A-Za-z]{2})$/, ['iso2'], async (p, q) => doc(`trade/${q.get('year') ?? '2024'}_${p.iso2!.toUpperCase()}`, 'Trade'), 'Customs imports by supplier and exports by destination (?year=2024)'],
  [/^\/buyers$/, [], async (_p, q) => list('buyers', undefined, q.get('country') ? ['country', q.get('country')!] : undefined), 'Buyers (?country=Kenya)'],
  [/^\/suppliers$/, [], async () => list('suppliers'), 'Suppliers and origin bodies'],
  [/^\/sources$/, [], async () => list('sources'), 'All sources'],
  [/^\/sources\/([A-Za-z0-9]+)$/, ['id'], async (p) => doc(`sources/${p.id}`, 'Source'), 'One source'],
];

export function openapi(base: string) {
  const paths: Record<string, unknown> = {};
  for (const [re, names, , summary] of ROUTES) {
    let i = 0;
    const path = re.source.replace(/^\^|\$$/g, '').replace(/\\\//g, '/').replace(/\([^)]*\)/g, () => `{${names[i++]}}`);
    paths[path] = {
      get: {
        summary,
        parameters: names.map((n) => ({ name: n, in: 'path', required: true, schema: { type: 'string', pattern: n === 'iso2' ? ISO2.source : n === 'food' ? FOOD.source : undefined } })),
        responses: { '200': { description: 'OK' }, '401': { description: 'Missing or invalid key' }, '404': { description: 'Not found' }, '429': { description: 'Daily quota reached' } },
      },
    };
  }
  return {
    openapi: '3.0.3',
    info: { title: 'Africa Food Basket API', version: VERSION, description: 'Data from the Africa Food Basket platform by Cottid Africa. Every value keeps its source ID. Daily quota per key; resets 00:00 UTC.' },
    servers: [{ url: `${base}/api/v1` }],
    components: { securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } } },
    security: [{ ApiKey: [] }],
    paths,
  };
}

export function secondsToMidnight() {
  const n = new Date();
  return Math.ceil((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n.getTime()) / 1000);
}
