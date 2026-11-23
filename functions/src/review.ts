/**
 * Contributions: submit -> review (verifier) -> publishRecord (data steward), every staff write audited.
 * Staff calls go through these functions (Admin SDK) so the review console works the same everywhere,
 * while the security rules still refuse direct client writes to reference data and the audit log.
 */
import './options';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { hasRole, type Role } from '@afb/schema';

const db = () => getFirestore();

/** Records a contribution may change. */
export const PUBLISHABLE = ['buyers', 'suppliers', 'compliance', 'events', 'calls', 'policies', 'interventions', 'funders', 'sources'] as const;

type Claims = { role?: Role; email?: string; firebase?: { sign_in_second_factor?: string } };
const claims = (req: CallableRequest) => (req.auth?.token ?? {}) as Claims;

/**
 * Emulator-only test switch: functions/.env.demo-cottid sets AFB_TEST_NO_MFA=1, and that file is read
 * only for the demo project, so production always requires a second factor.
 */
const noMfaForTests = () => process.env.FUNCTIONS_EMULATOR === 'true' && process.env.AFB_TEST_NO_MFA === '1';

export function requireStaff(req: CallableRequest, min: Role) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (!hasRole(claims(req).role ?? 'member', min)) throw new HttpsError('permission-denied', `Needs the ${min} role.`);
  if (!claims(req).firebase?.sign_in_second_factor && !noMfaForTests())
    throw new HttpsError('permission-denied', 'Staff actions need two-step verification. Turn it on in your account.');
}

export async function audit(actor: string, action: string, target: string, before: unknown, after: unknown) {
  await db().collection('auditLog').add({ actor, action, target, before: before ?? null, after: after ?? null, time: FieldValue.serverTimestamp() });
}

const parse = <S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> => {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw new HttpsError('invalid-argument', r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
  return r.data;
};
const iso = (t: unknown) => (t instanceof Timestamp ? t.toDate().toISOString() : null);

// ---- submit: any signed-in user ------------------------------------------------------------------
const Target = z
  .string()
  .max(200)
  .regex(/^([a-zA-Z]+\/[\w.-]+|new:[a-zA-Z]+|page)$/, 'target must be "collection/id", "new:collection" or "page"');
const SubmitInput = z
  .object({
    target: Target,
    page: z.string().max(300).default(''),
    item: z.string().max(200).default(''),
    text: z.string().trim().min(10, 'Describe the correction in at least 10 characters').max(4000),
    sourceUrl: z.union([z.string().url().max(500), z.literal('')]).default(''),
    patch: z.record(z.string().max(60), z.string().max(2000)).optional(),
  })
  .strict();

export const submit = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in to suggest a correction.');
  const input = parse(SubmitInput, req.data);
  // Simple abuse limit: 20 submissions a day per account.
  const since = Timestamp.fromMillis(Date.now() - 86_400_000);
  const recent = await db().collection('submissions').where('uid', '==', req.auth.uid).where('createdAt', '>=', since).count().get();
  if (recent.data().count >= 20) throw new HttpsError('resource-exhausted', 'You have sent 20 suggestions today. Thank you; please continue tomorrow.');
  const ref = await db().collection('submissions').add({
    ...input,
    patch: input.patch ?? null,
    uid: req.auth.uid,
    email: claims(req).email ?? null,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});

// ---- reviewQueue / myContributions ---------------------------------------------------------------
const QueueInput = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'published']).default('pending'), limit: z.number().int().min(1).max(200).default(50) }).strict();

const shape = (d: FirebaseFirestore.QueryDocumentSnapshot) => {
  const x = d.data();
  return { id: d.id, ...x, createdAt: iso(x.createdAt), reviewedAt: iso(x.reviewedAt), publishedAt: iso(x.publishedAt) };
};

export const reviewQueue = onCall(async (req) => {
  requireStaff(req, 'verifier');
  const { status, limit } = parse(QueueInput, req.data);
  const snap = await db().collection('submissions').where('status', '==', status).orderBy('createdAt', 'desc').limit(limit).get();
  return { items: snap.docs.map(shape) };
});

export const myContributions = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const snap = await db().collection('submissions').where('uid', '==', req.auth.uid).orderBy('createdAt', 'desc').limit(50).get();
  return { items: snap.docs.map(shape) };
});

/** The record a submission points at, so the reviewer sees what would change. */
export const getRecord = onCall(async (req) => {
  requireStaff(req, 'verifier');
  const { path } = parse(z.object({ path: z.string().regex(/^[a-zA-Z]+\/[\w.-]+$/) }).strict(), req.data);
  if (!(PUBLISHABLE as readonly string[]).includes(path.split('/')[0]!)) throw new HttpsError('invalid-argument', 'Not a publishable record.');
  const s = await db().doc(path).get();
  return { exists: s.exists, data: s.exists ? { ...s.data(), publishedAt: iso(s.get('publishedAt')) } : null };
});

// ---- review: verifiers approve or reject --------------------------------------------------------
const ReviewInput = z.object({ id: z.string().min(1).max(100), decision: z.enum(['approved', 'rejected']), note: z.string().max(2000).default('') }).strict();

export const review = onCall(async (req) => {
  requireStaff(req, 'verifier');
  const { id, decision, note } = parse(ReviewInput, req.data);
  const ref = db().doc(`submissions/${id}`);
  const before = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError('not-found', 'No such submission.');
    if (s.get('status') !== 'pending') throw new HttpsError('failed-precondition', `Already ${s.get('status')}.`);
    tx.update(ref, { status: decision, reviewer: req.auth!.uid, reviewedAt: FieldValue.serverTimestamp(), note });
    return { status: s.get('status') };
  });
  await audit(req.auth!.uid, `review:${decision}`, `submissions/${id}`, before, { status: decision, note });
  return { ok: true };
});

// ---- publishRecord: data stewards apply an approved change ---------------------------------------
const PublishInput = z
  .object({
    id: z.string().min(1).max(100),
    target: z.string().regex(/^[a-zA-Z]+\/[\w.-]+$/),
    patch: z.record(z.string().max(60), z.string().max(2000)).refine((p) => Object.keys(p).length > 0, 'Give at least one field to change'),
  })
  .strict();
/** Fields a correction may never touch. */
const LOCKED = new Set(['ref', 'id', 'src', 'publishedAt', 'publishedBy', 'lastSubmission']);

export const publishRecord = onCall(async (req) => {
  requireStaff(req, 'data_steward');
  const { id, target, patch } = parse(PublishInput, req.data);
  const coll = target.split('/')[0]!;
  if (!(PUBLISHABLE as readonly string[]).includes(coll)) throw new HttpsError('invalid-argument', `${coll} records cannot be published from a contribution.`);
  const bad = Object.keys(patch).filter((k) => LOCKED.has(k) || k.startsWith('_') || k.includes('.'));
  if (bad.length) throw new HttpsError('invalid-argument', `These fields cannot be changed: ${bad.join(', ')}`);

  const subRef = db().doc(`submissions/${id}`);
  const recRef = db().doc(target);
  const result = await db().runTransaction(async (tx) => {
    const [sub, rec] = await Promise.all([tx.get(subRef), tx.get(recRef)]);
    if (!sub.exists) throw new HttpsError('not-found', 'No such submission.');
    if (sub.get('status') !== 'approved') throw new HttpsError('failed-precondition', 'Only an approved submission can be published.');
    if (!rec.exists) throw new HttpsError('not-found', `${target} does not exist.`);
    const unknown = Object.keys(patch).filter((k) => rec.get(k) === undefined);
    if (unknown.length) throw new HttpsError('invalid-argument', `${target} has no field ${unknown.join(', ')}.`);
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, rec.get(k) ?? null]));
    tx.set(recRef, { ...patch, publishedAt: FieldValue.serverTimestamp(), publishedBy: req.auth!.uid, lastSubmission: id }, { merge: true });
    tx.update(subRef, { status: 'published', publishedAt: FieldValue.serverTimestamp(), publishedTarget: target, publishedPatch: patch });
    return { before };
  });
  await audit(req.auth!.uid, 'publishRecord', target, result.before, patch);
  return { ok: true };
});

// ---- staff console reads ------------------------------------------------------------------------
export const auditList = onCall(async (req) => {
  requireStaff(req, 'platform_admin');
  const { limit } = parse(z.object({ limit: z.number().int().min(1).max(500).default(100) }).strict(), req.data);
  const snap = await db().collection('auditLog').orderBy('time', 'desc').limit(limit).get();
  return { items: snap.docs.map((d) => ({ id: d.id, ...d.data(), time: iso(d.get('time')) })) };
});

export const adminStats = onCall(async (req) => {
  requireStaff(req, 'verifier');
  const c = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;
  const s = db().collection('submissions');
  const [pending, approved, published, rejected, users] = await Promise.all([
    c(s.where('status', '==', 'pending')),
    c(s.where('status', '==', 'approved')),
    c(s.where('status', '==', 'published')),
    c(s.where('status', '==', 'rejected')),
    c(db().collection('users')),
  ]);
  const meta = (await db().doc('meta/dataset').get()).data() ?? null;
  return { pending, approved, published, rejected, users, dataset: meta ? { version: meta.version, built: meta.built, seeded: meta.seeded } : null };
});
