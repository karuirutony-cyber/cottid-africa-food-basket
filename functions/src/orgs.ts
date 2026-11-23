/**
 * Organisations: a workspace with members and org roles (org_member, org_analyst, org_admin).
 * Changes go through these functions; the rules let members read their organisation directly.
 */
import './options';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { ORG_ROLES } from '@afb/schema';
import { audit } from './review';

const db = () => getFirestore();
const SITE = process.env.SITE_URL ?? 'https://cottid-72d51.web.app';
const OrgRole = z.enum(ORG_ROLES);
const signedIn = (req: CallableRequest) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return req.auth;
};
const parse = <S extends z.ZodTypeAny>(s: S, d: unknown): z.output<S> => {
  const r = s.safeParse(d ?? {});
  if (!r.success) throw new HttpsError('invalid-argument', r.error.issues.map((i) => i.message).join('; '));
  return r.data;
};
async function requireOrgRole(orgId: string, uid: string, role: 'org_admin' | 'org_member') {
  const m = await db().doc(`organisations/${orgId}/members/${uid}`).get();
  if (!m.exists) throw new HttpsError('permission-denied', 'You are not a member of this organisation.');
  if (role === 'org_admin' && m.get('role') !== 'org_admin') throw new HttpsError('permission-denied', 'Only organisation administrators can do this.');
  return m;
}

export const createOrg = onCall(async (req) => {
  const auth = signedIn(req);
  const { name } = parse(z.object({ name: z.string().trim().min(2).max(120) }).strict(), req.data);
  const user = await db().doc(`users/${auth.uid}`).get();
  if (user.get('org')) throw new HttpsError('failed-precondition', 'You already belong to an organisation.');
  const ref = db().collection('organisations').doc();
  const batch = db().batch();
  batch.set(ref, { name, plan: 'free', createdBy: auth.uid, createdAt: FieldValue.serverTimestamp(), memberCount: 1 });
  batch.set(ref.collection('members').doc(auth.uid), { role: 'org_admin', email: auth.token.email ?? '', name: user.get('name') ?? '', joinedAt: FieldValue.serverTimestamp() });
  batch.set(db().doc(`users/${auth.uid}`), { org: ref.id }, { merge: true });
  await batch.commit();
  await audit(auth.uid, 'createOrg', `organisations/${ref.id}`, null, { name });
  return { id: ref.id };
});

export const orgInfo = onCall(async (req) => {
  const auth = signedIn(req);
  const { orgId } = parse(z.object({ orgId: z.string().min(1).max(60) }).strict(), req.data);
  const me = await requireOrgRole(orgId, auth.uid, 'org_member');
  const [org, members, invites] = await Promise.all([
    db().doc(`organisations/${orgId}`).get(),
    db().collection(`organisations/${orgId}/members`).get(),
    me.get('role') === 'org_admin' ? db().collection(`organisations/${orgId}/invites`).where('status', '==', 'pending').get() : Promise.resolve(null),
  ]);
  return {
    org: { id: org.id, name: org.get('name'), plan: org.get('plan') },
    myRole: me.get('role'),
    members: members.docs.map((d) => ({ uid: d.id, role: d.get('role'), email: d.get('email'), name: d.get('name') })),
    invites: invites ? invites.docs.map((d) => ({ id: d.id, email: d.get('email'), role: d.get('role') })) : [],
  };
});

export const updateOrg = onCall(async (req) => {
  const auth = signedIn(req);
  const { orgId, name } = parse(z.object({ orgId: z.string().min(1).max(60), name: z.string().trim().min(2).max(120) }).strict(), req.data);
  await requireOrgRole(orgId, auth.uid, 'org_admin');
  const ref = db().doc(`organisations/${orgId}`);
  const before = (await ref.get()).get('name');
  await ref.update({ name });
  await audit(auth.uid, 'updateOrg', `organisations/${orgId}`, { name: before }, { name });
  return { ok: true };
});

export const inviteMember = onCall(async (req) => {
  const auth = signedIn(req);
  const { orgId, email, role } = parse(z.object({ orgId: z.string().min(1).max(60), email: z.string().email().max(200), role: OrgRole.default('org_member') }).strict(), req.data);
  await requireOrgRole(orgId, auth.uid, 'org_admin');
  const org = await db().doc(`organisations/${orgId}`).get();
  const ref = await db().collection(`organisations/${orgId}/invites`).add({ email: email.toLowerCase(), role, invitedBy: auth.uid, status: 'pending', createdAt: FieldValue.serverTimestamp(), orgName: org.get('name') });
  await db().collection('mail').add({
    to: email,
    message: { subject: `You are invited to ${org.get('name')} on Africa Food Basket`, text: `${auth.token.email ?? 'A colleague'} invited you to join ${org.get('name')}.\n\nSign in with this e-mail address and open ${SITE}/org to accept.` },
    createdAt: FieldValue.serverTimestamp(),
  });
  await audit(auth.uid, 'inviteMember', `organisations/${orgId}/invites/${ref.id}`, null, { email, role });
  return { id: ref.id };
});

export const myInvites = onCall(async (req) => {
  const auth = signedIn(req);
  const email = String(auth.token.email ?? '').toLowerCase();
  if (!email) return { items: [] };
  const s = await db().collectionGroup('invites').where('email', '==', email).where('status', '==', 'pending').get();
  return { items: s.docs.map((d) => ({ id: d.id, orgId: d.ref.parent.parent!.id, orgName: d.get('orgName'), role: d.get('role') })) };
});

export const acceptInvite = onCall(async (req) => {
  const auth = signedIn(req);
  const { orgId, inviteId } = parse(z.object({ orgId: z.string().min(1).max(60), inviteId: z.string().min(1).max(60) }).strict(), req.data);
  const inv = db().doc(`organisations/${orgId}/invites/${inviteId}`);
  await db().runTransaction(async (tx) => {
    const [i, u] = await Promise.all([tx.get(inv), tx.get(db().doc(`users/${auth.uid}`))]);
    if (!i.exists || i.get('status') !== 'pending') throw new HttpsError('not-found', 'This invitation is no longer open.');
    if (i.get('email') !== String(auth.token.email ?? '').toLowerCase()) throw new HttpsError('permission-denied', 'This invitation is for a different e-mail address.');
    if (u.get('org') && u.get('org') !== orgId) throw new HttpsError('failed-precondition', 'Leave your current organisation first.');
    tx.set(db().doc(`organisations/${orgId}/members/${auth.uid}`), { role: i.get('role'), email: auth.token.email ?? '', name: u.get('name') ?? '', joinedAt: FieldValue.serverTimestamp() });
    tx.update(inv, { status: 'accepted', acceptedAt: FieldValue.serverTimestamp(), uid: auth.uid });
    tx.set(db().doc(`users/${auth.uid}`), { org: orgId }, { merge: true });
    tx.update(db().doc(`organisations/${orgId}`), { memberCount: FieldValue.increment(1) });
  });
  await audit(auth.uid, 'acceptInvite', `organisations/${orgId}`, null, { inviteId });
  return { ok: true };
});

export const setMemberRole = onCall(async (req) => {
  const auth = signedIn(req);
  const { orgId, uid, role } = parse(z.object({ orgId: z.string().min(1), uid: z.string().min(1), role: OrgRole }).strict(), req.data);
  await requireOrgRole(orgId, auth.uid, 'org_admin');
  const ref = db().doc(`organisations/${orgId}/members/${uid}`);
  const m = await ref.get();
  if (!m.exists) throw new HttpsError('not-found', 'No such member.');
  if (m.get('role') === 'org_admin' && role !== 'org_admin') {
    const admins = await db().collection(`organisations/${orgId}/members`).where('role', '==', 'org_admin').count().get();
    if (admins.data().count <= 1) throw new HttpsError('failed-precondition', 'An organisation needs at least one administrator.');
  }
  await ref.update({ role });
  await audit(auth.uid, 'setMemberRole', `organisations/${orgId}/members/${uid}`, { role: m.get('role') }, { role });
  return { ok: true };
});

export const removeMember = onCall(async (req) => {
  const auth = signedIn(req);
  const { orgId, uid } = parse(z.object({ orgId: z.string().min(1), uid: z.string().min(1) }).strict(), req.data);
  if (uid !== auth.uid) await requireOrgRole(orgId, auth.uid, 'org_admin');
  const ref = db().doc(`organisations/${orgId}/members/${uid}`);
  const m = await ref.get();
  if (!m.exists) throw new HttpsError('not-found', 'No such member.');
  if (m.get('role') === 'org_admin') {
    const admins = await db().collection(`organisations/${orgId}/members`).where('role', '==', 'org_admin').count().get();
    if (admins.data().count <= 1) throw new HttpsError('failed-precondition', 'An organisation needs at least one administrator.');
  }
  const batch = db().batch();
  batch.delete(ref);
  batch.set(db().doc(`users/${uid}`), { org: null }, { merge: true });
  batch.update(db().doc(`organisations/${orgId}`), { memberCount: FieldValue.increment(-1) });
  await batch.commit();
  await audit(auth.uid, 'removeMember', `organisations/${orgId}/members/${uid}`, { role: m.get('role') }, null);
  return { ok: true };
});
