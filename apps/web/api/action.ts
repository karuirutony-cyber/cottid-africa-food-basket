/**
 * POST /api/action { name, data } with the Firebase ID token as "Authorization: Bearer <token>".
 * The server actions that need the Admin SDK: issuing and revoking API keys, running alerts and the
 * ingest now, and changing a role (profile and sign-in claim together). Same checks as the functions.
 */
import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { audit, auth, caller, db, errorResponse, HttpError, json, RANKS, requireStaff } from './_lib/server.js';
import { DEFAULT_QUOTA, hashKey, today } from './_lib/v1.js';
import { ingest, runAlerts } from './_lib/jobs.js';

const MAX_KEYS = 5;
type Data = Record<string, unknown>;
const str = (v: unknown, name: string, min = 1, max = 200) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) throw new HttpError(400, 'invalid-argument', `${name}: ${min} to ${max} characters.`);
  return s;
};

const ACTIONS: Record<string, (tok: DecodedIdToken, d: Data) => Promise<unknown>> = {
  async createApiKey(tok, d) {
    const name = str(d.name, 'name', 1, 60);
    const mine = await db().collection('apiKeys').where('owner', '==', tok.uid).get();
    if (mine.docs.filter((x) => !x.get('revoked')).length >= MAX_KEYS) throw new HttpError(429, 'resource-exhausted', `You can have up to ${MAX_KEYS} active keys. Revoke one first.`);
    const settings = (await db().doc('settings/platform').get()).data();
    const quota = Number(settings?.apiQuotas?.member ?? DEFAULT_QUOTA);
    const key = `afb_${randomBytes(24).toString('base64url')}`;
    const hash = hashKey(key);
    await db().doc(`apiKeys/${hash}`).set({ owner: tok.uid, org: null, name, prefix: key.slice(0, 10), quota, usage: {}, total: 0, revoked: false, createdAt: FieldValue.serverTimestamp(), lastUsed: null });
    await audit(tok.uid, 'createApiKey', `apiKeys/${hash.slice(0, 12)}…`, null, { name, quota });
    return { key, id: hash, quota };
  },

  async listApiKeys(tok) {
    const s = await db().collection('apiKeys').where('owner', '==', tok.uid).get();
    const day = today();
    const iso = (v: unknown) => (v as { toDate?: () => Date } | null)?.toDate?.().toISOString() ?? null;
    return {
      items: s.docs.map((x) => ({ id: x.id, name: x.get('name'), prefix: x.get('prefix'), quota: x.get('quota'), usedToday: Number(x.get(`usage.${day}`) ?? 0), total: Number(x.get('total') ?? 0), revoked: !!x.get('revoked'), createdAt: iso(x.get('createdAt')), lastUsed: iso(x.get('lastUsed')) })),
    };
  },

  async revokeApiKey(tok, d) {
    const id = String(d.id ?? '');
    if (!/^[a-f0-9]{64}$/.test(id)) throw new HttpError(400, 'invalid-argument', 'Not a key id.');
    const ref = db().doc(`apiKeys/${id}`);
    const s = await ref.get();
    if (!s.exists || s.get('owner') !== tok.uid) throw new HttpError(404, 'not-found', 'No such key.');
    await ref.update({ revoked: true, revokedAt: FieldValue.serverTimestamp() });
    await audit(tok.uid, 'revokeApiKey', `apiKeys/${id.slice(0, 12)}…`, { revoked: false }, { revoked: true });
    return { ok: true };
  },

  async runAlertsNow(tok) {
    await requireStaff(tok, 'platform_admin');
    const out = await runAlerts();
    await audit(tok.uid, 'runAlerts', 'alerts', null, out);
    return out;
  },

  async runIngest(tok) {
    await requireStaff(tok, 'data_steward');
    const out = await ingest(tok.uid);
    await audit(tok.uid, 'runIngest', `ingestRuns/${out.id}`, null, out);
    return out;
  },

  async setUserRole(tok, d) {
    const mine = await requireStaff(tok, 'platform_admin');
    const uid = str(d.uid, 'uid', 1, 128);
    const role = String(d.role ?? '');
    if (!(role in RANKS)) throw new HttpError(400, 'invalid-argument', 'Unknown role.');
    if (RANKS[role]! > RANKS[mine]!) throw new HttpError(403, 'permission-denied', 'You cannot grant a role above your own.');
    const ref = db().doc(`users/${uid}`);
    const before = (await ref.get()).get('role') ?? null;
    if (before === 'super_admin' && mine !== 'super_admin') throw new HttpError(403, 'permission-denied', 'Only a super admin can change a super admin.');
    if (uid === tok.uid && RANKS[role]! < RANKS[mine]!) throw new HttpError(400, 'failed-precondition', 'Ask another administrator to lower your own role.');
    await ref.set({ role }, { merge: true });
    const user = await auth().getUser(uid);
    await auth().setCustomUserClaims(uid, { ...(user.customClaims ?? {}), role });
    await audit(tok.uid, 'setUserRole', `users/${uid}`, { role: before }, { role });
    return { ok: true };
  },
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { name?: string; data?: Data } | null;
    const fn = body?.name ? ACTIONS[body.name] : undefined;
    if (!fn) return json(404, { error: { code: 'not-found', message: 'No such action.' } });
    const tok = await caller(req);
    return json(200, { result: await fn(tok, body?.data ?? {}) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Lists the actions this server offers, and whether it is configured. */
export async function GET() {
  const { configured } = await import('./_lib/server.js');
  return json(200, { actions: Object.keys(ACTIONS), configured: configured() });
}
