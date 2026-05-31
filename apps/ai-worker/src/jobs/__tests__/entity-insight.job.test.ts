/**
 * NP-018 regression tests for entity-insight.job.ts
 *
 * Verifies:
 * 1. Single-entity path (contact / account) still uses findUnique (unchanged).
 * 2. Scheduled fan-out path uses exactly 2 findMany calls (one per settings
 *    table) regardless of tenant count — never per-tenant findUnique.
 * 3. Only tenants whose settings row has aiInsightGeneration=true get entities
 *    enqueued; disabled tenants are silently skipped.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const prismaContactSettingFindUniqueMock = vi.fn();
const prismaAccountSettingFindUniqueMock = vi.fn();
const prismaContactSettingFindManyMock = vi.fn();
const prismaAccountSettingFindManyMock = vi.fn();
const prismaContactGroupByMock = vi.fn();
const prismaAccountGroupByMock = vi.fn();
const prismaContactFindManyMock = vi.fn();
const prismaAccountFindManyMock = vi.fn();

vi.mock('@intelliflow/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/db');
  return {
    ...actual,
    prisma: {
      contactAutomationSetting: {
        findUnique: prismaContactSettingFindUniqueMock,
        findMany: prismaContactSettingFindManyMock,
      },
      accountAutomationSetting: {
        findUnique: prismaAccountSettingFindUniqueMock,
        findMany: prismaAccountSettingFindManyMock,
      },
      contact: {
        groupBy: prismaContactGroupByMock,
        findMany: prismaContactFindManyMock,
      },
      account: {
        groupBy: prismaAccountGroupByMock,
        findMany: prismaAccountFindManyMock,
      },
      contactAIInsight: { upsert: vi.fn().mockResolvedValue({}) },
      accountAIInsight: { upsert: vi.fn().mockResolvedValue({}) },
    },
  };
});

// ---------------------------------------------------------------------------
// Chain mocks (generateContactInsight / generateAccountInsight)
// ---------------------------------------------------------------------------

const generateContactInsightMock = vi.fn().mockResolvedValue({ insight: 'contact-ok' });
const generateAccountInsightMock = vi.fn().mockResolvedValue({ insight: 'account-ok' });

vi.mock('../../contact-insight.chain.js', () => ({
  generateContactInsight: generateContactInsightMock,
}));

vi.mock('../../account-insight.chain.js', () => ({
  generateAccountInsight: generateAccountInsightMock,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(
  data: Record<string, unknown>,
  queueAddMock = vi.fn().mockResolvedValue(undefined)
) {
  return {
    data,
    queue: { add: queueAddMock },
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('entity-insight.job — single-entity path (unchanged)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips contact job when aiInsightGeneration is false', async () => {
    prismaContactSettingFindUniqueMock.mockResolvedValue({ aiInsightGeneration: false });
    const { processEntityInsightJob } = await import('../entity-insight.job.js');
    const out = await processEntityInsightJob(
      makeJob({ entityType: 'contact', entityId: 'c-1', tenantId: 't-1' })
    );
    expect(out.skipped).toBe(true);
    expect(generateContactInsightMock).not.toHaveBeenCalled();
  });

  it('skips account job when aiInsightGeneration is false', async () => {
    prismaAccountSettingFindUniqueMock.mockResolvedValue({ aiInsightGeneration: false });
    const { processEntityInsightJob } = await import('../entity-insight.job.js');
    const out = await processEntityInsightJob(
      makeJob({ entityType: 'account', entityId: 'a-1', tenantId: 't-1' })
    );
    expect(out.skipped).toBe(true);
    expect(generateAccountInsightMock).not.toHaveBeenCalled();
  });

  it('executes contact insight chain when flag is on', async () => {
    prismaContactSettingFindUniqueMock.mockResolvedValue({ aiInsightGeneration: true });
    const { processEntityInsightJob } = await import('../entity-insight.job.js');
    const out = await processEntityInsightJob(
      makeJob({ entityType: 'contact', entityId: 'c-1', tenantId: 't-1' })
    );
    expect(out.skipped).toBeUndefined();
    expect(generateContactInsightMock).toHaveBeenCalledTimes(1);
  });

  it('executes account insight chain when flag is on', async () => {
    prismaAccountSettingFindUniqueMock.mockResolvedValue({ aiInsightGeneration: true });
    const { processEntityInsightJob } = await import('../entity-insight.job.js');
    const out = await processEntityInsightJob(
      makeJob({ entityType: 'account', entityId: 'a-1', tenantId: 't-1' })
    );
    expect(out.skipped).toBeUndefined();
    expect(generateAccountInsightMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// NP-018 regression: scheduled fan-out must NOT call findUnique per tenant
// ---------------------------------------------------------------------------

describe('entity-insight.job — scheduled fan-out (NP-018 fix)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses exactly 2 findMany calls regardless of tenant count (NEVER per-tenant findUnique)', async () => {
    const tenants = ['t-1', 't-2', 't-3'];

    // groupBy returns 3 tenants for contacts, 2 for accounts — union = 3
    prismaContactGroupByMock.mockResolvedValue(
      tenants.map((tenantId) => ({ tenantId, _count: 5 }))
    );
    prismaAccountGroupByMock.mockResolvedValue([
      { tenantId: 't-1', _count: 2 },
      { tenantId: 't-2', _count: 1 },
    ]);

    // Only t-1 + t-2 have contact insight enabled; only t-1 has account insight enabled
    prismaContactSettingFindManyMock.mockResolvedValue([{ tenantId: 't-1' }, { tenantId: 't-2' }]);
    prismaAccountSettingFindManyMock.mockResolvedValue([{ tenantId: 't-1' }]);

    // Batched entity fetch: ONE findMany per entity type returns tenantId-tagged
    // rows for all enabled tenants (was one findMany per tenant — an N+1).
    prismaContactFindManyMock.mockResolvedValue([
      { id: 'c-1a', tenantId: 't-1' },
      { id: 'c-1b', tenantId: 't-1' },
      { id: 'c-2a', tenantId: 't-2' },
    ]);
    prismaAccountFindManyMock.mockResolvedValue([{ id: 'a-1a', tenantId: 't-1' }]);

    const queueAddMock = vi.fn().mockResolvedValue(undefined);
    const job = makeJob(
      { entityType: 'contact', entityId: '__scheduled__', tenantId: '__scheduled__' },
      queueAddMock
    );

    const { processEntityInsightJob } = await import('../entity-insight.job.js');
    const out = await processEntityInsightJob(job);

    // N+1 fix: settings findMany called exactly ONCE each (2 total), not 2*N=6
    expect(prismaContactSettingFindManyMock).toHaveBeenCalledTimes(1);
    expect(prismaAccountSettingFindManyMock).toHaveBeenCalledTimes(1);

    // The old per-tenant findUnique must NOT be called at all
    expect(prismaContactSettingFindUniqueMock).not.toHaveBeenCalled();
    expect(prismaAccountSettingFindUniqueMock).not.toHaveBeenCalled();

    // Correct fan-out counts: 3 contacts (t-1: 2, t-2: 1) + 1 account (t-1: 1)
    expect(out.fannedOut).toEqual({ contacts: 3, accounts: 1, tenants: 3 });

    // Batched entity scan: ONE findMany per entity type regardless of tenant count.
    expect(prismaContactFindManyMock).toHaveBeenCalledTimes(1);
    expect(prismaAccountFindManyMock).toHaveBeenCalledTimes(1);

    // Correct jobs were enqueued
    const addCalls = queueAddMock.mock.calls.map((c: any) => c[1]);
    expect(addCalls.filter((d: any) => d.entityType === 'contact')).toHaveLength(3);
    expect(addCalls.filter((d: any) => d.entityType === 'account')).toHaveLength(1);

    // t-3 had no enabled settings — no entities enqueued for it
    expect(addCalls.some((d: any) => d.tenantId === 't-3')).toBe(false);
  });

  it('call count stays constant (2) when tenant count grows from 1 to 5', async () => {
    const tenants = ['t-1', 't-2', 't-3', 't-4', 't-5'];

    prismaContactGroupByMock.mockResolvedValue(
      tenants.map((tenantId) => ({ tenantId, _count: 1 }))
    );
    prismaAccountGroupByMock.mockResolvedValue([]);

    // All tenants enabled for contact, none for account
    prismaContactSettingFindManyMock.mockResolvedValue(tenants.map((tenantId) => ({ tenantId })));
    prismaAccountSettingFindManyMock.mockResolvedValue([]);

    prismaContactFindManyMock.mockResolvedValue([{ id: 'c-x' }]);
    prismaAccountFindManyMock.mockResolvedValue([]);

    const queueAddMock = vi.fn().mockResolvedValue(undefined);
    const job = makeJob(
      { entityType: 'contact', entityId: '__scheduled__', tenantId: '__scheduled__' },
      queueAddMock
    );

    const { processEntityInsightJob } = await import('../entity-insight.job.js');
    await processEntityInsightJob(job);

    // Regardless of 5 tenants, settings queries = 2 (batched), not 10
    expect(prismaContactSettingFindManyMock).toHaveBeenCalledTimes(1);
    expect(prismaAccountSettingFindManyMock).toHaveBeenCalledTimes(1);
    expect(prismaContactSettingFindUniqueMock).not.toHaveBeenCalled();
    expect(prismaAccountSettingFindUniqueMock).not.toHaveBeenCalled();
  });

  it('returns empty fan-out when no tenants have recent activity', async () => {
    prismaContactGroupByMock.mockResolvedValue([]);
    prismaAccountGroupByMock.mockResolvedValue([]);
    prismaContactSettingFindManyMock.mockResolvedValue([]);
    prismaAccountSettingFindManyMock.mockResolvedValue([]);

    const job = makeJob(
      { entityType: 'contact', entityId: '__scheduled__', tenantId: '__scheduled__' },
      vi.fn().mockResolvedValue(undefined)
    );

    const { processEntityInsightJob } = await import('../entity-insight.job.js');
    const out = await processEntityInsightJob(job);

    expect(out.fannedOut).toEqual({ contacts: 0, accounts: 0, tenants: 0 });
    // Still exactly 2 batched calls even with empty tenant list
    expect(prismaContactSettingFindManyMock).toHaveBeenCalledTimes(1);
    expect(prismaAccountSettingFindManyMock).toHaveBeenCalledTimes(1);
  });

  it('findMany WHERE clause includes tenantId:in and aiInsightGeneration:true filter', async () => {
    const tenants = ['t-a', 't-b'];

    prismaContactGroupByMock.mockResolvedValue(
      tenants.map((tenantId) => ({ tenantId, _count: 1 }))
    );
    prismaAccountGroupByMock.mockResolvedValue([]);
    prismaContactSettingFindManyMock.mockResolvedValue([]);
    prismaAccountSettingFindManyMock.mockResolvedValue([]);
    prismaContactFindManyMock.mockResolvedValue([]);
    prismaAccountFindManyMock.mockResolvedValue([]);

    const job = makeJob(
      { entityType: 'account', entityId: '__scheduled__', tenantId: '__scheduled__' },
      vi.fn().mockResolvedValue(undefined)
    );

    const { processEntityInsightJob } = await import('../entity-insight.job.js');
    await processEntityInsightJob(job);

    const contactFindManyArgs = prismaContactSettingFindManyMock.mock.calls[0]?.[0];
    expect(contactFindManyArgs).toBeDefined();
    expect(contactFindManyArgs.where.tenantId.in).toEqual(expect.arrayContaining(tenants));
    expect(contactFindManyArgs.where.aiInsightGeneration).toBe(true);
    expect(contactFindManyArgs.select).toEqual({ tenantId: true });
  });
});
