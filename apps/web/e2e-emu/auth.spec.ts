import { expect, test, type Page } from '@playwright/test';

/* Sign-up, sign-in, reset and role gating (M2), against the local emulators. */
const PROJECT = 'demo-cottid';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

async function oob(email: string, type: 'VERIFY_EMAIL' | 'PASSWORD_RESET') {
  const r = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes } = (await r.json()) as { oobCodes: { email: string; requestType: string; oobCode: string; oobLink: string }[] };
  return oobCodes.filter((c) => c.email === email && c.requestType === type).pop();
}
async function uidOf(email: string): Promise<string> {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, {
    method: 'POST',
    headers: owner,
    body: JSON.stringify({ email: [email] }),
  });
  const j = (await r.json()) as { users?: { localId: string }[] };
  return j.users![0]!.localId;
}
async function profile(uid: string) {
  const r = await fetch(`${FS}/users/${uid}`, { headers: owner });
  return r.ok ? ((await r.json()) as { fields: Record<string, { stringValue?: string }> }).fields : null;
}
async function setRole(uid: string, role: string) {
  await fetch(`${FS}/users/${uid}?updateMask.fieldPaths=role`, {
    method: 'PATCH',
    headers: owner,
    body: JSON.stringify({ fields: { role: { stringValue: role } } }),
  });
}

async function signUp(page: Page, name: string, email: string, password: string) {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('E-mail address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'verification link' })).toBeVisible({ timeout: 30_000 });
}
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/signin');
  await page.getByLabel('E-mail address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/account/, { timeout: 30_000 });
}

const unique = (p: string, project: string) => `${p}-${project}-${Date.now()}@example.com`;

test('sign-up creates a member profile and sends a verification link', async ({ page }, info) => {
  const email = unique('new', info.project.name);
  await signUp(page, 'Amina Test', email, 'correct-horse-9');
  const uid = await uidOf(email);
  await expect.poll(async () => (await profile(uid))?.role?.stringValue, { timeout: 20_000 }).toBe('member');
  expect((await profile(uid))?.name?.stringValue).toBe('Amina Test');
  const link = await oob(email, 'VERIFY_EMAIL');
  expect(link, 'verification e-mail').toBeTruthy();

  await page.goto('/account');
  await expect(page.getByText(/is not verified yet/)).toBeVisible();
  await fetch(link!.oobLink); // follow the link, as the user would from their inbox
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Your account' })).toBeVisible();
  await expect(page.getByText(/is not verified yet/)).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('banner').getByText('Amina Test').first()).toBeAttached();
});

test('sign-in, wrong password and sign-out', async ({ page }, info) => {
  const email = unique('back', info.project.name);
  await signUp(page, 'Kofi Test', email, 'correct-horse-9');
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/signin/);

  await page.getByLabel('E-mail address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('do not match an account');

  await signIn(page, email, 'correct-horse-9');
  await expect(page.getByRole('heading', { level: 1, name: 'Your account' })).toBeVisible();
});

test('password reset sends a link and the new password works', async ({ page, context }, info) => {
  const email = unique('reset', info.project.name);
  await signUp(page, 'Zawadi Test', email, 'old-password-1');
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/signin/);

  await page.goto('/reset');
  await page.getByLabel('E-mail address').fill(email);
  await page.getByRole('button', { name: 'Send the reset link' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'reset link is on its way' })).toBeVisible();
  const code = await oob(email, 'PASSWORD_RESET');
  expect(code).toBeTruthy();
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: code!.oobCode, newPassword: 'new-password-2' }),
  });
  expect(r.ok).toBe(true);
  await context.clearCookies();
  await signIn(page, email, 'new-password-2');
});

test('role gating: visitors sign in first, members are refused, staff need two-step', async ({ page }, info) => {
  await page.goto('/admin/review');
  await expect(page).toHaveURL(/\/signin\?next=%2Fadmin%2Freview/);

  const email = unique('staff', info.project.name);
  await signUp(page, 'Tendai Test', email, 'correct-horse-9');
  await page.goto('/admin/review');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You do not have access to this page');
  await expect(page.getByText('This page is for platform staff')).toBeVisible();

  // An administrator makes them a verifier; syncRoleClaim mirrors it into their token.
  const uid = await uidOf(email);
  await setRole(uid, 'verifier');
  await page.waitForTimeout(3000);
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/signin/);
  await signIn(page, email, 'correct-horse-9');
  await expect(page.getByText('Verifier')).toBeVisible({ timeout: 15_000 });
  await page.goto('/admin/review');
  // Now a verifier: the review queue opens. (The emulator has no authenticator app, so its build waives
  // the second factor; production refuses staff without it, as the rules tests and functions check.)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Review queue');
});
