import { expect, test, type Page } from '@playwright/test';

/* M9: a dataset publishes and rolls back; an alert fires. On the seeded emulators. */
const PROJECT = 'demo-cottid';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

async function uidOf(email: string) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST', headers: owner, body: JSON.stringify({ email: [email] }) });
  return ((await r.json()) as { users: { localId: string }[] }).users[0]!.localId;
}
/** Waits until syncRoleClaim has put the role on the account (the function may be cold-starting). */
async function waitForClaim(uid: string, role: string) {
  await expect
    .poll(
      async () => {
        const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST', headers: owner, body: JSON.stringify({ localId: [uid] }) });
        const u = ((await r.json()) as { users: { customAttributes?: string }[] }).users[0]!;
        return u.customAttributes ? JSON.parse(u.customAttributes).role : null;
      },
      { timeout: 60_000, intervals: [1000] },
    )
    .toBe(role);
}
async function liveVersion() {
  const j = (await (await fetch(`${FS}/meta/dataset`, { headers: owner })).json()) as { fields?: { version?: { stringValue: string } } };
  return j.fields?.version?.stringValue ?? null;
}
async function mailFor(uid: string) {
  const r = await fetch(`${FS}:runQuery`, {
    method: 'POST',
    headers: owner,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'mail' }], where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } } } }),
  });
  return ((await r.json()) as { document?: { fields: { message: { mapValue: { fields: { subject: { stringValue: string } } } } } } }[])
    .filter((x) => x.document)
    .map((x) => x.document!.fields.message.mapValue.fields.subject.stringValue);
}
async function asAdmin(page: Page) {
  const email = `admin-${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Admin Test');
  await page.getByLabel('E-mail address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-9');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'verification link' })).toBeVisible({ timeout: 30_000 });
  const uid = await uidOf(email);
  await fetch(`${FS}/users/${uid}?updateMask.fieldPaths=role`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: { role: { stringValue: 'platform_admin' } } }) });
  await waitForClaim(uid, 'platform_admin');
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel('E-mail address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-9');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Platform administrator')).toBeVisible({ timeout: 30_000 });
  return uid;
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(420_000);

test('a dataset is built, published, superseded and rolled back', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'one run is enough');
  await asAdmin(page);
  await page.goto('/admin/datasets');
  const build = async () => {
    await page.getByRole('button', { name: 'Build a new version' }).click();
    const status = page.getByRole('status').filter({ hasText: /^Built v33-/ });
    await expect(status).toContainText('all checks passed', { timeout: 120_000 });
    return (await status.textContent())!.match(/Built (\S+):/)![1]!;
  };
  const publish = async (version: string) => {
    const card = page.locator('section.card').filter({ hasText: version });
    await card.getByRole('button', { name: 'Publish this version' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Published ${version}` })).toBeVisible({ timeout: 240_000 });
    await expect(page.getByTestId('live-version')).toHaveText(version, { timeout: 30_000 });
  };

  const v1 = await build();
  await publish(v1);
  expect(await liveVersion()).toBe(v1);

  await page.waitForTimeout(1500); // versions are stamped to the second
  const v2 = await build();
  expect(v2).not.toBe(v1);
  await publish(v2);
  expect(await liveVersion()).toBe(v2);
  await expect(page.locator('section.card').filter({ hasText: v1 }).getByText('superseded')).toBeVisible();

  await page.getByRole('button', { name: 'Roll back' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Rolled back: ${v1} is live again` })).toBeVisible({ timeout: 240_000 });
  expect(await liveVersion()).toBe(v1);
  await expect(page.getByTestId('live-version')).toHaveText(v1);
  await expect(page.locator('section.card').filter({ hasText: v2 }).getByText('rolled back')).toBeVisible();
});

test('an alert fires: notification shown and e-mail queued', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'one run is enough');
  const uid = await asAdmin(page);
  // Follow calls for Nigeria closing within 30 days (one closes on 1 December 2026).
  await page.goto('/account/alerts');
  await page.getByRole('combobox', { name: 'Tell me about' }).selectOption('calls');
  await page.getByRole('combobox', { name: 'Country', exact: true }).selectOption('NG');
  await page.getByRole('combobox', { name: 'How far ahead' }).selectOption('30');
  await page.getByRole('button', { name: 'Add alert' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Alert saved' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Calls closing soon · Nigeria')).toBeVisible();

  // The daily run (triggered now by an administrator).
  await page.goto('/admin/settings');
  await page.getByRole('button', { name: 'Run alerts now' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Alerts checked: \d+ rules, [1-9]\d* new notifications/ })).toBeVisible({ timeout: 120_000 });

  await page.goto('/notifications');
  await expect(page.getByRole('link', { name: /Call closes 2026-12-01: Home-Grown Solutions/ })).toBeVisible({ timeout: 30_000 });
  expect((await mailFor(uid)).some((s) => s.includes('Call closes 2026-12-01'))).toBe(true);

  // Running again does not repeat the same notification.
  await page.goto('/admin/settings');
  await page.getByRole('button', { name: 'Run alerts now' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Alerts checked: \d+ rules, 0 new notifications/ })).toBeVisible({ timeout: 120_000 });
});
