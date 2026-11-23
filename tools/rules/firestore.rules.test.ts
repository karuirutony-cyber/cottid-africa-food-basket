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
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';

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
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice/alerts/a1'), { country: 'KE' }));
    await assertFails(setDoc(doc(as('bob'), 'users/alice/alerts/a1'), { country: 'KE' }));
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
  it('the audit log is read by platform admins and above only, and never written by clients', async () => {
    await assertSucceeds(getDoc(doc(as('pat', 'platform_admin', true), 'auditLog/a1')));
    await assertFails(getDoc(doc(as('dee', 'data_steward', true), 'auditLog/a1')));
    await assertFails(setDoc(doc(as('sam', 'super_admin', true), 'auditLog/a2'), { x: 1 }));
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
  it('organisations are readable by members only, written by functions only', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organisations/o1'), { name: 'Org' });
      await setDoc(doc(ctx.firestore(), 'organisations/o1/members/alice'), { role: 'org_admin' });
    });
    await assertSucceeds(getDoc(doc(as('alice'), 'organisations/o1')));
    await assertFails(getDoc(doc(as('bob'), 'organisations/o1')));
    await assertFails(setDoc(doc(as('alice'), 'organisations/o1'), { name: 'x' }));
  });
});
