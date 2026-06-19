/**
 * Authenticated QA matrix — cross-tenant isolation (API tier, ≥2 tenants).
 *
 * Each persona owns a marker account in its OWN tenant. With a real token, a
 * persona must be able to read its own account but NEVER another tenant's account
 * (the app scopes `account.getById` by `ctx.tenant.tenantId` and audit-logs the
 * cross-tenant attempt). This is the full-stack counterpart to the DB-level
 * `rls-tenant-isolation` integration test.
 *
 * storageState is cleared so only the explicit Bearer authenticates.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { readPersonaToken, readMeta } from '../fixtures/storage-state';

const API = process.env.QA_API_URL || 'http://localhost:4000';

test.use({ storageState: { cookies: [], origins: [] } });

async function getAccount(ctx: APIRequestContext, token: string, id: string) {
  const url = `${API}/api/trpc/account.getById?batch=1&input=${encodeURIComponent(
    JSON.stringify({ 0: { id } })
  )}`;
  const res = await ctx.get(url, { headers: { authorization: `Bearer ${token}` } });
  const text = await res.text();
  let account: unknown = null;
  try {
    const r = JSON.parse(text)[0]?.result?.data;
    account = r?.json ?? r ?? null;
  } catch {
    /* error payload — account stays null */
  }
  return { text, account, found: !!account && typeof account === 'object' };
}

test('a tenant can read its OWN account', async ({ request }) => {
  const meta = readMeta();
  const token = readPersonaToken('starter');
  const r = await getAccount(request, token, meta.starter.accountId);
  expect(r.found, 'starter should see its own marker account').toBe(true);
});

test('a tenant CANNOT read another tenant’s account (cross-tenant denied)', async ({ request }) => {
  const meta = readMeta();
  // tenantB tries to read STARTER tenant's account by id.
  const token = readPersonaToken('tenantB');
  const r = await getAccount(request, token, meta.starter.accountId);
  expect(r.found, 'tenantB must NOT see the starter tenant account').toBe(false);
});

test('isolation is symmetric (starter cannot read tenantB’s account)', async ({ request }) => {
  const meta = readMeta();
  const token = readPersonaToken('starter');
  const r = await getAccount(request, token, meta.tenantB.accountId);
  expect(r.found, 'starter must NOT see the tenantB account').toBe(false);
});
