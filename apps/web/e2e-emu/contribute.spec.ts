import { expect, test, type Page } from '@playwright/test';

/* M7: a suggestion flows through review to a published record with an audit entry. Needs the
 * emulator database seeded (pnpm e2e:auth seeds it first). */
const PROJECT = 'demo-cottid';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

async function uidOf(email: string): Promise<string> {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST', headers: owner, body: JSON.stringify({ email: [email] }) });
  return ((await r.json()) as { users: { localId: string }[] }).users[0]!.localId;
}
async function setRole(uid: string, role: string) {
  await fetch(`${FS}/users/${uid}?updateMask.fieldPaths=role`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: { role: { stringValue: role } } }) });
}
async function field(path: string, name: string) {
  const r = await fetch(`${FS}/${path}`, { headers: owner });
  const j = (await r.json()) as { fields?: Record<string, { stringValue?: string; timestampValue?: string }> };
  return j.fields?.[name];
}
async function auditEntries(target: string) {
  const r = await fetch(`${FS}:runQuery`, {
    method: 'POST',
    headers: owner,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'auditLog' }], where: { fieldFilter: { field: { fieldPath: 'target' }, op: 'EQUAL', value: { stringValue: target } } } } }),
  });
  const rows = (await r.json()) as { document?: { fields: Record<string, { stringValue?: string }> } }[];
  return rows.filter((x) => x.document).map((x) => x.document!.fields.action?.stringValue);
}
async function signUp(page: Page, name: string, email: string) {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('E-mail address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-9');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'verification link' })).toBeVisible({ timeout: 30_000 });
}

test.setTimeout(240_000);

test('a suggestion is reviewed, published to the record and audited', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'one end-to-end run is enough');
  const city = `Thika ${Date.now() % 100000}`;
  const email = `steward-${Date.now()}@example.com`;
  await signUp(page, 'Wanjiru Test', email);

  // 1. A member suggests a correction from the buyer's row in the directory.
  await page.goto('/directory/buyers');
  await page.getByRole('link', { name: /Suggest a correction: Capwell Industries Ltd \(KE-R-01\)/ }).click();
  await expect(page).toHaveURL(/\/contribute\?.*target=buyers%2FKE-R-01/);
  await page.getByLabel('What should change, and why?').fill(`The depot moved; the city is now ${city}, per the company's site.`);
  await page.getByLabel('Source (link, optional)').fill('https://example.com/capwell');
  await page.getByRole('button', { name: 'Add a field' }).click();
  await page.getByLabel('Field', { exact: true }).fill('city');
  await page.getByLabel('New value', { exact: true }).fill(city);
  await page.getByRole('button', { name: 'Send suggestion' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'in the review queue' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Waiting for review').first()).toBeVisible({ timeout: 45_000 });

  // 2. They are made a data steward (verifier rights included).
  await setRole(await uidOf(email), 'data_steward');
  await page.waitForTimeout(3000);
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel('E-mail address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-9');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Data steward')).toBeVisible({ timeout: 20_000 });

  // 3. Review: approve.
  await page.goto('/admin/review');
  const card = page.locator('section.card').filter({ hasText: city });
  await expect(card).toBeVisible({ timeout: 45_000 });
  await card.getByLabel('Note to the contributor (optional)').fill('Confirmed on the company site.');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Approved' })).toBeVisible({ timeout: 45_000 });

  // 4. Publish the approved change to the record.
  await page.getByRole('button', { name: 'Approved', exact: true }).click();
  const approved = page.locator('section.card').filter({ hasText: city });
  await expect(approved.getByText('was: Thika')).toBeVisible({ timeout: 45_000 });
  await approved.getByRole('button', { name: 'Publish to the record' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published' })).toBeVisible({ timeout: 45_000 });

  // 5. The record, the public directory and the audit log all show it.
  expect((await field('buyers/KE-R-01', 'city'))?.stringValue).toBe(city);
  expect(await field('buyers/KE-R-01', 'publishedAt')).toBeTruthy();
  expect(await auditEntries('buyers/KE-R-01')).toContain('publishRecord');
  await page.goto('/directory/buyers');
  await expect(page.getByRole('cell', { name: new RegExp(`${city}, Kenya`) })).toBeVisible({ timeout: 20_000 });

  // The contributor's own list shows it as published.
  await page.goto('/contribute');
  await expect(page.getByText('Published').first()).toBeVisible({ timeout: 45_000 });
});
