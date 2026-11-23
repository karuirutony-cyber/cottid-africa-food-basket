import { getFirebase } from './firebase';

/** Calls a Cloud Function (callable) and returns its data; errors carry the function's message. */
export async function call<T = unknown>(name: string, data: unknown = {}): Promise<T> {
  const { functions } = await getFirebase();
  const { httpsCallable } = await import('firebase/functions');
  const res = await httpsCallable(functions, name)(data);
  return res.data as T;
}

export function callMessage(e: unknown): string {
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
