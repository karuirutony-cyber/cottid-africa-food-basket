/**
 * pnpm make-admin you@example.com [--role super_admin] [--project cottid-72d51]
 * Sets that user's role in users/{uid} and mirrors it to the custom claim. The user must have signed
 * in once. They sign out and back in (or wait up to an hour) for the new claim to reach their token.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ROLES = ['member', 'contributor', 'verifier', 'content_editor', 'data_steward', 'platform_admin', 'super_admin'];
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const email = process.argv.slice(2).find((a) => a.includes('@'));
const role = arg('role') ?? 'super_admin';
const projectId = arg('project') ?? process.env.FIREBASE_PROJECT ?? 'cottid-72d51';

if (!email || !ROLES.includes(role)) {
  console.error(`Usage: pnpm make-admin you@example.com [--role ${ROLES.join('|')}]`);
  process.exit(1);
}
const emu = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST;
initializeApp(emu ? { projectId } : { projectId, credential: applicationDefault() });

try {
  const user = await getAuth().getUserByEmail(email);
  const ref = getFirestore().doc(`users/${user.uid}`);
  const snap = await ref.get();
  const before = snap.exists ? snap.get('role') : null;
  await ref.set({ role, email: user.email, name: user.displayName ?? snap.get('name') ?? '' }, { merge: true });
  await getAuth().setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role });
  await getFirestore().collection('auditLog').add({
    actor: 'cli:make-admin',
    action: 'setRole',
    target: `users/${user.uid}`,
    before: { role: before },
    after: { role },
    time: FieldValue.serverTimestamp(),
  });
  console.log(`${email} is now ${role} (was ${before ?? 'no profile'}). Ask them to sign out and in again.`);
  if (['verifier', 'content_editor', 'data_steward', 'platform_admin', 'super_admin'].includes(role))
    console.log('Staff roles must enrol two-step verification (TOTP) at /account before staff actions work.');
} catch (e) {
  const code = (e as { code?: string }).code;
  console.error(code === 'auth/user-not-found' ? `No account for ${email}: sign in on the site once first.` : (e as Error).message);
  process.exit(1);
}
