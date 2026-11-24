/**
 * Alerts (section 7): users follow countries and foods in users/{uid}/alerts; a daily run turns matching
 * call deadlines and events into notifications (users/{uid}/notifications) and, when asked, e-mails.
 * E-mails are queued in `mail` in the format the Trigger Email extension sends.
 *
 * Alert rule: { kind: 'calls' | 'events', country: ISO2 or '', food: food id or '', days: 1-180, email: bool }
 */
import './options';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { audit, requireStaff } from './review';

const db = () => getFirestore();
const SITE = process.env.SITE_URL ?? 'https://cottid-africa-food-basket.vercel.app';

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

/** Evaluates every alert rule against calls and events; idempotent per rule and item. */
export async function runAlerts(today = new Date().toISOString().slice(0, 10)) {
  const [rules, calls, events, countries] = await Promise.all([
    db().collectionGroup('alerts').get(),
    db().collection('calls').get(),
    db().collection('events').get(),
    db().collection('countries').select('name').get(),
  ]);
  const countryName = new Map(countries.docs.map((d) => [d.id, d.get('name')?.en as string]));
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
          await db().collection('mail').add({
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
  logger.info('alerts run', { rules: rules.size, fired, emails, today });
  return { rules: rules.size, fired, emails, today };
}

export const alerts = onSchedule({ schedule: 'every day 06:00', timeZone: 'Africa/Nairobi', timeoutSeconds: 300 }, async () => {
  await runAlerts();
});

/** Run the daily alerts now (platform admins). */
export const runAlertsNow = onCall({ timeoutSeconds: 300 }, async (req) => {
  requireStaff(req, 'platform_admin');
  const out = await runAlerts();
  await audit(req.auth!.uid, 'runAlerts', 'alerts', null, out);
  return out;
});
