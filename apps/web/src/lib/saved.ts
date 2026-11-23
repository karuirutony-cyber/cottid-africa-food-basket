/**
 * Saved views and scenarios. Signed in: users/{uid}/saved in Firestore (cached offline by the
 * persistent cache, so they open without a connection). Signed out: this device only.
 */
import type { User } from 'firebase/auth';
import { getFirebase } from './firebase';

export interface SavedItem {
  id?: string;
  kind: string;
  title: string;
  href: string;
  at: string;
}
const KEY = 'afb-saved';

const local = (): SavedItem[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedItem[];
  } catch {
    return [];
  }
};
const setLocal = (items: SavedItem[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 50)));
  } catch {
    /* storage blocked */
  }
};

export async function listSaved(user: User | null): Promise<SavedItem[]> {
  if (!user) return local();
  const { db } = await getFirebase();
  const { collection, getDocs, orderBy, query, limit } = await import('firebase/firestore');
  const snap = await getDocs(query(collection(db, `users/${user.uid}/saved`), orderBy('at', 'desc'), limit(100)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedItem, 'id'>) }));
}

export async function addSaved(user: User | null, item: Omit<SavedItem, 'at' | 'id'>): Promise<void> {
  const full = { ...item, at: new Date().toISOString() };
  if (!user) return setLocal([full, ...local()]);
  const { db } = await getFirebase();
  const { addDoc, collection } = await import('firebase/firestore');
  await addDoc(collection(db, `users/${user.uid}/saved`), full);
}

export async function removeSaved(user: User | null, item: SavedItem, index: number): Promise<void> {
  if (!user || !item.id) return setLocal(local().filter((_, i) => i !== index));
  const { db } = await getFirebase();
  const { deleteDoc, doc } = await import('firebase/firestore');
  await deleteDoc(doc(db, `users/${user.uid}/saved/${item.id}`));
}

/** After sign-in, move anything saved on this device into the account. */
export async function moveLocalToAccount(user: User): Promise<number> {
  const items = local();
  if (!items.length) return 0;
  const { db } = await getFirebase();
  const { addDoc, collection } = await import('firebase/firestore');
  for (const it of items) await addDoc(collection(db, `users/${user.uid}/saved`), it);
  setLocal([]);
  return items.length;
}
