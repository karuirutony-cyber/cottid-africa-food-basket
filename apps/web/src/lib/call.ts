import { getFirebase } from './firebase';
import i18n from './i18n';

/** Calls a Cloud Function (callable) and returns its data; errors carry the function's message. */
export async function call<T = unknown>(name: string, data: unknown = {}): Promise<T> {
  const { functions } = await getFirebase();
  const { httpsCallable } = await import('firebase/functions');
  const res = await httpsCallable(functions, name)(data);
  return res.data as T;
}

/**
 * True when the function could not be reached at all (not deployed yet, blocked, or offline), as
 * opposed to the function answering with an error. A missing function fails its CORS preflight, which
 * the SDK reports as "internal" with no details.
 */
export function functionsUnavailable(e: unknown): boolean {
  const err = e as { code?: string; message?: string; details?: unknown };
  return (
    err?.code === 'functions/unavailable' ||
    err?.code === 'functions/not-found' ||
    (err?.code === 'functions/internal' && /^internal$/i.test(String(err.message ?? '').trim()))
  );
}

export function callMessage(e: unknown): string {
  if (functionsUnavailable(e)) return i18n.t('status.serverOff');
  const m = (e as { message?: string })?.message ?? String(e);
  return m.replace(/^(FirebaseError: )?/, '').replace(/ \(functions\/[\w-]+\)\.?$/, '');
}

export interface Submission {
  id: string;
  uid: string;
  email?: string | null;
  target: string;
  page: string;
  item: string;
  text: string;
  sourceUrl: string;
  patch: Record<string, string> | null;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  note?: string;
  reviewer?: string;
  createdAt: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  publishedPatch?: Record<string, string>;
}

type SubmitInput = Pick<Submission, 'target' | 'page' | 'item' | 'text' | 'sourceUrl'> & { patch?: Record<string, string> };

/**
 * Sends a suggestion. Uses the submit function (rate limit, validation); if the functions are not
 * deployed, writes the pending submission directly, which the security rules allow for its author.
 */
export async function submitSuggestion(uid: string, input: SubmitInput): Promise<string> {
  try {
    return (await call<{ id: string }>('submit', input)).id;
  } catch (e) {
    if (!functionsUnavailable(e)) throw e;
  }
  const text = input.text.trim();
  if (text.length < 10) throw new Error(i18n.t('contribute.tooShort'));
  const { db } = await getFirebase();
  const fs = await import('firebase/firestore');
  const ref = await fs.addDoc(fs.collection(db, 'submissions'), {
    uid,
    target: input.target,
    page: input.page.slice(0, 300),
    item: input.item.slice(0, 200),
    text: text.slice(0, 4000),
    sourceUrl: input.sourceUrl,
    ...(input.patch && Object.keys(input.patch).length ? { patch: input.patch } : {}),
    status: 'pending',
    createdAt: fs.serverTimestamp(),
  });
  return ref.id;
}

/** Your own suggestions: from the function, or read directly (own submissions only) if it is not deployed. */
export async function listMySuggestions(uid: string): Promise<Submission[]> {
  try {
    return (await call<{ items: Submission[] }>('myContributions')).items;
  } catch (e) {
    if (!functionsUnavailable(e)) throw e;
  }
  const { db } = await getFirebase();
  const fs = await import('firebase/firestore');
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'submissions'), fs.where('uid', '==', uid), fs.limit(50)));
  const iso = (v: unknown) => (v as { toDate?: () => Date })?.toDate?.().toISOString() ?? null;
  return snap.docs
    .map((d) => {
      const x = d.data();
      return { id: d.id, ...x, patch: x.patch ?? null, createdAt: iso(x.createdAt), reviewedAt: iso(x.reviewedAt), publishedAt: iso(x.publishedAt) } as Submission;
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
