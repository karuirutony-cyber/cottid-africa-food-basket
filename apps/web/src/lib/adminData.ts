/**
 * Staff console data. Every action goes to its Cloud Function first (role and two-step checked again,
 * audit written server-side). While the functions are not deployed, the actions the security rules allow
 * staff to do directly fall back to Firestore: reading suggestions, users and the audit log, approving or
 * rejecting a suggestion (with an audit entry), and changing a profile role. Everything else needs the
 * functions and says so.
 */
import { call, functionsUnavailable } from './call';
import { getFirebase } from './firebase';

const iso = (v: unknown) => (v as { toDate?: () => Date })?.toDate?.().toISOString() ?? null;

type Fallback = (data: Record<string, unknown>) => Promise<unknown>;

const FALLBACKS: Record<string, Fallback> = {
  async adminStats() {
    const { db } = await getFirebase();
    const fs = await import('firebase/firestore');
    const count = async (q: ReturnType<typeof fs.query>) => (await fs.getCountFromServer(q)).data().count;
    const s = fs.collection(db, 'submissions');
    const [pending, approved, published, rejected, users, meta] = await Promise.all([
      count(fs.query(s, fs.where('status', '==', 'pending'))),
      count(fs.query(s, fs.where('status', '==', 'approved'))),
      count(fs.query(s, fs.where('status', '==', 'published'))),
      count(fs.query(s, fs.where('status', '==', 'rejected'))),
      count(fs.query(fs.collection(db, 'users'))).catch(() => null),
      fs.getDoc(fs.doc(db, 'meta/dataset')).catch(() => null),
    ]);
    const m = meta?.data();
    return { pending, approved, published, rejected, users, dataset: m ? { version: m.version, built: m.built, seeded: m.seeded } : null };
  },

  async reviewQueue({ status }) {
    const { db } = await getFirebase();
    const fs = await import('firebase/firestore');
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'submissions'), fs.where('status', '==', status ?? 'pending'), fs.limit(200)));
    const items = snap.docs
      .map((d) => {
        const x = d.data();
        return { id: d.id, ...x, patch: x.patch ?? null, createdAt: iso(x.createdAt), reviewedAt: iso(x.reviewedAt), publishedAt: iso(x.publishedAt) };
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { items };
  },

  async review({ id, decision, note }) {
    const { db, auth } = await getFirebase();
    const fs = await import('firebase/firestore');
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Sign in first.');
    const ref = fs.doc(db, 'submissions', String(id));
    const before = (await fs.getDoc(ref)).get('status');
    if (before !== 'pending') throw new Error(`Already ${before}.`);
    await fs.updateDoc(ref, { status: decision, reviewer: uid, reviewedAt: fs.serverTimestamp(), note: String(note ?? '') });
    // The audit entry is written by the review function; here we write it ourselves where the rules allow.
    await fs
      .addDoc(fs.collection(db, 'auditLog'), { actor: uid, action: `review:${decision}`, target: `submissions/${id}`, before: { status: before }, after: { status: decision, note: note ?? '' }, time: fs.serverTimestamp() })
      .catch(() => undefined);
    return { ok: true };
  },

  async auditList({ limit }) {
    const { db } = await getFirebase();
    const fs = await import('firebase/firestore');
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'auditLog'), fs.orderBy('time', 'desc'), fs.limit(Number(limit ?? 200))));
    return { items: snap.docs.map((d) => ({ id: d.id, ...d.data(), time: iso(d.get('time')) })) };
  },

  async adminListUsers() {
    const { db } = await getFirebase();
    const fs = await import('firebase/firestore');
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'users'), fs.limit(500)));
    return {
      items: snap.docs.map((d) => ({ uid: d.id, name: d.get('name'), email: d.get('email'), role: d.get('role'), org: d.get('org') ?? null, createdAt: iso(d.get('createdAt')), lastSeen: iso(d.get('lastSeen')) })),
    };
  },

  async setUserRole({ uid, role }) {
    const { db } = await getFirebase();
    const fs = await import('firebase/firestore');
    await fs.updateDoc(fs.doc(db, 'users', String(uid)), { role });
    return { ok: true, claimPending: true };
  },
};

/** Admin actions that work today without the functions (shown in the console). */
export const WORKS_WITHOUT_FUNCTIONS = new Set(Object.keys(FALLBACKS));

export async function adminCall<T = unknown>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  try {
    return await call<T>(name, data);
  } catch (e) {
    const fb = FALLBACKS[name];
    if (!fb || !functionsUnavailable(e)) throw e;
    return (await fb(data)) as T;
  }
}
