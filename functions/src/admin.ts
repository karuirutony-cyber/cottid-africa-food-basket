/** Admin console: users and roles, organisations, platform settings, and record editing. All audited. */
import './options';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { hasRole, ROLES, type Role } from '@afb/schema';
import { audit, requireStaff } from './review';

const db = () => getFirestore();
const parse = <S extends z.ZodTypeAny>(s: S, d: unknown): z.output<S> => {
  const r = s.safeParse(d ?? {});
  if (!r.success) throw new HttpsError('invalid-argument', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
};
const iso = (v: unknown) => ((v as { toDate?: () => Date })?.toDate?.().toISOString() ?? null);

export const adminListUsers = onCall(async (req) => {
  await requireStaff(req, 'platform_admin');
  const s = await db().collection('users').limit(500).get();
  return { items: s.docs.map((d) => ({ uid: d.id, name: d.get('name'), email: d.get('email'), role: d.get('role'), org: d.get('org') ?? null, createdAt: iso(d.get('createdAt')), lastSeen: iso(d.get('lastSeen')) })) };
});

export const setUserRole = onCall(async (req) => {
  await requireStaff(req, 'platform_admin');
  const { uid, role } = parse(z.object({ uid: z.string().min(1).max(128), role: z.enum(ROLES).exclude(['visitor']) }).strict(), req.data);
  const me = await db().doc(`users/${req.auth!.uid}`).get();
  const mine = ((me.get('role') as Role | undefined) ?? (req.auth!.token as { role?: Role }).role ?? 'member') as Role;
  // Nobody grants a role above their own; only super admins create or remove super admins.
  if (!hasRole(mine, role)) throw new HttpsError('permission-denied', 'You cannot grant a role above your own.');
  const ref = db().doc(`users/${uid}`);
  const before = (await ref.get()).get('role');
  if (before === 'super_admin' && mine !== 'super_admin') throw new HttpsError('permission-denied', 'Only a super admin can change a super admin.');
  if (uid === req.auth!.uid && !hasRole(role, mine)) throw new HttpsError('failed-precondition', 'Ask another administrator to lower your own role.');
  await ref.set({ role }, { merge: true }); // syncRoleClaim mirrors it to the token
  await audit(req.auth!.uid, 'setUserRole', `users/${uid}`, { role: before ?? null }, { role });
  return { ok: true };
});

export const adminListOrgs = onCall(async (req) => {
  await requireStaff(req, 'platform_admin');
  const s = await db().collection('organisations').limit(500).get();
  return { items: s.docs.map((d) => ({ id: d.id, name: d.get('name'), plan: d.get('plan'), memberCount: d.get('memberCount') ?? null, createdAt: iso(d.get('createdAt')) })) };
});

const Settings = z
  .object({
    features: z.object({ submissions: z.boolean(), alerts: z.boolean(), api: z.boolean(), organisations: z.boolean(), briefs: z.boolean() }).partial().optional(),
    apiQuotas: z.object({ free: z.number().int().min(0).max(1e7), member: z.number().int().min(0).max(1e7), org: z.number().int().min(0).max(1e8) }).partial().optional(),
    maintenance: z.boolean().optional(),
  })
  .strict();

export const updateSettings = onCall(async (req) => {
  await requireStaff(req, 'platform_admin');
  const patch = parse(Settings, req.data);
  const ref = db().doc('settings/platform');
  const before = (await ref.get()).data() ?? null;
  await ref.set(patch, { merge: true });
  await audit(req.auth!.uid, 'updateSettings', 'settings/platform', before, patch);
  return { ok: true };
});

/** Record collections staff may browse and correct directly (data stewards). */
const EDITABLE = ['buyers', 'suppliers', 'compliance', 'events', 'calls', 'policies', 'interventions', 'funders', 'sources', 'prices', 'duties', 'rateCards', 'fx'] as const;
const LOCKED = new Set(['ref', 'id', 'src', 'publishedAt', 'publishedBy', 'lastSubmission', 'editedAt', 'editedBy']);

export const adminList = onCall(async (req) => {
  await requireStaff(req, 'data_steward');
  const { collection, after, limit, q } = parse(
    z.object({ collection: z.enum(EDITABLE), after: z.string().max(200).optional(), limit: z.number().int().min(1).max(200).default(50), q: z.string().max(80).optional() }).strict(),
    req.data,
  );
  let query = db().collection(collection).orderBy('__name__').limit(q ? 500 : limit);
  if (after) query = query.startAfter(after);
  const s = await query.get();
  const needle = q?.toLowerCase();
  const docs = needle ? s.docs.filter((d) => JSON.stringify(d.data()).toLowerCase().includes(needle)).slice(0, limit) : s.docs;
  return { items: docs.map((d) => ({ id: d.id, data: d.data() })), next: s.docs.length ? s.docs[s.docs.length - 1]!.id : null };
});

export const adminUpdate = onCall(async (req) => {
  await requireStaff(req, 'data_steward');
  const { path, patch, reason } = parse(
    z.object({ path: z.string().regex(/^[a-zA-Z]+\/[\w.-]+$/), patch: z.record(z.string().max(60), z.union([z.string().max(4000), z.number(), z.boolean(), z.null()])), reason: z.string().trim().min(5).max(500) }).strict(),
    req.data,
  );
  const coll = path.split('/')[0]!;
  if (!(EDITABLE as readonly string[]).includes(coll)) throw new HttpsError('invalid-argument', `${coll} cannot be edited here.`);
  const bad = Object.keys(patch).filter((k) => LOCKED.has(k) || k.startsWith('_') || k.includes('.'));
  if (bad.length) throw new HttpsError('invalid-argument', `These fields cannot be changed: ${bad.join(', ')}`);
  const ref = db().doc(path);
  const before = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError('not-found', `${path} does not exist.`);
    const unknown = Object.keys(patch).filter((k) => s.get(k) === undefined);
    if (unknown.length) throw new HttpsError('invalid-argument', `${path} has no field ${unknown.join(', ')}.`);
    const b = Object.fromEntries(Object.keys(patch).map((k) => [k, s.get(k) ?? null]));
    tx.set(ref, { ...patch, editedAt: FieldValue.serverTimestamp(), editedBy: req.auth!.uid, publishedAt: FieldValue.serverTimestamp() }, { merge: true });
    return b;
  });
  await audit(req.auth!.uid, 'adminUpdate', path, before, { ...patch, reason });
  return { ok: true };
});
