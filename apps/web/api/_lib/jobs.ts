/**
 * Scheduled jobs, run by Vercel Cron and on demand from the admin console:
 * - alerts: turns call deadlines and events that match people's alert rules into notifications (and
 *   queues e-mails in `mail`, in the format the Trigger Email extension sends);
 * - ingest: compares the latest World Bank population with the published dataset and records the
 *   differences for a data steward. It never publishes by itself.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { db, SITE } from './server.js';

interface Rule {
  kind: 'calls' | 'events';
  country?: string;
  food?: string;
  days?: number;
  email?: boolean;
}

const inWindow = (date: string, from: string, days: number) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false; // "rolling" deadlines never alert
  const to = new Date(Date.parse(from) + days * 86_400_000).toISOString().slice(0, 10);
  return date >= from && date <= to;
};

export async function runAlerts(today = new Date().toISOString().slice(0, 10)) {
  const [rules, calls, events, countries] = await Promise.all([
    db().collectionGroup('alerts').get(),
    db().collection('calls').get(),
    db().collection('events').get(),
    db().collection('countries').select('name').get(),
  ]);
  const countryName = new Map(countries.docs.map((d) => [d.id, (d.get('name') as { en?: string } | undefined)?.en]));
  let fired = 0;
  let emails = 0;
  for (const r of rules.docs) {
    const rule = r.data() as Rule;
    const uid = r.ref.parent.parent?.id;
    if (!uid || rule.kind == null) continue;
    const days = Math.min(Math.max(Number(rule.days ?? 30), 1), 180);
    const foodOk = (staples: string[] = []) => !rule.food || staples.includes(rule.food) || staples.includes('all');
    const matches: { id: string; title: string; body: string; link: string }[] = [];
    if (rule.kind === 'calls') {
      for (const c of calls.docs) {
        const x = c.data();
        const cs: string[] = Array.isArray(x.c) ? x.c : [];
        if (!inWindow(String(x.deadline ?? x.dl ?? ''), today, days)) continue;
        if (rule.country && cs.length && !cs.includes(rule.country)) continue;
        if (!foodOk(x.staples)) continue;
        matches.push({ id: `call_${c.id}`, title: `Call closes ${x.dl}: ${x.name}`, body: `${x.funder}. ${x.amount ?? ''} ${x.who ?? ''}`.trim(), link: '/policy/calls' });
      }
    } else {
      const cname = rule.country ? countryName.get(rule.country) : undefined;
      for (const e of events.docs) {
        const x = e.data();
        if (!inWindow(String(x.k ?? x.date ?? ''), today, days)) continue;
        if (cname && x.country && x.country !== cname) continue;
        if (!foodOk(x.staples)) continue;
        matches.push({ id: `event_${e.id}`, title: `${x.when}: ${x.name}`, body: `${[x.city, x.country].filter(Boolean).join(', ')}. ${x.why ?? ''}`.trim(), link: '/directory/events' });
      }
    }
    for (const m of matches) {
      const ref = db().doc(`users/${uid}/notifications/${r.id}_${m.id}`);
      const created = await db().runTransaction(async (tx) => {
        if ((await tx.get(ref)).exists) return false;
        tx.set(ref, { title: m.title, body: m.body, link: m.link, alert: r.id, kind: rule.kind, read: false, createdAt: FieldValue.serverTimestamp() });
        return true;
      });
      if (!created) continue;
      fired++;
      if (rule.email) {
        const user = (await db().doc(`users/${uid}`).get()).data();
        if (user?.email) {
          await db()
            .collection('mail')
            .add({
              to: user.email,
              message: { subject: `Africa Food Basket: ${m.title}`, text: `${m.title}\n\n${m.body}\n\n${SITE}${m.link}\n\nManage your alerts: ${SITE}/account/alerts` },
              uid,
              createdAt: FieldValue.serverTimestamp(),
            });
          emails++;
        }
      }
    }
  }
  return { rules: rules.size, fired, emails, today };
}

export async function ingest(actor: string) {
  const runRef = db().collection('ingestRuns').doc();
  const log: string[] = [];
  await runRef.set({ startedAt: FieldValue.serverTimestamp(), actor, status: 'running', sources: ['World Bank WDI: SP.POP.TOTL'] });
  try {
    const countries = await db().collection('countries').select('iso3', 'macro').get();
    const byIso3 = new Map(
      countries.docs.map((d) => [String(d.get('iso3') ?? ''), { iso2: d.id, pop: ((d.get('macro') as { pop?: { values?: Record<string, number> } } | undefined)?.pop?.values ?? {}) as Record<string, number> }]),
    );
    const iso3 = [...byIso3.keys()].filter(Boolean);
    log.push(`Checking population for ${iso3.length} countries.`);
    const r = await fetch(`https://api.worldbank.org/v2/country/${iso3.join(';')}/indicator/SP.POP.TOTL?format=json&per_page=1000&mrv=2`);
    if (!r.ok) throw new Error(`World Bank API answered ${r.status}`);
    const [, rows] = (await r.json()) as [unknown, { countryiso3code: string; date: string; value: number | null }[]];
    const changed: { iso2: string; year: string; published: number | null; latest: number }[] = [];
    for (const row of rows ?? []) {
      const c = byIso3.get(row.countryiso3code);
      if (!c || row.value == null) continue;
      const latest = Math.round(row.value / 1e4) / 100; // millions, 2 dp
      const published = c.pop[row.date] ?? null;
      if (published == null || Math.abs(published - latest) > 0.01) changed.push({ iso2: c.iso2, year: row.date, published, latest });
    }
    log.push(`${rows?.length ?? 0} values read; ${changed.length} differ from the published dataset.`);
    await runRef.set({ finishedAt: FieldValue.serverTimestamp(), status: 'ok', changed: changed.slice(0, 200), changedCount: changed.length, published: false, log }, { merge: true });
    return { id: runRef.id, changed: changed.length };
  } catch (e) {
    log.push(`Failed: ${(e as Error).message}`);
    await runRef.set({ finishedAt: FieldValue.serverTimestamp(), status: 'failed', published: false, log }, { merge: true });
    return { id: runRef.id, error: (e as Error).message };
  }
}
