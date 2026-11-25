/**
 * pnpm two-step on|off [--project cottid-72d51]
 * Sets settings/security.requireTwoStep: whether staff (verifier and above) need a second factor before
 * the security rules and the functions accept their changes. Super admins can also change it in
 * Admin > Settings (once it is on, only with two-step themselves). Audited.
 */
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { adminCredential, explain } from './admin-credential';

const mode = process.argv[2];
const i = process.argv.indexOf('--project');
const projectId = (i > 0 ? process.argv[i + 1] : undefined) ?? process.env.FIREBASE_PROJECT ?? 'cottid-72d51';
if (mode !== 'on' && mode !== 'off') {
  console.error('Usage: pnpm two-step on|off [--project <id>]');
  process.exit(1);
}
const emu = process.env.FIRESTORE_EMULATOR_HOST;
initializeApp(emu ? { projectId } : { projectId, credential: adminCredential().credential });

try {
  const db = getFirestore();
  const ref = db.doc('settings/security');
  const before = (await ref.get()).get('requireTwoStep') ?? null;
  const on = mode === 'on';
  await ref.set({ requireTwoStep: on, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'cli:two-step' });
  await db.collection('auditLog').add({ actor: 'cli:two-step', action: 'setTwoStep', target: 'settings/security', before: { requireTwoStep: before }, after: { requireTwoStep: on }, time: FieldValue.serverTimestamp() });
  console.log(`Two-step verification for staff is now ${on ? 'required' : 'not required'} on ${projectId}.`);
} catch (e) {
  console.error(explain(e));
  process.exit(1);
}
