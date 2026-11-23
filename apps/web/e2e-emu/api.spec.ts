import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* M8: the API returns correct data, and over-quota is refused. Runs on the seeded emulators. */
const here = dirname(fileURLToPath(import.meta.url));
const API = 'http://127.0.0.1:5001/demo-cottid/africa-south1/api/v1';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-cottid/databases/(default)/documents';
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const TS = JSON.parse(readFileSync(join(here, '..', '..', '..', 'data', 'legacy', 'TS.json'), 'utf8'));

test.setTimeout(240_000);

test('API keys: correct data, quota enforced, revoked keys refused', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'one run is enough');
  // Sign up and create a key in the account area.
  const email = `api-${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Api Test');
  await page.getByLabel('E-mail address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-9');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'verification link' })).toBeVisible({ timeout: 30_000 });
  await page.goto('/account/api-keys');
  await page.getByLabel('Name for the key').fill('Test script');
  await page.getByRole('button', { name: 'Create key' }).click();
  const key = (await page.getByTestId('new-key').textContent({ timeout: 60_000 }))!.trim();
  expect(key).toMatch(/^afb_[\w-]{20,}$/);

  // The OpenAPI description needs no key.
  const spec = await (await fetch(`${API}/openapi.json`)).json();
  expect(spec.openapi).toBe('3.0.3');
  expect(Object.keys(spec.paths)).toContain('/series/{iso2}/{food}');

  // No key: refused.
  expect((await fetch(`${API}/countries/KE`)).status).toBe(401);

  // Correct data, matching the legacy page's figures.
  const h = { 'X-API-Key': key };
  const ke = await fetch(`${API}/countries/KE`, { headers: h });
  expect(ke.status).toBe(200);
  expect(ke.headers.get('x-ratelimit-limit')).toBe('10000');
  expect((await ke.json()).name.en).toBe('Kenya');
  const series = await (await fetch(`${API}/series/KE/rice`, { headers: h })).json();
  expect(series.series.fao_prod.values).toEqual(TS.balance.rice.KE.fao_prod);
  expect(series.series.fao_prod.src).toBe('D1');
  const proj = await fetch(`${API}/projections/NG/wheat`, { headers: h });
  expect(proj.status).toBe(200);
  expect((await proj.json()).rows.length).toBeGreaterThan(0);
  expect((await fetch(`${API}/series/KE/notafood`, { headers: h })).status).toBe(404);

  // Over quota: lower this key's daily quota to what it has used, and the next call is refused.
  const hash = createHash('sha256').update(key).digest('hex');
  const usedRes = await (await fetch(`${FS}/apiKeys/${hash}`, { headers: owner })).json();
  const used = Number(Object.values(usedRes.fields.usage.mapValue.fields as Record<string, { integerValue: string }>)[0]!.integerValue);
  await fetch(`${FS}/apiKeys/${hash}?updateMask.fieldPaths=quota`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: { quota: { integerValue: String(used) } } }) });
  const over = await fetch(`${API}/countries/KE`, { headers: h });
  expect(over.status).toBe(429);
  expect(over.headers.get('retry-after')).toMatch(/^\d+$/);
  expect((await over.json()).error.code).toBe('quota_exceeded');

  // The account page shows usage; revoking the key shuts it off.
  await page.reload();
  await expect(page.getByRole('cell', { name: `${used} / ${used}` })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('Revoked')).toBeVisible({ timeout: 60_000 });
  expect((await fetch(`${API}/countries/KE`, { headers: h })).status).toBe(401);
});
