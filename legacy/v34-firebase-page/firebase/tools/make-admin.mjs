// Gives a signed-up user a role. Usage: npm run make-admin -- you@example.com [super_admin|platform_admin|data_steward|content_editor|verifier|contributor|member]
import { db, auth } from './admin.mjs';
const [email, role = 'super_admin'] = process.argv.slice(2);
const ROLES = ['member', 'contributor', 'verifier', 'content_editor', 'data_steward', 'platform_admin', 'super_admin'];
if (!email || !ROLES.includes(role)) { console.error('Usage: npm run make-admin -- you@example.com [role]'); process.exit(1); }
const u = await auth.getUserByEmail(email).catch(() => null);
if (!u) { console.error(`No account for ${email}. Sign in on the platform once first, then run this again.`); process.exit(1); }
await db.doc(`users/${u.uid}`).set({ email, role, name: u.displayName || '', roleSetAt: new Date() }, { merge: true });
console.log(`${email} is now ${role}.`);
