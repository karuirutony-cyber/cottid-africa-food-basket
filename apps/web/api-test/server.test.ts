/**
 * The Vercel server against the Firebase emulators (auth + firestore): API keys, the data API with
 * quotas, staff checks and the cron lock. Run with: pnpm --filter @afb/web test:api
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { getFirestore } from 'firebase-admin/firestore';
import { db } from '../api/_lib/server.js';
import { GET as v1 } from '../api/v1.js';
import { GET as actionInfo, POST as action } from '../api/action.js';
import { GET as cron } from '../api/cron.js';

const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const PROJECT = process.env.GCLOUD_PROJECT!;

async function signUp(email: string): Promise<{ uid: string; token: string }> {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret-123', returnSecureToken: true }),
  });
  const j = (await r.json()) as { localId: string; idToken: string };
  return { uid: j.localId, token: j.idToken };
}
const post = (name: string, data: unknown, token?: string) =>
  action(new Request('http://x/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ name, data }) }));
const get = (path: string, key?: string) => v1(new Request(`http://x/api/v1?path=${encodeURIComponent(path)}`, { headers: key ? { 'X-API-Key': key } : {} }));

let member: { uid: string; token: string };
let admin: { uid: string; token: string };

beforeAll(async () => {
  expect(PROJECT).toMatch(/^demo-/);
  db(); // initialise
  const fs = getFirestore();
  await fs.doc('countries/KE').set({ iso2: 'KE', iso3: 'KEN', name: { en: 'Kenya' } });
  await fs.doc('settings/security').set({ requireTwoStep: false });
  member = await signUp(`m${Date.now()}@example.com`);
  admin = await signUp(`a${Date.now()}@example.com`);
  await fs.doc(`users/${member.uid}`).set({ role: 'member', email: 'm@example.com' });
  await fs.doc(`users/${admin.uid}`).set({ role: 'platform_admin', email: 'a@example.com' });
});

describe('Vercel server', () => {
  it('says which actions it offers and that it is configured', async () => {
    const j = (await (await actionInfo()).json()) as { actions: string[]; configured: boolean };
    expect(j.configured).toBe(true);
    expect(j.actions).toEqual(expect.arrayContaining(['createApiKey', 'revokeApiKey', 'runAlertsNow', 'runIngest', 'setUserRole']));
  });

  it('refuses actions without a valid sign-in, and unknown actions', async () => {
    expect((await post('createApiKey', { name: 'x' })).status).toBe(401);
    expect((await post('createApiKey', { name: 'x' }, 'not-a-token')).status).toBe(401);
    expect((await post('nope', {}, member.token)).status).toBe(404);
  });

  it('issues a key that the data API accepts, counts quota, and stops after revoking', async () => {
    const r = await post('createApiKey', { name: 'test' }, member.token);
    expect(r.status).toBe(200);
    const { result } = (await r.json()) as { result: { key: string; id: string; quota: number } };
    expect(result.key).toMatch(/^afb_/);

    expect((await get('/countries')).status).toBe(401);
    expect((await get('/countries', 'afb_wrong')).status).toBe(401);
    const ok = await get('/countries/ke', result.key);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { iso3: string }).iso3).toBe('KEN');
    expect(Number(ok.headers.get('X-RateLimit-Remaining'))).toBe(result.quota - 1);
    expect((await get('/countries/ZZ', result.key)).status).toBe(404);
    expect((await get('/nothing', result.key)).status).toBe(404);

    const list = (await (await post('listApiKeys', {}, member.token)).json()) as { result: { items: { id: string; usedToday: number }[] } };
    expect(list.result.items.find((k) => k.id === result.id)?.usedToday).toBe(2);

    expect((await post('revokeApiKey', { id: result.id }, admin.token)).status).toBe(404); // not their key
    expect((await post('revokeApiKey', { id: result.id }, member.token)).status).toBe(200);
    expect((await get('/countries/KE', result.key)).status).toBe(401);
  });

  it('serves the OpenAPI description without a key', async () => {
    const r = await get('/openapi.json');
    expect(r.status).toBe(200);
    expect(((await r.json()) as { openapi: string }).openapi).toBe('3.0.3');
  });

  it('enforces quotas', async () => {
    const { result } = (await (await post('createApiKey', { name: 'tiny' }, member.token)).json()) as { result: { key: string; id: string } };
    await getFirestore().doc(`apiKeys/${result.id}`).update({ quota: 1 });
    expect((await get('/countries/KE', result.key)).status).toBe(200);
    const over = await get('/countries/KE', result.key);
    expect(over.status).toBe(429);
    expect(over.headers.get('Retry-After')).toBeTruthy();
  });

  it('staff actions check the role on the profile', async () => {
    expect((await post('runAlertsNow', {}, member.token)).status).toBe(403);
    const r = await post('runAlertsNow', {}, admin.token);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { result: { rules: number } }).result.rules).toBeGreaterThanOrEqual(0);
    expect((await post('setUserRole', { uid: member.uid, role: 'super_admin' }, admin.token)).status).toBe(403);
    expect((await post('setUserRole', { uid: member.uid, role: 'verifier' }, admin.token)).status).toBe(200);
    expect((await getFirestore().doc(`users/${member.uid}`).get()).get('role')).toBe('verifier');
  });

  it('with two-step required, staff without a second factor are refused', async () => {
    await getFirestore().doc('settings/security').set({ requireTwoStep: true });
    expect((await post('runAlertsNow', {}, admin.token)).status).toBe(403);
    await getFirestore().doc('settings/security').set({ requireTwoStep: false });
  });

  it('cron jobs run only with the secret', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    expect((await cron(new Request('http://x/api/cron?job=alerts'))).status).toBe(401);
    expect((await cron(new Request('http://x/api/cron?job=alerts', { headers: { Authorization: 'Bearer wrong' } }))).status).toBe(401);
    expect((await cron(new Request('http://x/api/cron?job=alerts', { headers: { Authorization: 'Bearer cron-secret' } }))).status).toBe(200);
  });
});
