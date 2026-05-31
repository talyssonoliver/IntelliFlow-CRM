/**
 * NP-017 regression tests — account-scoring.job batched settings lookup.
 *
 * Guards against re-introducing the per-tenant N+1 query in
 * dispatchScheduledAccountScoring:
 *   BEFORE: prisma.accountAutomationSetting.findUnique called once per tenant
 *   AFTER:  prisma.accountAutomationSetting.findMany called ONCE for all tenants
 *
 * Also covers:
 *   - single-tenant path (toggle-off skip)
 *   - fan-out returns correct activeTenants / accountEnqueued counts
 *   - fan-out ignores tenants whose aiAccountScoring flag is false
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Prisma mock stubs
// ---------------------------------------------------------------------------
const accountSettingFindUniqueMock = vi.fn();
const accountSettingFindManyMock = vi.fn();
const accountFindUniqueMock = vi.fn();
const accountFindManyMock = vi.fn();
const accountGroupByMock = vi.fn();
const accountUpdateMock = vi.fn().mockResolvedValue({});
const contactCountMock = vi.fn().mockResolvedValue(3);
const opportunityCountMock = vi.fn().mockResolvedValue(1);

vi.mock('@intelliflow/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/db');
  return {
    ...actual,
    prisma: {
      accountAutomationSetting: {
        findUnique: accountSettingFindUniqueMock,
        findMany: accountSettingFindManyMock,
      },
      account: {
        findUnique: accountFindUniqueMock,
        findMany: accountFindManyMock,
        groupBy: accountGroupByMock,
        update: accountUpdateMock,
      },
      contact: { count: contactCountMock },
      opportunity: { count: opportunityCountMock },
    },
  };
});

// ---------------------------------------------------------------------------
// scoreAccount chain mock — always returns success with score 42
// ---------------------------------------------------------------------------
vi.mock('../account-scoring.chain.js', () => ({
  scoreAccount: vi.fn().mockResolvedValue({
    success: true,
    score: 42,
    confidence: 0.9,
    requiresReview: false,
    modelVersion: 'account-scoring-v1',
    source: 'llm',
    factors: [],
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('account-scoring.job — NP-017 N+1 fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountUpdateMock.mockResolvedValue({});
    contactCountMock.mockResolvedValue(3);
    opportunityCountMock.mockResolvedValue(1);
  });

  // ── Single-tenant path (non-sentinel) ─────────────────────────────────────

  describe('single-tenant path (non-sentinel)', () => {
    it('skips when aiAccountScoring toggle is off', async () => {
      accountSettingFindUniqueMock.mockResolvedValue({ aiAccountScoring: false });

      const { processAccountScoringJob } = await import('./account-scoring.job.js');
      const out = await processAccountScoringJob({
        data: { accountId: 'a-1', tenantId: 't-1' },
      } as any);

      expect(out.skipped).toBe(true);
      expect(accountSettingFindUniqueMock).toHaveBeenCalledOnce();
      // findMany must NOT be called in the single-tenant path
      expect(accountSettingFindManyMock).not.toHaveBeenCalled();
    });

    it('returns score when toggle on and account found', async () => {
      accountSettingFindUniqueMock.mockResolvedValue({ aiAccountScoring: true });
      accountFindUniqueMock.mockResolvedValue({
        id: 'a-1',
        tenantId: 't-1',
        name: 'Acme',
        revenue: 500_000,
      });

      const { processAccountScoringJob } = await import('./account-scoring.job.js');
      const out = await processAccountScoringJob({
        data: { accountId: 'a-1', tenantId: 't-1' },
      } as any);

      expect(out.skipped).toBeUndefined();
      expect(out.score).toBe(42);
    });
  });

  // ── Scheduled sentinel fan-out path ───────────────────────────────────────

  describe('__scheduled__ sentinel fan-out — batched settings lookup', () => {
    it('calls accountAutomationSetting.findMany ONCE regardless of tenant count', async () => {
      // Simulate 3 active tenants from account.groupBy
      accountGroupByMock.mockResolvedValue([
        { tenantId: 't-A', _count: 10 },
        { tenantId: 't-B', _count: 5 },
        { tenantId: 't-C', _count: 3 },
      ]);

      // Only t-A and t-C have the toggle on
      accountSettingFindManyMock.mockResolvedValue([{ tenantId: 't-A' }, { tenantId: 't-C' }]);

      // Batched: ONE account.findMany returns tenantId-tagged rows for all
      // enabled tenants (2 accounts each for t-A + t-C).
      accountFindManyMock.mockResolvedValue([
        { id: 'acc-1', tenantId: 't-A' },
        { id: 'acc-2', tenantId: 't-A' },
        { id: 'acc-3', tenantId: 't-C' },
        { id: 'acc-4', tenantId: 't-C' },
      ]);

      const queueAddMock = vi.fn().mockResolvedValue(undefined);

      const { processAccountScoringJob } = await import('./account-scoring.job.js');
      const out = await processAccountScoringJob({
        data: { accountId: '__scheduled__', tenantId: '__scheduled__' },
        queue: { add: queueAddMock },
      } as any);

      // findMany called exactly ONCE — batch for all tenants, not N times
      expect(accountSettingFindManyMock).toHaveBeenCalledOnce();

      // findUnique must NOT be called in the fan-out path (N+1 eliminated)
      expect(accountSettingFindUniqueMock).not.toHaveBeenCalled();

      // Only the 2 enabled tenants are active
      expect(out.fannedOut?.tenants).toBe(2);

      // 2 accounts x 2 enabled tenants = 4 jobs enqueued
      expect(out.fannedOut?.accounts).toBe(4);
      expect(queueAddMock).toHaveBeenCalledTimes(4);

      // Batched: account.findMany called ONCE across all enabled tenants (was N).
      expect(accountFindManyMock).toHaveBeenCalledOnce();
    });

    it('constant call count — findMany called once for 1 tenant or 100 tenants', async () => {
      // Build a large set of tenants to confirm call-count is constant
      const manyTenants = Array.from({ length: 10 }, (_, i) => ({
        tenantId: `tenant-${i}`,
        _count: 1,
      }));
      accountGroupByMock.mockResolvedValue(manyTenants);

      // All enabled
      accountSettingFindManyMock.mockResolvedValue(
        manyTenants.map((t) => ({ tenantId: t.tenantId }))
      );

      // 1 account per tenant
      accountFindManyMock.mockResolvedValue([{ id: 'acc-x' }]);

      const queueAddMock = vi.fn().mockResolvedValue(undefined);

      const { processAccountScoringJob } = await import('./account-scoring.job.js');
      await processAccountScoringJob({
        data: { accountId: '__scheduled__', tenantId: '__scheduled__' },
        queue: { add: queueAddMock },
      } as any);

      // KEY ASSERTION: exactly 1 call regardless of how many tenants exist
      expect(accountSettingFindManyMock).toHaveBeenCalledTimes(1);
      expect(accountSettingFindUniqueMock).not.toHaveBeenCalled();
    });

    it('skips disabled tenants and counts only active ones', async () => {
      accountGroupByMock.mockResolvedValue([
        { tenantId: 'enabled-1', _count: 5 },
        { tenantId: 'disabled-1', _count: 8 },
        { tenantId: 'disabled-2', _count: 2 },
      ]);

      // Only enabled-1 has aiAccountScoring: true
      accountSettingFindManyMock.mockResolvedValue([{ tenantId: 'enabled-1' }]);

      accountFindManyMock.mockResolvedValue([
        { id: 'a-1', tenantId: 'enabled-1' },
        { id: 'a-2', tenantId: 'enabled-1' },
        { id: 'a-3', tenantId: 'enabled-1' },
      ]);

      const queueAddMock = vi.fn().mockResolvedValue(undefined);

      const { processAccountScoringJob } = await import('./account-scoring.job.js');
      const out = await processAccountScoringJob({
        data: { accountId: '__scheduled__', tenantId: '__scheduled__' },
        queue: { add: queueAddMock },
      } as any);

      expect(out.fannedOut?.tenants).toBe(1);
      expect(out.fannedOut?.accounts).toBe(3);
      // account.findMany only called for enabled-1 (1 tenant)
      expect(accountFindManyMock).toHaveBeenCalledOnce();
    });

    it('returns zero counts when no tenants have the toggle enabled', async () => {
      accountGroupByMock.mockResolvedValue([
        { tenantId: 't-X', _count: 10 },
        { tenantId: 't-Y', _count: 3 },
      ]);

      // No tenants enabled
      accountSettingFindManyMock.mockResolvedValue([]);

      const queueAddMock = vi.fn().mockResolvedValue(undefined);

      const { processAccountScoringJob } = await import('./account-scoring.job.js');
      const out = await processAccountScoringJob({
        data: { accountId: '__scheduled__', tenantId: '__scheduled__' },
        queue: { add: queueAddMock },
      } as any);

      expect(out.fannedOut?.tenants).toBe(0);
      expect(out.fannedOut?.accounts).toBe(0);
      expect(queueAddMock).not.toHaveBeenCalled();
      // findMany still called once (batch query ran, just returned empty)
      expect(accountSettingFindManyMock).toHaveBeenCalledOnce();
    });

    it('returns zero counts when no active tenants found by groupBy', async () => {
      accountGroupByMock.mockResolvedValue([]);
      accountSettingFindManyMock.mockResolvedValue([]);

      const queueAddMock = vi.fn().mockResolvedValue(undefined);

      const { processAccountScoringJob } = await import('./account-scoring.job.js');
      const out = await processAccountScoringJob({
        data: { accountId: '__scheduled__', tenantId: '__scheduled__' },
        queue: { add: queueAddMock },
      } as any);

      expect(out.fannedOut?.tenants).toBe(0);
      expect(out.fannedOut?.accounts).toBe(0);
    });
  });
});
