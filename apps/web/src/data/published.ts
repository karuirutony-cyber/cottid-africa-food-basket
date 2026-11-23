import { useQuery } from '@tanstack/react-query';
import { getFirebase } from '@/lib/firebase';

/**
 * Records changed through the review flow (they carry `publishedAt`), read from Firestore and laid over
 * the reference data, so a published correction shows without rebuilding the site. Returns id -> fields.
 * If Firestore is unreachable the page simply shows the reference data.
 */
export function usePublished(collection: 'buyers' | 'suppliers') {
  return useQuery({
    queryKey: ['published', collection],
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { db } = await getFirebase();
      const { collection: coll, getDocs, query, where } = await import('firebase/firestore');
      const snap = await getDocs(query(coll(db, collection), where('publishedAt', '!=', null)));
      return Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
    },
  });
}

/** Overlay published fields onto records keyed by `key`. */
export function overlay<T extends object>(rows: T[], key: (r: T) => string, pub: Record<string, Record<string, unknown>> | undefined): T[] {
  if (!pub) return rows;
  return rows.map((r) => {
    const p = pub[key(r)];
    if (!p) return r;
    const changes = Object.fromEntries(Object.entries(p).filter(([k, v]) => k in r && typeof v === typeof (r as Record<string, unknown>)[k]));
    return { ...r, ...changes, _publishedAt: p.publishedAt } as T;
  });
}
