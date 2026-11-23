import './options';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { z } from 'zod';
import { LANGS, ROLES, type Role } from '@afb/schema';
import { buildDocs, countByCollection, PLATFORM_DEFAULTS, type Datasets } from '../../tools/seed-lib';
import namesEn from '../../locales/en/names.json';
import namesFr from '../../locales/fr/names.json';
import namesPt from '../../locales/pt/names.json';
import namesAr from '../../locales/ar/names.json';
import namesSw from '../../locales/sw/names.json';


const db = () => getFirestore();

import { audit, requireStaff } from './review';
import { loadPublished } from './datasets';
export { buildDataset, publishDataset, rollbackDataset, listDatasets, scheduledIngest, runIngest, listIngestRuns } from './datasets';
export { alerts, runAlertsNow } from './alerts';
export { createOrg, inviteMember, myInvites, acceptInvite, setMemberRole, removeMember, orgInfo, updateOrg } from './orgs';
export { adminListUsers, setUserRole, adminListOrgs, updateSettings, adminList, adminUpdate } from './admin';
export { api, createApiKey, listApiKeys, revokeApiKey } from './api';
export { submit, review, publishRecord, reviewQueue, myContributions, getRecord, auditList, adminStats } from './review';

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
export const bootstrap = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (req) => {
  requireStaff(req, 'platform_admin');
  const D = { ...(await loadPublished()), names: { en: namesEn, fr: namesFr, pt: namesPt, ar: namesAr, sw: namesSw } } as unknown as Datasets;
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
