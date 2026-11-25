/**
 * One passing test per permission in section 4 of the build prompt.
 * Run with: pnpm test:rules   (starts the Firestore emulator, needs Java)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, addDoc, writeBatch, getDocs, query, where, collectionGroup } from 'firebase/firestore';

let env: RulesTestEnvironment;
const PROJECT = 'demo-cottid-rules';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'countries/KE'), { name: { en: 'Kenya' } });
    await setDoc(doc(db, 'users/alice'), { name: 'Alice', email: 'alice@example.com', role: 'member', org: null, language: 'en' });
    await setDoc(doc(db, 'users/bob'), { name: 'Bob', email: 'bob@example.com', role: 'member', org: null, language: 'en' });
    await setDoc(doc(db, 'submissions/s1'), { uid: 'alice', target: 'buyers/KE-R-01', text: 'Fix the city', status: 'pending' });
    await setDoc(doc(db, 'auditLog/a1'), { actor: 'x', action: 'review', target: 'submissions/s1' });
    await setDoc(doc(db, 'apiKeys/h1'), { owner: 'alice', quota: 1000, usage: 0 });
  });
});

/** A signed-in user; `role` mirrors the custom claim; `mfa` adds a second factor to the token. */
const as = (uid: string, role?: string, mfa = false) =>
  env
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      ...(role ? { role } : {}),
      firebase: mfa ? { sign_in_provider: 'password', sign_in_second_factor: 'totp' } : { sign_in_provider: 'password' },
    })
    .firestore();
const visitor = () => env.unauthenticatedContext().firestore();

describe('public reference collections', () => {
  it('anyone can read', async () => {
    await assertSucceeds(getDoc(doc(visitor(), 'countries/KE')));
    await assertSucceeds(getDoc(doc(visitor(), 'settings/platform')));
  });
  it('visitors and members cannot write', async () => {
    await assertFails(setDoc(doc(visitor(), 'countries/KE'), { x: 1 }));
    await assertFails(setDoc(doc(as('alice'), 'countries/KE'), { x: 1 }));
  });
  it('a data steward with two-step can write; without two-step cannot', async () => {
    await assertSucceeds(setDoc(doc(as('dee', 'data_steward', true), 'countries/KE'), { x: 1 }));
    await assertFails(setDoc(doc(as('dee', 'data_steward', false), 'countries/KE'), { x: 1 }));
  });
  it('a verifier (below data steward) cannot write reference data', async () => {
    await assertFails(setDoc(doc(as('vic', 'verifier', true), 'buyers/X'), { x: 1 }));
  });
  it('datasets are written by functions only', async () => {
    await assertFails(setDoc(doc(as('sam', 'super_admin', true), 'datasets/v1'), { x: 1 }));
  });
});

describe('users', () => {
  it('a user creates their own profile only as member', async () => {
    const db = as('carol');
    const base = { name: 'Carol', email: 'carol@example.com', org: null, language: 'en', createdAt: serverTimestamp() };
    await assertFails(setDoc(doc(db, 'users/carol'), { ...base, role: 'super_admin' }));
    await assertSucceeds(setDoc(doc(db, 'users/carol'), { ...base, role: 'member' }));
  });
  it('a user cannot create a profile for someone else or with another e-mail', async () => {
    const base = { name: 'X', org: null, language: 'en', role: 'member', createdAt: serverTimestamp() };
    await assertFails(setDoc(doc(as('carol'), 'users/dave'), { ...base, email: 'carol@example.com' }));
    await assertFails(setDoc(doc(as('carol'), 'users/carol'), { ...base, email: 'other@example.com' }));
  });
  it('a user reads their own profile, not another', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'users/alice')));
    await assertFails(getDoc(doc(as('alice'), 'users/bob')));
  });
  it('a user updates name and language but never role, e-mail or createdAt', async () => {
    const db = as('alice');
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { name: 'Alice K', language: 'fr' }));
    await assertFails(updateDoc(doc(db, 'users/alice'), { role: 'super_admin' }));
    await assertFails(updateDoc(doc(db, 'users/alice'), { email: 'x@example.com' }));
    await assertFails(updateDoc(doc(db, 'users/alice'), { createdAt: serverTimestamp() }));
  });
  it('platform admins (with two-step) change roles; others cannot', async () => {
    await assertSucceeds(updateDoc(doc(as('pat', 'platform_admin', true), 'users/bob'), { role: 'verifier' }));
    await assertFails(updateDoc(doc(as('pat', 'platform_admin', false), 'users/bob'), { role: 'verifier' }));
    await assertFails(updateDoc(doc(as('vic', 'verifier', true), 'users/bob'), { role: 'verifier' }));
  });
  it('profiles cannot be deleted from the client', async () => {
    await assertFails(deleteDoc(doc(as('alice'), 'users/alice')));
  });
  it('saved views and alerts are private to their owner', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/saved/v1'), { title: 'x' }));
    await assertFails(getDoc(doc(as('bob'), 'users/alice/saved/v1')));
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/alerts/a1'), { kind: 'events', country: 'KE', days: 14 }));
    await assertFails(setDoc(doc(as('bob'), 'users/alice/alerts/a1'), { kind: 'events', country: 'KE', days: 14 }));
  });
});

describe('alerts and notifications', () => {
  it('a user keeps valid alert rules of their own only', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/alerts/a1'), { kind: 'calls', country: 'NG', food: '', days: 30, email: true }));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/alerts/a2'), { kind: 'calls', days: 999 }));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/alerts/a3'), { kind: 'anything', days: 10 }));
    await assertFails(setDoc(doc(as('bob'), 'users/alice/alerts/a4'), { kind: 'calls', days: 10 }));
  });
  it('notifications are read by their owner, marked read, never written by clients', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/notifications/n1'), { title: 'x', read: false });
    });
    await assertSucceeds(getDoc(doc(as('alice'), 'users/alice/notifications/n1')));
    await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice/notifications/n1'), { read: true }));
    await assertFails(updateDoc(doc(as('alice'), 'users/alice/notifications/n1'), { title: 'changed' }));
    await assertFails(getDoc(doc(as('bob'), 'users/alice/notifications/n1')));
    await assertFails(setDoc(doc(as('alice'), 'users/alice/notifications/n2'), { title: 'fake' }));
  });
  it('the e-mail queue is closed to clients', async () => {
    await assertFails(setDoc(doc(as('alice'), 'mail/m1'), { to: 'x@example.com' }));
  });
});

describe('submissions', () => {
  const ok = (uid: string, text = 'The city should be Thika') => ({ uid, target: 'buyers/KE-R-01', text, status: 'pending', sourceUrl: '' });
  it('a signed-in user creates a pending submission', async () => {
    await assertSucceeds(addDoc(collection(as('alice'), 'submissions'), ok('alice')));
  });
  it('visitors cannot submit; nor can anyone submit as someone else or pre-approved', async () => {
    await assertFails(addDoc(collection(visitor(), 'submissions'), ok('alice')));
    await assertFails(addDoc(collection(as('alice'), 'submissions'), ok('bob')));
    await assertFails(addDoc(collection(as('alice'), 'submissions'), { ...ok('alice'), status: 'approved' }));
  });
  it('a submission may carry proposed values as a small map, nothing else', async () => {
    await assertSucceeds(addDoc(collection(as('alice'), 'submissions'), { ...ok('alice'), patch: { city: 'Thika' } }));
    await assertFails(addDoc(collection(as('alice'), 'submissions'), { ...ok('alice'), patch: 'city=Thika' }));
    await assertFails(addDoc(collection(as('alice'), 'submissions'), { ...ok('alice'), role: 'super_admin' }));
  });
  it('text is limited to 4,000 characters', async () => {
    await assertSucceeds(addDoc(collection(as('alice'), 'submissions'), ok('alice', 'x'.repeat(4000))));
    await assertFails(addDoc(collection(as('alice'), 'submissions'), ok('alice', 'x'.repeat(4001))));
  });
  it('a user reads their own submissions, not others', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'submissions/s1')));
    await assertFails(getDoc(doc(as('bob'), 'submissions/s1')));
  });
  it('verifiers read all and change only status, reviewer, reviewedAt and note', async () => {
    const db = as('vic', 'verifier', true);
    await assertSucceeds(getDoc(doc(db, 'submissions/s1')));
    await assertSucceeds(updateDoc(doc(db, 'submissions/s1'), { status: 'approved', reviewer: 'vic', reviewedAt: serverTimestamp(), note: 'ok' }));
    await assertFails(updateDoc(doc(db, 'submissions/s1'), { text: 'changed' }));
  });
  it('verifiers without two-step, and members, cannot review', async () => {
    await assertFails(updateDoc(doc(as('vic', 'verifier', false), 'submissions/s1'), { status: 'approved' }));
    await assertFails(updateDoc(doc(as('alice'), 'submissions/s1'), { status: 'approved' }));
  });
});

describe('audit log and API keys', () => {
  it('the audit log is read by platform admins and above only; entries are appended in your own name, never changed', async () => {
    await assertSucceeds(getDoc(doc(as('pat', 'platform_admin', true), 'auditLog/a1')));
    await assertFails(getDoc(doc(as('dee', 'data_steward', true), 'auditLog/a1')));
    await assertFails(setDoc(doc(as('sam', 'super_admin', true), 'auditLog/a2'), { x: 1 }));
    const entry = (actor: string) => ({ actor, action: 'review:approved', target: 'submissions/s1', before: null, after: null, time: serverTimestamp() });
    await assertSucceeds(addDoc(collection(as('alice'), 'auditLog'), entry('alice')));
    await assertFails(addDoc(collection(as('alice'), 'auditLog'), entry('bob')));
    await assertFails(addDoc(collection(visitor(), 'auditLog'), entry('alice')));
    await assertFails(updateDoc(doc(as('sam', 'super_admin', true), 'auditLog/a1'), { action: 'x' }));
    await assertFails(deleteDoc(doc(as('sam', 'super_admin', true), 'auditLog/a1')));
  });
  it('API keys are readable by their owner and written by functions only', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'apiKeys/h1')));
    await assertFails(getDoc(doc(as('bob'), 'apiKeys/h1')));
    await assertFails(setDoc(doc(as('alice'), 'apiKeys/h2'), { owner: 'alice' }));
  });
});

describe('default deny', () => {
  it('unknown collections are closed to everyone', async () => {
    await assertFails(getDoc(doc(visitor(), 'secrets/x')));
    await assertFails(setDoc(doc(as('sam', 'super_admin', true), 'secrets/x'), { x: 1 }));
  });
  it('only the security setting itself is closed to platform admins', async () => {
    await assertFails(setDoc(doc(as('pat', 'platform_admin', true), 'settings/security'), { requireTwoStep: false }));
  });
});

describe('roles from the profile, and the two-step setting', () => {
  it('the role on the profile counts, so a role changed in the console works without the functions', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/vera'), { name: 'Vera', email: 'vera@example.com', role: 'verifier' });
    });
    await assertSucceeds(getDoc(doc(as('vera', undefined, true), 'submissions/s1')));
    // A claim above the profile role does not count once the profile exists.
    await assertFails(setDoc(doc(as('alice', 'super_admin', true), 'countries/KE'), { x: 1 }));
  });
  it('with requireTwoStep false, staff act without a second factor; members still cannot', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'settings/security'), { requireTwoStep: false });
    });
    await assertSucceeds(setDoc(doc(as('dee', 'data_steward', false), 'countries/KE'), { x: 1 }));
    await assertSucceeds(updateDoc(doc(as('vic', 'verifier', false), 'submissions/s1'), { status: 'approved', reviewer: 'vic', reviewedAt: serverTimestamp(), note: '' }));
    await assertFails(updateDoc(doc(as('alice'), 'submissions/s1'), { status: 'approved' }));
  });
  it('super admins switch two-step on; once on, only with two-step themselves', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'settings/security'), { requireTwoStep: false });
    });
    await assertFails(setDoc(doc(as('pat', 'platform_admin', false), 'settings/security'), { requireTwoStep: true }));
    await assertSucceeds(setDoc(doc(as('sam', 'super_admin', false), 'settings/security'), { requireTwoStep: true }));
    await assertFails(setDoc(doc(as('sam', 'super_admin', false), 'settings/security'), { requireTwoStep: false }));
    await assertSucceeds(setDoc(doc(as('sam', 'super_admin', true), 'settings/security'), { requireTwoStep: false }));
  });
  it('platform admins never grant a role above their own, nor change a super admin', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/sue'), { name: 'Sue', email: 'sue@example.com', role: 'super_admin' });
    });
    await assertFails(updateDoc(doc(as('pat', 'platform_admin', true), 'users/bob'), { role: 'super_admin' }));
    await assertFails(updateDoc(doc(as('pat', 'platform_admin', true), 'users/sue'), { role: 'member' }));
    await assertSucceeds(updateDoc(doc(as('sam', 'super_admin', true), 'users/bob'), { role: 'super_admin' }));
  });
  it('data stewards publish an approved suggestion; nobody publishes a pending one', async () => {
    const pub = { status: 'published', publishedAt: serverTimestamp(), publishedTarget: 'buyers/KE-R-01', publishedPatch: { city: 'Thika' } };
    await assertFails(updateDoc(doc(as('dee', 'data_steward', true), 'submissions/s1'), pub));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'submissions/s1'), { status: 'approved' });
    });
    await assertFails(updateDoc(doc(as('vic', 'verifier', true), 'submissions/s1'), pub));
    await assertSucceeds(updateDoc(doc(as('dee', 'data_steward', true), 'submissions/s1'), pub));
  });
});

describe('organisations', () => {
  const found = (uid: string, orgId: string, extra: Record<string, unknown> = {}) => {
    const db = as(uid);
    const batch = writeBatch(db);
    batch.set(doc(db, `organisations/${orgId}`), { name: 'Shamba Co', plan: 'free', createdBy: uid, createdAt: serverTimestamp(), memberCount: 1, ...extra });
    batch.set(doc(db, `organisations/${orgId}/members/${uid}`), { role: 'org_admin', email: `${uid}@example.com`, name: uid, joinedAt: serverTimestamp() });
    return batch.commit();
  };
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'organisations/o1'), { name: 'Org', plan: 'free', createdBy: 'alice', memberCount: 1 });
      await setDoc(doc(db, 'organisations/o1/members/alice'), { role: 'org_admin', email: 'alice@example.com' });
      await setDoc(doc(db, 'organisations/o1/invites/i1'), { email: 'bob@example.com', role: 'org_analyst', status: 'pending', orgName: 'Org' });
    });
  });
  it('platform admins list every organisation; members cannot', async () => {
    await assertSucceeds(getDocs(collection(as('pat', 'platform_admin', true), 'organisations')));
    await assertFails(getDocs(collection(as('alice'), 'organisations')));
  });
  it('the invitee finds their invitations across organisations', async () => {
    const mine = (db: ReturnType<typeof as>, email: string) => getDocs(query(collectionGroup(db, 'invites'), where('email', '==', email), where('status', '==', 'pending')));
    await assertSucceeds(mine(as('bob'), 'bob@example.com'));
    await assertFails(mine(as('carol'), 'bob@example.com'));
  });
  it('members read their organisation; others cannot', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'organisations/o1')));
    await assertFails(getDoc(doc(as('bob'), 'organisations/o1')));
    await assertFails(getDoc(doc(as('bob'), 'organisations/o1/members/alice')));
  });
  it('anyone signed in founds an organisation as its administrator, nothing more', async () => {
    await assertSucceeds(found('carol', 'o2'));
    await assertFails(found('dave', 'o3', { plan: 'enterprise' }));
    await assertFails(found('dave', 'o1')); // an existing one
    await assertFails(setDoc(doc(as('bob'), 'organisations/o1/members/bob'), { role: 'org_admin', email: 'bob@example.com', name: 'Bob', joinedAt: serverTimestamp() }));
  });
  it('administrators rename, invite and manage members; members cannot', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'organisations/o1'), { name: 'Org Ltd' }));
    await assertFails(updateDoc(doc(as('alice'), 'organisations/o1'), { plan: 'enterprise' }));
    const inv = { email: 'carol@example.com', role: 'org_member', invitedBy: 'alice', status: 'pending', createdAt: serverTimestamp(), orgName: 'Org' };
    await assertSucceeds(addDoc(collection(as('alice'), 'organisations/o1/invites'), inv));
    await assertFails(addDoc(collection(as('alice'), 'organisations/o1/invites'), { ...inv, role: 'owner' }));
    await assertFails(addDoc(collection(as('bob'), 'organisations/o1/invites'), { ...inv, invitedBy: 'bob' }));
  });
  it('the invitee sees the invitation and joins with the role it offers', async () => {
    await assertSucceeds(getDoc(doc(as('bob'), 'organisations/o1/invites/i1')));
    await assertFails(getDoc(doc(as('carol'), 'organisations/o1/invites/i1')));
    const member = { role: 'org_admin', email: 'bob@example.com', name: 'Bob', joinedAt: serverTimestamp(), invite: 'i1' };
    await assertFails(setDoc(doc(as('bob'), 'organisations/o1/members/bob'), member)); // a higher role than offered
    await assertFails(setDoc(doc(as('carol'), 'organisations/o1/members/carol'), { ...member, role: 'org_analyst', email: 'carol@example.com' }));
    const db = as('bob');
    const batch = writeBatch(db);
    batch.set(doc(db, 'organisations/o1/members/bob'), { ...member, role: 'org_analyst' });
    batch.update(doc(db, 'organisations/o1/invites/i1'), { status: 'accepted', acceptedAt: serverTimestamp(), uid: 'bob' });
    batch.update(doc(db, 'organisations/o1'), { memberCount: 2 });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(doc(as('bob'), 'organisations/o1')));
  });
});
