import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuotaExceededError, type PlanTier, type QuotaKey } from '@intelliflow/domain';
import { QuotaService } from '../QuotaService';
import type { QuotaRepositoryPort, TenantQuotaOverrideRecord } from '../../ports';

const TENANT = 'tenant-1';

function makeRepo(
  init: {
    overrides?: TenantQuotaOverrideRecord[];
    contacts?: number;
    users?: number;
    workflows?: number;
    counters?: Record<string, number>;
  } = {}
) {
  const counters = new Map<string, number>(Object.entries(init.counters ?? {}));
  return {
    getOverrides: vi.fn(async () => init.overrides ?? []),
    countContacts: vi.fn(async () => init.contacts ?? 0),
    countUsers: vi.fn(async () => init.users ?? 0),
    countActiveWorkflows: vi.fn(async () => init.workflows ?? 0),
    getCounter: vi.fn(
      async (_t: string, key: QuotaKey, period: string) => counters.get(`${key}:${period}`) ?? 0
    ),
    incrementCounter: vi.fn(async (_t: string, key: QuotaKey, period: string, by: number) => {
      const next = (counters.get(`${key}:${period}`) ?? 0) + by;
      counters.set(`${key}:${period}`, next);
      return next;
    }),
  } satisfies QuotaRepositoryPort;
}

function makeService(
  plan: PlanTier,
  repo: QuotaRepositoryPort,
  now = new Date('2026-09-15T10:00:00Z')
) {
  const moduleAccess = { getTenantPlan: vi.fn(async () => plan) };
  return { service: new QuotaService(repo, moduleAccess, () => now), moduleAccess };
}

describe('QuotaService', () => {
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
  });

  describe('getLimits', () => {
    it('returns the plan defaults when there are no overrides', async () => {
      const { service } = makeService('PARTNER_FREE', repo);
      expect(await service.getLimits(TENANT)).toEqual({
        contacts: 500,
        seats: 2,
        emailsPerMonth: 0,
        aiSpendCentsPerMonth: 0,
        workflowsActive: 0,
      });
    });

    it('applies overrides, including null for unlimited', async () => {
      repo = makeRepo({
        overrides: [
          { key: 'emailsPerMonth', limit: 100 },
          { key: 'contacts', limit: null },
        ],
      });
      const { service } = makeService('PARTNER_FREE', repo);
      const limits = await service.getLimits(TENANT);
      expect(limits.emailsPerMonth).toBe(100);
      expect(limits.contacts).toBeNull();
      expect(limits.seats).toBe(2);
    });

    it('does not mutate the shared plan map across calls', async () => {
      repo = makeRepo({ overrides: [{ key: 'seats', limit: 99 }] });
      const { service } = makeService('STARTER', repo);
      await service.getLimits(TENANT);
      const { service: other } = makeService('STARTER', makeRepo());
      expect((await other.getLimits(TENANT)).seats).toBe(3);
    });
  });

  describe('getUsage', () => {
    it('combines live counts with current-month counters', async () => {
      repo = makeRepo({
        contacts: 12,
        users: 2,
        workflows: 1,
        counters: {
          'emailsPerMonth:2026-09': 40,
          'emailsPerMonth:2026-08': 999,
          'aiSpendCentsPerMonth:2026-09': 75,
        },
      });
      const { service } = makeService('STARTER', repo);
      expect(await service.getUsage(TENANT)).toEqual({
        contacts: 12,
        seats: 2,
        emailsPerMonth: 40,
        aiSpendCentsPerMonth: 75,
        workflowsActive: 1,
      });
    });
  });

  describe('assertWithinQuota', () => {
    it('passes when under the limit', async () => {
      repo = makeRepo({ contacts: 499 });
      const { service } = makeService('PARTNER_FREE', repo);
      await expect(service.assertWithinQuota(TENANT, 'contacts')).resolves.toBeUndefined();
    });

    it('throws QuotaExceededError with key, used and limit when at the limit', async () => {
      repo = makeRepo({ contacts: 500 });
      const { service } = makeService('PARTNER_FREE', repo);
      const err = await service.assertWithinQuota(TENANT, 'contacts').catch((e) => e);
      expect(err).toBeInstanceOf(QuotaExceededError);
      expect(err).toMatchObject({ key: 'contacts', used: 500, limit: 500, increment: 1 });
    });

    it('honours the increment', async () => {
      repo = makeRepo({ contacts: 495 });
      const { service } = makeService('PARTNER_FREE', repo);
      await expect(service.assertWithinQuota(TENANT, 'contacts', 5)).resolves.toBeUndefined();
      await expect(service.assertWithinQuota(TENANT, 'contacts', 6)).rejects.toBeInstanceOf(
        QuotaExceededError
      );
    });

    it('blocks a zero-limit capability outright', async () => {
      const { service } = makeService('PARTNER_FREE', repo);
      await expect(service.assertWithinQuota(TENANT, 'emailsPerMonth')).rejects.toMatchObject({
        key: 'emailsPerMonth',
        used: 0,
        limit: 0,
      });
      await expect(service.assertWithinQuota(TENANT, 'workflowsActive')).rejects.toBeInstanceOf(
        QuotaExceededError
      );
    });

    it('skips the usage lookup for unlimited plans', async () => {
      const { service } = makeService('ENTERPRISE', repo);
      await expect(
        service.assertWithinQuota(TENANT, 'contacts', 1_000_000)
      ).resolves.toBeUndefined();
      expect(repo.countContacts).not.toHaveBeenCalled();
    });

    it('uses an override to lift a zero limit', async () => {
      repo = makeRepo({ overrides: [{ key: 'emailsPerMonth', limit: 10 }] });
      const { service } = makeService('PARTNER_FREE', repo);
      await expect(service.assertWithinQuota(TENANT, 'emailsPerMonth')).resolves.toBeUndefined();
    });

    it('reads seats from the live user count', async () => {
      repo = makeRepo({ users: 2 });
      const { service } = makeService('STARTER', repo);
      await expect(service.assertWithinQuota(TENANT, 'seats')).resolves.toBeUndefined();
      expect(repo.countUsers).toHaveBeenCalledWith(TENANT);
    });

    it('reads workflowsActive from the live active-workflow count', async () => {
      repo = makeRepo({ workflows: 3 });
      const { service } = makeService('STARTER', repo);
      await expect(service.assertWithinQuota(TENANT, 'workflowsActive')).rejects.toMatchObject({
        used: 3,
        limit: 3,
      });
      expect(repo.countActiveWorkflows).toHaveBeenCalledWith(TENANT);
    });

    it('reads aiSpendCentsPerMonth from the current-month counter', async () => {
      repo = makeRepo({ counters: { 'aiSpendCentsPerMonth:2026-09': 2000 } });
      const { service } = makeService('STARTER', repo);
      await expect(service.assertWithinQuota(TENANT, 'aiSpendCentsPerMonth')).rejects.toMatchObject(
        { used: 2000, limit: 2000 }
      );
    });
  });

  describe('increment', () => {
    it('upserts the counter for the current month', async () => {
      const { service } = makeService('STARTER', repo);
      await service.increment(TENANT, 'emailsPerMonth', 3);
      expect(repo.incrementCounter).toHaveBeenCalledWith(TENANT, 'emailsPerMonth', '2026-09', 3);
      expect(await repo.getCounter(TENANT, 'emailsPerMonth', '2026-09')).toBe(3);
    });

    it('defaults to 1', async () => {
      const { service } = makeService('STARTER', repo);
      await service.increment(TENANT, 'aiSpendCentsPerMonth');
      expect(repo.incrementCounter).toHaveBeenCalledWith(
        TENANT,
        'aiSpendCentsPerMonth',
        '2026-09',
        1
      );
    });

    it('is a no-op for live-count keys and zero increments', async () => {
      const { service } = makeService('STARTER', repo);
      await service.increment(TENANT, 'contacts', 5);
      await service.increment(TENANT, 'emailsPerMonth', 0);
      expect(repo.incrementCounter).not.toHaveBeenCalled();
    });

    it('rolls over to a new period on the next month', async () => {
      const first = makeService('STARTER', repo, new Date('2026-09-30T23:59:59Z'));
      await first.service.increment(TENANT, 'emailsPerMonth', 500);
      const second = makeService('STARTER', repo, new Date('2026-10-01T00:00:00Z'));
      await expect(
        second.service.assertWithinQuota(TENANT, 'emailsPerMonth')
      ).resolves.toBeUndefined();
    });
  });
});
