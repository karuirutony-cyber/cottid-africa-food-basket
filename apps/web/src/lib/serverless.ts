/**
 * Every server action, with a direct-Firestore fallback where the security rules allow it.
 *
 * Each action goes to its Cloud Function first (validation, rate limits, audit written server-side).
 * While the functions are not deployed, the actions the rules allow are done directly from the browser,
 * with the same checks and an audit entry in the actor's own name. Actions that need the server
 * (building datasets, ingest, sending alerts, issuing API keys) say so in plain words.
 */
import type * as FirestoreModule from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { call, functionsUnavailable, ServerOffError } from './call';
import { getFirebase } from './firebase';
import i18n from './i18n';

type Fs = typeof FirestoreModule;
type Data = Record<string, unknown>;
type Fallback = (data: Data, ctx: { fs: Fs; db: Firestore; uid: string; email: string }) => Promise<unknown>;

const iso = (v: unknown) => (v as { toDate?: () => Date })?.toDate?.().toISOString() ?? null;
/** Firestore refuses undefined values; JSON drops them. */
const plain = (v: unknown) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const fail = (key: string, opts?: Record<string, unknown>) => {
  throw new Error(i18n.t(key, opts));
};

/** Appends an audit entry in the actor's own name (the rules allow nothing else). Never blocks the action. */
async function audit(ctx: Parameters<Fallback>[1], action: string, target: string, before: unknown, after: unknown) {
  await ctx.fs
    .addDoc(ctx.fs.collection(ctx.db, 'auditLog'), { actor: ctx.uid, action, target, before: plain(before), after: plain(after), time: ctx.fs.serverTimestamp() })
    .catch(() => undefined);
}

/** Records staff may browse and correct (as in functions/src/admin.ts), and fields nobody edits. */
const EDITABLE = ['buyers', 'suppliers', 'compliance', 'events', 'calls', 'policies', 'interventions', 'funders', 'sources', 'prices', 'duties', 'rateCards', 'fx'];
const PUBLISHABLE = ['buyers', 'suppliers', 'compliance', 'events', 'calls', 'policies', 'interventions', 'funders', 'sources'];
const LOCKED = new Set(['ref', 'id', 'src', 'publishedAt', 'publishedBy', 'lastSubmission', 'editedAt', 'editedBy']);
const PATH = /^[a-zA-Z]+\/[\w.-]+$/;
const ORG_ROLES = ['org_member', 'org_analyst', 'org_admin'];

function checkPatch(path: string, patch: Data, allowed: string[], rec: Data | undefined) {
  if (!PATH.test(path)) fail('server.badPath');
  const coll = path.split('/')[0]!;
  if (!allowed.includes(coll)) fail('server.notEditable', { coll });
  const keys = Object.keys(patch);
  if (!keys.length) fail('server.nothingChanged');
  const bad = keys.filter((k) => LOCKED.has(k) || k.startsWith('_') || k.includes('.'));
  if (bad.length) fail('server.lockedFields', { fields: bad.join(', ') });
  if (!rec) fail('server.noRecord', { path });
  const unknown = keys.filter((k) => rec![k] === undefined);
  if (unknown.length) fail('server.unknownFields', { path, fields: unknown.join(', ') });
}

const SERVER_ONLY = new Set(['buildDataset', 'publishDataset', 'rollbackDataset', 'runIngest', 'runAlertsNow', 'createApiKey', 'revokeApiKey', 'bootstrap']);

const FALLBACKS: Record<string, Fallback> = {
  // ---- staff console: overview and review ---------------------------------------------------------
  async adminStats(_d, { fs, db }) {
    const count = async (q: ReturnType<Fs['query']>) => (await fs.getCountFromServer(q)).data().count;
    const s = fs.collection(db, 'submissions');
    const by = (status: string) => count(fs.query(s, fs.where('status', '==', status)));
    const [pending, approved, published, rejected, users, meta] = await Promise.all([
      by('pending'),
      by('approved'),
      by('published'),
      by('rejected'),
      count(fs.query(fs.collection(db, 'users'))).catch(() => null),
      fs.getDoc(fs.doc(db, 'meta/dataset')).catch(() => null),
    ]);
    const m = meta?.data();
    return { pending, approved, published, rejected, users, dataset: m ? { version: m.version ?? null, built: m.built ?? null, seeded: iso(m.seeded) ?? m.seeded ?? null } : null };
  },

  async reviewQueue({ status }, { fs, db }) {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'submissions'), fs.where('status', '==', String(status ?? 'pending')), fs.limit(200)));
    const items = snap.docs
      .map((d) => {
        const x = d.data();
        return { id: d.id, ...x, patch: x.patch ?? null, createdAt: iso(x.createdAt), reviewedAt: iso(x.reviewedAt), publishedAt: iso(x.publishedAt) };
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { items };
  },

  async review({ id, decision, note }, ctx) {
    const { fs, db, uid } = ctx;
    if (decision !== 'approved' && decision !== 'rejected') fail('server.badDecision');
    const ref = fs.doc(db, 'submissions', String(id));
    const snap = await fs.getDoc(ref);
    if (!snap.exists()) fail('server.noSubmission');
    const before = snap.get('status');
    if (before !== 'pending') fail('server.already', { status: before });
    await fs.updateDoc(ref, { status: decision, reviewer: uid, reviewedAt: fs.serverTimestamp(), note: String(note ?? '').slice(0, 2000) });
    await audit(ctx, `review:${decision}`, `submissions/${id}`, { status: before }, { status: decision, note: note ?? '' });
    return { ok: true };
  },

  async getRecord({ path }, { fs, db }) {
    const p = String(path);
    if (!PATH.test(p) || !PUBLISHABLE.includes(p.split('/')[0]!)) fail('server.badPath');
    const s = await fs.getDoc(fs.doc(db, p));
    return { exists: s.exists(), data: s.exists() ? { ...s.data(), publishedAt: iso(s.get('publishedAt')) } : null };
  },

  async publishRecord({ id, target, patch }, ctx) {
    const { fs, db, uid } = ctx;
    const t = String(target);
    const p = (patch ?? {}) as Data;
    const subRef = fs.doc(db, 'submissions', String(id));
    const sub = await fs.getDoc(subRef);
    if (!sub.exists()) fail('server.noSubmission');
    if (sub.get('status') !== 'approved') fail('server.onlyApproved');
    const recRef = PATH.test(t) ? fs.doc(db, t) : null;
    const rec = recRef ? await fs.getDoc(recRef) : null;
    checkPatch(t, p, PUBLISHABLE, rec?.exists() ? rec.data() : undefined);
    const before = Object.fromEntries(Object.keys(p).map((k) => [k, rec!.get(k) ?? null]));
    const batch = fs.writeBatch(db);
    batch.set(recRef!, { ...p, publishedAt: fs.serverTimestamp(), publishedBy: uid, lastSubmission: String(id) }, { merge: true });
    batch.update(subRef, { status: 'published', publishedAt: fs.serverTimestamp(), publishedTarget: t, publishedPatch: p });
    await batch.commit();
    await audit(ctx, 'publishRecord', t, before, p);
    return { ok: true };
  },

  async auditList({ limit }, { fs, db }) {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'auditLog'), fs.orderBy('time', 'desc'), fs.limit(Math.min(Number(limit ?? 200), 500))));
    return { items: snap.docs.map((d) => ({ id: d.id, ...d.data(), time: iso(d.get('time')) })) };
  },

  // ---- staff console: people, organisations, settings ---------------------------------------------
  async adminListUsers(_d, { fs, db }) {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'users'), fs.limit(500)));
    return {
      items: snap.docs.map((d) => ({ uid: d.id, name: d.get('name'), email: d.get('email'), role: d.get('role') ?? 'member', org: d.get('org') ?? null, createdAt: iso(d.get('createdAt')), lastSeen: iso(d.get('lastSeen')) })),
    };
  },

  async setUserRole({ uid: target, role }, ctx) {
    const { fs, db } = ctx;
    const ref = fs.doc(db, 'users', String(target));
    const before = (await fs.getDoc(ref)).get('role') ?? null;
    await fs.updateDoc(ref, { role });
    await audit(ctx, 'setUserRole', `users/${target}`, { role: before }, { role });
    return { ok: true, claimPending: true };
  },

  async adminListOrgs(_d, { fs, db }) {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'organisations'), fs.limit(500)));
    return { items: snap.docs.map((d) => ({ id: d.id, name: d.get('name'), plan: d.get('plan') ?? 'free', memberCount: d.get('memberCount') ?? null, createdAt: iso(d.get('createdAt')) })) };
  },

  async updateSettings(data, ctx) {
    const { fs, db } = ctx;
    const ref = fs.doc(db, 'settings/platform');
    const before = (await fs.getDoc(ref)).data() ?? null;
    const patch = plain({ features: data.features, apiQuotas: data.apiQuotas, maintenance: data.maintenance });
    for (const k of Object.keys(patch)) if (patch[k] === null) delete patch[k];
    await fs.setDoc(ref, patch, { merge: true });
    await audit(ctx, 'updateSettings', 'settings/platform', before, patch);
    return { ok: true };
  },

  // ---- staff console: records and data --------------------------------------------------------------
  async adminList({ collection, limit, q }, { fs, db }) {
    const coll = String(collection);
    if (!EDITABLE.includes(coll)) fail('server.notEditable', { coll });
    const n = Math.min(Number(limit ?? 50), 200);
    const s = await fs.getDocs(fs.query(fs.collection(db, coll), fs.orderBy(fs.documentId()), fs.limit(q ? 500 : n)));
    const needle = q ? String(q).toLowerCase() : '';
    const docs = needle ? s.docs.filter((d) => JSON.stringify(d.data()).toLowerCase().includes(needle)).slice(0, n) : s.docs;
    return { items: docs.map((d) => ({ id: d.id, data: d.data() })), next: s.docs.length ? s.docs[s.docs.length - 1]!.id : null };
  },

  async adminUpdate({ path, patch, reason }, ctx) {
    const { fs, db, uid } = ctx;
    const p = String(path);
    const changes = (patch ?? {}) as Data;
    if (String(reason ?? '').trim().length < 5) fail('server.reason');
    const ref = PATH.test(p) ? fs.doc(db, p) : null;
    const rec = ref ? await fs.getDoc(ref) : null;
    checkPatch(p, changes, EDITABLE, rec?.exists() ? rec.data() : undefined);
    const before = Object.fromEntries(Object.keys(changes).map((k) => [k, rec!.get(k) ?? null]));
    await fs.setDoc(ref!, { ...changes, editedAt: fs.serverTimestamp(), editedBy: uid, publishedAt: fs.serverTimestamp() }, { merge: true });
    await audit(ctx, 'adminUpdate', p, before, { ...changes, reason });
    return { ok: true };
  },

  async listDatasets(_d, { fs, db }) {
    const [s, meta] = await Promise.all([fs.getDocs(fs.query(fs.collection(db, 'datasets'), fs.orderBy('builtAt', 'desc'), fs.limit(50))), fs.getDoc(fs.doc(db, 'meta/dataset'))]);
    return {
      live: meta.get('version') ?? null,
      items: s.docs.map((d) => {
        const x = d.data();
        return { version: d.id, status: x.status ?? 'built', checksPassed: !!x.checksPassed, checks: x.checks ?? [], origin: x.origin ?? '', previous: x.previous ?? null, builtAt: iso(x.builtAt), publishedAt: iso(x.publishedAt) };
      }),
    };
  },

  async listIngestRuns(_d, { fs, db }) {
    const s = await fs.getDocs(fs.query(fs.collection(db, 'ingestRuns'), fs.orderBy('startedAt', 'desc'), fs.limit(30)));
    return { items: s.docs.map((d) => ({ id: d.id, ...d.data(), startedAt: iso(d.get('startedAt')), finishedAt: iso(d.get('finishedAt')) })) };
  },

  // ---- API keys: list your own (issuing and revoking need the server) --------------------------------
  async listApiKeys(_d, { fs, db, uid }) {
    const s = await fs.getDocs(fs.query(fs.collection(db, 'apiKeys'), fs.where('owner', '==', uid)));
    const today = new Date().toISOString().slice(0, 10);
    return {
      items: s.docs.map((d) => ({
        id: d.id,
        name: d.get('name') ?? '',
        prefix: d.get('prefix') ?? '',
        quota: d.get('quota') ?? 0,
        usedToday: Number((d.get('usage') as Record<string, number> | undefined)?.[today] ?? 0),
        total: d.get('total') ?? 0,
        revoked: !!d.get('revoked'),
        createdAt: iso(d.get('createdAt')),
        lastUsed: iso(d.get('lastUsed')),
      })),
    };
  },

  // ---- organisations ----------------------------------------------------------------------------------
  async orgInfo({ orgId }, { fs, db, uid }) {
    const id = String(orgId);
    const me = await fs.getDoc(fs.doc(db, `organisations/${id}/members/${uid}`));
    if (!me.exists()) {
      // Removed by an administrator: forget the organisation on your own profile.
      await fs.updateDoc(fs.doc(db, 'users', uid), { org: null }).catch(() => undefined);
      fail('server.notMember');
    }
    const admin = me.get('role') === 'org_admin';
    const [org, members, invites] = await Promise.all([
      fs.getDoc(fs.doc(db, `organisations/${id}`)),
      fs.getDocs(fs.collection(db, `organisations/${id}/members`)),
      admin ? fs.getDocs(fs.query(fs.collection(db, `organisations/${id}/invites`), fs.where('status', '==', 'pending'))) : Promise.resolve(null),
    ]);
    return {
      org: { id, name: org.get('name'), plan: org.get('plan') ?? 'free' },
      myRole: me.get('role'),
      members: members.docs.map((d) => ({ uid: d.id, role: d.get('role'), email: d.get('email') ?? '', name: d.get('name') ?? '' })),
      invites: invites ? invites.docs.map((d) => ({ id: d.id, email: d.get('email'), role: d.get('role') })) : [],
    };
  },

  async myInvites(_d, { fs, db, email }) {
    if (!email) return { items: [] };
    const s = await fs.getDocs(fs.query(fs.collectionGroup(db, 'invites'), fs.where('email', '==', email.toLowerCase()), fs.where('status', '==', 'pending')));
    return { items: s.docs.map((d) => ({ id: d.id, orgId: d.ref.parent.parent!.id, orgName: d.get('orgName') ?? '', role: d.get('role') })) };
  },

  async createOrg({ name }, ctx) {
    const { fs, db, uid, email } = ctx;
    const n = String(name ?? '').trim();
    if (n.length < 2 || n.length > 120) fail('server.orgName');
    const profile = await fs.getDoc(fs.doc(db, 'users', uid));
    if (profile.get('org')) fail('server.hasOrg');
    const ref = fs.doc(fs.collection(db, 'organisations'));
    const batch = fs.writeBatch(db);
    batch.set(ref, { name: n, plan: 'free', createdBy: uid, createdAt: fs.serverTimestamp(), memberCount: 1 });
    batch.set(fs.doc(db, `organisations/${ref.id}/members/${uid}`), { role: 'org_admin', email, name: profile.get('name') ?? '', joinedAt: fs.serverTimestamp() });
    batch.update(fs.doc(db, 'users', uid), { org: ref.id });
    await batch.commit();
    await audit(ctx, 'createOrg', `organisations/${ref.id}`, null, { name: n });
    return { id: ref.id };
  },

  async updateOrg({ orgId, name }, ctx) {
    const { fs, db } = ctx;
    const n = String(name ?? '').trim();
    if (n.length < 2 || n.length > 120) fail('server.orgName');
    const ref = fs.doc(db, `organisations/${orgId}`);
    const before = (await fs.getDoc(ref)).get('name');
    await fs.updateDoc(ref, { name: n });
    await audit(ctx, 'updateOrg', `organisations/${orgId}`, { name: before }, { name: n });
    return { ok: true };
  },

  async inviteMember({ orgId, email: to, role }, ctx) {
    const { fs, db, uid } = ctx;
    const addr = String(to ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) fail('server.badEmail');
    const r = ORG_ROLES.includes(String(role)) ? String(role) : 'org_member';
    const org = await fs.getDoc(fs.doc(db, `organisations/${orgId}`));
    const ref = await fs.addDoc(fs.collection(db, `organisations/${orgId}/invites`), { email: addr, role: r, invitedBy: uid, status: 'pending', createdAt: fs.serverTimestamp(), orgName: org.get('name') ?? '' });
    await audit(ctx, 'inviteMember', `organisations/${orgId}/invites/${ref.id}`, null, { email: addr, role: r });
    return { id: ref.id, emailed: false };
  },

  async acceptInvite({ orgId, inviteId }, ctx) {
    const { fs, db, uid, email } = ctx;
    const invRef = fs.doc(db, `organisations/${orgId}/invites/${inviteId}`);
    const [inv, profile] = await Promise.all([fs.getDoc(invRef), fs.getDoc(fs.doc(db, 'users', uid))]);
    if (!inv.exists() || inv.get('status') !== 'pending') fail('server.inviteClosed');
    if (inv.get('email') !== email.toLowerCase()) fail('server.inviteOther');
    if (profile.get('org') && profile.get('org') !== orgId) fail('server.leaveFirst');
    const batch = fs.writeBatch(db);
    batch.set(fs.doc(db, `organisations/${orgId}/members/${uid}`), { role: inv.get('role'), email, name: profile.get('name') ?? '', joinedAt: fs.serverTimestamp(), invite: String(inviteId) });
    batch.update(invRef, { status: 'accepted', acceptedAt: fs.serverTimestamp(), uid });
    batch.update(fs.doc(db, `organisations/${orgId}`), { memberCount: fs.increment(1) });
    batch.update(fs.doc(db, 'users', uid), { org: String(orgId) });
    await batch.commit();
    await audit(ctx, 'acceptInvite', `organisations/${orgId}`, null, { inviteId });
    return { ok: true };
  },

  async setMemberRole({ orgId, uid: member, role }, ctx) {
    const { fs, db } = ctx;
    if (!ORG_ROLES.includes(String(role))) fail('server.badRole');
    const ref = fs.doc(db, `organisations/${orgId}/members/${member}`);
    const m = await fs.getDoc(ref);
    if (!m.exists()) fail('server.noMember');
    if (m.get('role') === 'org_admin' && role !== 'org_admin') await lastAdminCheck(ctx, String(orgId));
    await fs.updateDoc(ref, { role });
    await audit(ctx, 'setMemberRole', `organisations/${orgId}/members/${member}`, { role: m.get('role') }, { role });
    return { ok: true };
  },

  async removeMember({ orgId, uid: member }, ctx) {
    const { fs, db, uid } = ctx;
    const ref = fs.doc(db, `organisations/${orgId}/members/${member}`);
    const m = await fs.getDoc(ref);
    if (!m.exists()) fail('server.noMember');
    if (m.get('role') === 'org_admin') await lastAdminCheck(ctx, String(orgId));
    await fs.deleteDoc(ref);
    // The count is kept by administrators; a member leaving on their own leaves it to the next admin edit.
    await fs.updateDoc(fs.doc(db, `organisations/${orgId}`), { memberCount: fs.increment(-1) }).catch(() => undefined);
    if (member === uid) await fs.updateDoc(fs.doc(db, 'users', uid), { org: null });
    await audit(ctx, 'removeMember', `organisations/${orgId}/members/${member}`, { role: m.get('role') }, null);
    return { ok: true };
  },
};

async function lastAdminCheck({ fs, db }: Parameters<Fallback>[1], orgId: string) {
  const admins = await fs.getCountFromServer(fs.query(fs.collection(db, `organisations/${orgId}/members`), fs.where('role', '==', 'org_admin')));
  if (admins.data().count <= 1) fail('server.lastAdmin');
}

/** Admin actions that work today without the functions. */
export const WORKS_WITHOUT_FUNCTIONS = new Set(Object.keys(FALLBACKS));
/** Actions that only the server can do. */
export const needsServer = (name: string) => SERVER_ONLY.has(name);

/** Calls the function; if the functions are not deployed, does the same directly where the rules allow. */
export async function serverCall<T = unknown>(name: string, data: unknown = {}): Promise<T> {
  try {
    return await call<T>(name, data);
  } catch (e) {
    const fb = FALLBACKS[name];
    if (!functionsUnavailable(e)) throw e;
    if (!fb) throw new ServerOffError();
    const { db, auth } = await getFirebase();
    const user = auth.currentUser;
    if (!user) fail('status.signInAgain');
    const fs = await import('firebase/firestore');
    return (await fb((data ?? {}) as Data, { fs, db, uid: user!.uid, email: user!.email ?? '' })) as T;
  }
}
