/**
 * Unit tests for resolveTenantForInboundEmail.
 *
 * Guards the inbound-webhook hot path after the N+1 → single-query refactor:
 * the previous implementation ran one `findFirst({ email: { endsWith } })` per
 * recipient address. It now issues ONE `findMany` for all candidate domains and
 * resolves in recipient order. These tests pin the behaviour that must be
 * preserved: first-recipient-wins, domain dedup, null-tenant skip, the 'system'
 * fallback, and — critically — that only a single query is issued.
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveTenantForInboundEmail } from '../inbound.router';

function makePrisma(users: Array<{ email: string; tenantId: string | null }>) {
  const findMany = vi.fn().mockResolvedValue(users);
  return { prisma: { user: { findMany } }, findMany };
}

describe('resolveTenantForInboundEmail', () => {
  it('returns the tenant of the first recipient domain that resolves', async () => {
    const { prisma } = makePrisma([
      { email: 'rep@acme.com', tenantId: 'tenant-acme' },
      { email: 'rep@globex.com', tenantId: 'tenant-globex' },
    ]);

    const tenantId = await resolveTenantForInboundEmail(
      ['support@acme.com', 'sales@globex.com'],
      prisma
    );

    expect(tenantId).toBe('tenant-acme');
  });

  it('falls through to the next recipient domain when the first has no tenant', async () => {
    const { prisma } = makePrisma([
      // acme exists but has no tenant — must be skipped
      { email: 'rep@acme.com', tenantId: null },
      { email: 'rep@globex.com', tenantId: 'tenant-globex' },
    ]);

    const tenantId = await resolveTenantForInboundEmail(
      ['support@acme.com', 'sales@globex.com'],
      prisma
    );

    expect(tenantId).toBe('tenant-globex');
  });

  it('issues exactly ONE query regardless of recipient count (no N+1)', async () => {
    const { prisma, findMany } = makePrisma([{ email: 'rep@acme.com', tenantId: 'tenant-acme' }]);

    await resolveTenantForInboundEmail(
      ['a@acme.com', 'b@acme.com', 'c@globex.com', 'd@initech.com'],
      prisma
    );

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('dedupes recipient domains in the OR clause (case-insensitive)', async () => {
    const { prisma, findMany } = makePrisma([{ email: 'rep@acme.com', tenantId: 'tenant-acme' }]);

    await resolveTenantForInboundEmail(['a@acme.com', 'b@ACME.com', 'c@acme.com'], prisma);

    const arg = findMany.mock.calls[0][0];
    expect(arg.where.OR).toEqual([{ email: { endsWith: '@acme.com' } }]);
    expect(arg.select).toEqual({ email: true, tenantId: true });
  });

  it("returns 'system' when no recipient domain matches a tenant", async () => {
    const { prisma } = makePrisma([]);

    const tenantId = await resolveTenantForInboundEmail(['ghost@nowhere.com'], prisma);

    expect(tenantId).toBe('system');
  });

  it("returns 'system' without querying when there are no valid addresses", async () => {
    const { prisma, findMany } = makePrisma([]);

    const tenantId = await resolveTenantForInboundEmail(['not-an-email', ''], prisma);

    expect(tenantId).toBe('system');
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns 'system' (non-fatal) when the query throws", async () => {
    const findMany = vi.fn().mockRejectedValue(new Error('db down'));
    const prisma = { user: { findMany } };

    const tenantId = await resolveTenantForInboundEmail(['a@acme.com'], prisma);

    expect(tenantId).toBe('system');
  });
});
