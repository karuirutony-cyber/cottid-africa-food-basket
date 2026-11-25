import { getFirebase } from './firebase';
import i18n from './i18n';

/** The error used once the functions are known to be unreachable (and for server-only actions). */
export class ServerOffError extends Error {
  code = 'functions/unavailable';
  constructor() {
    super('functions unavailable');
  }
}

/**
 * Set after the first call that finds the functions missing, so later calls in this visit fail at once
 * (and fall back) instead of waiting on a request that cannot succeed. Cleared on reload.
 */
let functionsDown = false;
export const serverIsOff = () => functionsDown;

/** Calls a Cloud Function (callable) and returns its data; errors carry the function's message. */
export async function call<T = unknown>(name: string, data: unknown = {}): Promise<T> {
  if (functionsDown) throw new ServerOffError();
  const { functions } = await getFirebase();
  const { httpsCallable } = await import('firebase/functions');
  try {
    const res = await httpsCallable(functions, name)(data);
    return res.data as T;
  } catch (e) {
    // Offline is not "not deployed": only remember a missing deployment while the browser is online.
    if (functionsUnavailable(e) && (typeof navigator === 'undefined' || navigator.onLine)) functionsDown = true;
    throw e;
  }
}

/**
 * True when the function could not be reached at all (not deployed yet, blocked, or offline), as
 * opposed to the function answering with an error. A missing function fails its CORS preflight, which
 * the SDK reports as "internal" with no details.
 */
export function functionsUnavailable(e: unknown): boolean {
  const err = e as { code?: string; message?: string; details?: unknown };
  return (
    e instanceof ServerOffError ||
    err?.code === 'functions/unavailable' ||
    err?.code === 'functions/not-found' ||
    (err?.code === 'functions/internal' && /^internal$/i.test(String(err.message ?? '').trim()))
  );
}

/** A message a person can act on, never a raw code such as "internal" or "permission-denied". */
export function callMessage(e: unknown): string {
  if (functionsUnavailable(e)) return i18n.t('status.serverOff');
  const code = String((e as { code?: string })?.code ?? '');
  // Firestore codes (direct reads and writes); a function's own errors keep their message.
  if (code === 'permission-denied') return i18n.t('status.denied');
  if (code === 'failed-precondition' && /index/i.test(String((e as Error).message))) return i18n.t('status.serverOff');
  if (code === 'unauthenticated') return i18n.t('status.signInAgain');
  const m = (e as { message?: string })?.message ?? String(e);
  const clean = m.replace(/^(FirebaseError: )?/, '').replace(/ \(functions\/[\w-]+\)\.?$/, '').trim();
  return !clean || /^(internal|unknown|undefined)$/i.test(clean) ? i18n.t('status.failed') : clean;
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
