import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions, logger } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest, type CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import { z } from 'zod';
import { hasRole, LANGS, ROLES, type Role } from '@afb/schema';
import { buildDocs, countByCollection, PLATFORM_DEFAULTS, type Datasets } from '../../tools/seed-lib';
import namesEn from '../../locales/en/names.json';
import namesFr from '../../locales/fr/names.json';
import namesPt from '../../locales/pt/names.json';
import namesAr from '../../locales/ar/names.json';
import namesSw from '../../locales/sw/names.json';

initializeApp();
/** Every function runs in Johannesburg, next to the Firestore database. */
setGlobalOptions({ region: 'africa-south1', maxInstances: 10 });

const db = () => getFirestore();
/** Where bootstrap reads the published datasets (the Hosting site serves /data/*.json). */
const DATA_BASE_URL = defineString('DATA_BASE_URL', { default: 'https://cottid-72d51.web.app' });

type Claims = { role?: Role; firebase?: { sign_in_second_factor?: string } };
const roleOf = (req: CallableRequest) => ((req.auth?.token as Claims | undefined)?.role ?? 'member') as Role;
const hasTwoStep = (req: CallableRequest) => !!(req.auth?.token as Claims | undefined)?.firebase?.sign_in_second_factor;

/** Staff actions need the role and a second factor (section 4). */
function requireStaff(req: CallableRequest, min: Role) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (!hasRole(roleOf(req), min)) throw new HttpsError('permission-denied', `Needs the ${min} role.`);
  if (!hasTwoStep(req)) throw new HttpsError('permission-denied', 'Staff actions need two-step verification. Turn it on in your account.');
}

async function audit(actor: string, action: string, target: string, before: unknown, after: unknown) {
  await db().collection('auditLog').add({ actor, action, target, before: before ?? null, after: after ?? null, time: FieldValue.serverTimestamp() });
}

// ---- ensureProfile: called by the client on every sign-in ----------------------------------------
const EnsureInput = z.object({ language: z.enum(LANGS).optional(), name: z.string().max(200).optional() }).strict();

export const ensureProfile = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const input = EnsureInput.safeParse(req.data ?? {});
  if (!input.success) throw new HttpsError('invalid-argument', input.error.issues[0]?.message ?? 'Invalid input');
  const { uid, token } = req.auth;
  const ref = db().doc(`users/${uid}`);
  const created = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      // A name given at sign-up fills an empty profile name; it never overwrites one.
      const fill = input.data.name && !snap.get('name') ? { name: input.data.name } : {};
      tx.update(ref, { lastSeen: FieldValue.serverTimestamp(), ...fill });
      return false;
    }
    tx.set(ref, {
      name: input.data.name ?? (token.name as string | undefined) ?? '',
      email: token.email ?? '',
      role: 'member',
      org: null,
      language: input.data.language ?? 'en',
      createdAt: FieldValue.serverTimestamp(),
      lastSeen: FieldValue.serverTimestamp(),
    });
    return true;
  });
  const settings = db().doc('settings/platform');
  if (!(await settings.get()).exists) await settings.set(PLATFORM_DEFAULTS);
  const profile = (await ref.get()).data();
  if (created) logger.info('profile created', { uid });
  return { created, profile: { ...profile, createdAt: null, lastSeen: null } };
});

// ---- syncRoleClaim: mirror users/{uid}.role to the custom claim -----------------------------------
export const syncRoleClaim = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const uid = event.params.uid;
  if (!after) return; // deleted
  const role = (ROLES as readonly string[]).includes(after.role) && after.role !== 'visitor' ? (after.role as Role) : 'member';
  if (before?.role === role) return;
  const user = await getAuth().getUser(uid).catch(() => null);
  if (!user) return;
  if (user.customClaims?.role === role) return;
  await getAuth().setCustomUserClaims(uid, { ...(user.customClaims ?? {}), role });
  await audit('system:syncRoleClaim', 'roleClaim', `users/${uid}`, { role: before?.role ?? null }, { role });
  logger.info('role claim set', { uid, role });
});

// ---- bootstrap: build every reference collection (platform admins, idempotent) --------------------
async function loadFromHosting(base: string): Promise<Datasets> {
  const get = async (n: string) => {
    const r = await fetch(`${base.replace(/\/$/, '')}/data/${n}.json`);
    if (!r.ok) throw new Error(`Could not fetch ${n}.json from ${base} (${r.status})`);
    return r.json();
  };
  const names = ['TS', 'LIB', 'REG', 'SRC', 'NUT', 'FT', 'SELL', 'CALLS', 'EVENTS', 'POL', 'DEVT', 'DEVF', 'PROG'] as const;
  const vals = await Promise.all(names.map(get));
  const D = Object.fromEntries(names.map((n, i) => [n, vals[i]])) as Omit<Datasets, 'names'>;
  return { ...D, names: { en: namesEn, fr: namesFr, pt: namesPt, ar: namesAr, sw: namesSw } };
}

export const bootstrap = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (req) => {
  requireStaff(req, 'platform_admin');
  const D = await loadFromHosting(DATA_BASE_URL.value());
  const docs = buildDocs(D);
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db().batch();
    for (const d of docs.slice(i, i + 400)) batch.set(db().doc(d.path), d.data, { merge: true });
    await batch.commit();
  }
  const settings = db().doc('settings/platform');
  if (!(await settings.get()).exists) await settings.set(PLATFORM_DEFAULTS);
  const counts = countByCollection(docs);
  logger.info('bootstrap complete', counts);
  await audit(req.auth!.uid, 'bootstrap', 'reference collections', null, counts);
  return { written: docs.length, counts };
});

/** Liveness probe. */
export const health = onRequest((_req, res) => {
  res.json({ ok: true });
});
