/**
 * Public data API: GET /api/v1/... with an API key (X-API-Key header or ?key=), a daily quota per key,
 * and the OpenAPI description at /api/v1/openapi.json (no key needed). Reads the seeded collections.
 * Keys are stored only as SHA-256 hashes (apiKeys/{hash}); the plain key is shown once, at creation.
 */
import './options';
import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { audit } from './review';

const db = () => getFirestore();
export const hashKey = (k: string) => createHash('sha256').update(k).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);
const VERSION = '1.0.0';
const DEFAULT_QUOTA = 10_000;
const MAX_KEYS = 5;

type Res = Parameters<Parameters<typeof onRequest>[0]>[1];
const send = (res: Res, status: number, body: unknown) => {
  res.status(status).set('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
};
const fail = (res: Res, status: number, code: string, message: string) => send(res, status, { error: { code, message } });

/** Charges one request to the key. Returns the remaining allowance, or a reason to refuse. */
async function charge(key: string): Promise<{ ok: true; limit: number; remaining: number; owner: string } | { ok: false; status: number; code: string; message: string; limit?: number }> {
  const ref = db().doc(`apiKeys/${hashKey(key)}`);
  const day = today();
  return db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.get('revoked')) return { ok: false, status: 401, code: 'invalid_key', message: 'This API key is not valid. Create one at /account/api-keys.' };
    const limit = Number(s.get('quota') ?? DEFAULT_QUOTA);
    const used = Number(s.get(`usage.${day}`) ?? 0);
    if (used >= limit) return { ok: false, status: 429, code: 'quota_exceeded', message: `Daily quota of ${limit} requests reached. It resets at 00:00 UTC.`, limit };
    tx.update(ref, { [`usage.${day}`]: FieldValue.increment(1), lastUsed: FieldValue.serverTimestamp(), total: FieldValue.increment(1) });
    return { ok: true, limit, remaining: limit - used - 1, owner: String(s.get('owner')) };
  });
}

// ---- Endpoints ---------------------------------------------------------------------------------------
type Handler = (p: Record<string, string>, q: URLSearchParams) => Promise<{ status?: number; body: unknown }>;
const notFound = (what: string) => ({ status: 404, body: { error: { code: 'not_found', message: `${what} not found.` } } });
const doc = async (path: string, what: string) => {
  const s = await db().doc(path).get();
  return s.exists ? { body: { id: s.id, ...s.data() } } : notFound(what);
};
const list = async (coll: string, fields?: string[], where?: [string, string]) => {
  let q: FirebaseFirestore.Query = db().collection(coll);
  if (where) q = q.where(where[0], '==', where[1]);
  if (fields) q = q.select(...fields);
  const s = await q.get();
  return { body: { count: s.size, items: s.docs.map((d) => ({ id: d.id, ...d.data() })) } };
};
const ISO2 = /^[A-Z]{2}$/;
const FOOD = /^[a-z_]{2,20}$/;

const ROUTES: [RegExp, string[], Handler, string][] = [
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

function openapi(base: string) {
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

export const api = onRequest({ cors: true, memory: '512MiB' }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return void res.status(204).send('');
  if (req.method !== 'GET') return fail(res, 405, 'method_not_allowed', 'Only GET is supported.');
  // Hosting rewrites /api/** here; the emulator URL adds the function name in front.
  const path = req.path.replace(/^\/api(?=\/v1)/, '').replace(/^\/v1/, '') || '/';
  if (path === '/openapi.json' || path === '/') {
    const base = `${req.protocol}://${req.get('host')}`;
    return send(res, 200, openapi(base));
  }
  const route = ROUTES.find(([re]) => re.test(path));
  if (!route) return fail(res, 404, 'not_found', `No endpoint ${path}. See /api/v1/openapi.json.`);

  const key = String(req.get('x-api-key') ?? req.query.key ?? '');
  if (!key) return fail(res, 401, 'missing_key', 'Send your API key in the X-API-Key header.');
  const c = await charge(key);
  if (!c.ok) {
    if (c.limit) res.set('X-RateLimit-Limit', String(c.limit)).set('X-RateLimit-Remaining', '0').set('Retry-After', String(secondsToMidnight()));
    return fail(res, c.status, c.code, c.message);
  }
  res.set('X-RateLimit-Limit', String(c.limit)).set('X-RateLimit-Remaining', String(c.remaining));

  const [re, names, handler] = route;
  const m = path.match(re)!;
  const params = Object.fromEntries(names.map((n, i) => [n, m[i + 1]!]));
  if (params.iso2 && !ISO2.test(params.iso2.toUpperCase())) return fail(res, 400, 'bad_request', 'iso2 must be two letters.');
  if (params.food && !FOOD.test(params.food)) return fail(res, 400, 'bad_request', 'Unknown food id.');
  try {
    const out = await handler(params, new URLSearchParams(req.url.split('?')[1] ?? ''));
    send(res, out.status ?? 200, out.body);
  } catch (e) {
    console.error(e);
    fail(res, 500, 'internal', 'Something went wrong.');
  }
});

function secondsToMidnight() {
  const n = new Date();
  return Math.ceil((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n.getTime()) / 1000);
}

// ---- Key management (callables) ---------------------------------------------------------------------
export const createApiKey = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { name } = z.object({ name: z.string().trim().min(1).max(60) }).strict().parse(req.data ?? {});
  const mine = await db().collection('apiKeys').where('owner', '==', req.auth.uid).where('revoked', '==', false).count().get();
  if (mine.data().count >= MAX_KEYS) throw new HttpsError('resource-exhausted', `You can have up to ${MAX_KEYS} active keys. Revoke one first.`);
  const settings = (await db().doc('settings/platform').get()).data();
  const quota = Number(settings?.apiQuotas?.member ?? DEFAULT_QUOTA);
  const key = `afb_${randomBytes(24).toString('base64url')}`;
  const hash = hashKey(key);
  await db().doc(`apiKeys/${hash}`).set({ owner: req.auth.uid, org: null, name, prefix: key.slice(0, 10), quota, usage: {}, total: 0, revoked: false, createdAt: FieldValue.serverTimestamp(), lastUsed: null });
  await audit(req.auth.uid, 'createApiKey', `apiKeys/${hash.slice(0, 12)}…`, null, { name, quota });
  return { key, id: hash, quota };
});

export const listApiKeys = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const s = await db().collection('apiKeys').where('owner', '==', req.auth.uid).get();
  const day = today();
  return {
    items: s.docs.map((d) => ({
      id: d.id,
      name: d.get('name'),
      prefix: d.get('prefix'),
      quota: d.get('quota'),
      usedToday: Number(d.get(`usage.${day}`) ?? 0),
      total: Number(d.get('total') ?? 0),
      revoked: !!d.get('revoked'),
      createdAt: d.get('createdAt')?.toDate?.().toISOString() ?? null,
      lastUsed: d.get('lastUsed')?.toDate?.().toISOString() ?? null,
    })),
  };
});

export const revokeApiKey = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { id } = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(req.data ?? {});
  const ref = db().doc(`apiKeys/${id}`);
  const s = await ref.get();
  if (!s.exists || s.get('owner') !== req.auth.uid) throw new HttpsError('not-found', 'No such key.');
  await ref.update({ revoked: true, revokedAt: FieldValue.serverTimestamp() });
  await audit(req.auth.uid, 'revokeApiKey', `apiKeys/${id.slice(0, 12)}…`, { revoked: false }, { revoked: true });
  return { ok: true };
});
