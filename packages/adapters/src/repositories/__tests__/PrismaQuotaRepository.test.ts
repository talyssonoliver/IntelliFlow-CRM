import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaQuotaRepository } from '../PrismaQuotaRepository';

describe('PrismaQuotaRepository', () => {
  let prisma: Record<string, any>;
  let repo: PrismaQuotaRepository;

  beforeEach(() => {
    prisma = {
      tenantQuotaOverride: { findMany: vi.fn() },
      tenantUsageCounter: { findUnique: vi.fn() },
      contact: { count: vi.fn() },
      user: { count: vi.fn() },
      workflowDefinition: { count: vi.fn() },
      $queryRaw: vi.fn(),
    };
    repo = new PrismaQuotaRepository(prisma as never);
  });

  it('returns overrides and skips rows with an unknown key', async () => {
    prisma.tenantQuotaOverride.findMany.mockResolvedValue([
      { key: 'contacts', limit: 10 },
      { key: 'seats', limit: null },
      { key: 'legacyKey', limit: 5 },
    ]);
    await expect(repo.getOverrides('t1')).resolves.toEqual([
      { key: 'contacts', limit: 10 },
      { key: 'seats', limit: null },
    ]);
    expect(prisma.tenantQuotaOverride.findMany).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
  });

  it('counts contacts and users scoped to the tenant', async () => {
    prisma.contact.count.mockResolvedValue(7);
    prisma.user.count.mockResolvedValue(2);
    await expect(repo.countContacts('t1')).resolves.toBe(7);
    await expect(repo.countUsers('t1')).resolves.toBe(2);
    expect(prisma.contact.count).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
  });

  it('counts only active, non-deleted workflows', async () => {
    prisma.workflowDefinition.count.mockResolvedValue(3);
    await expect(repo.countActiveWorkflows('t1')).resolves.toBe(3);
    expect(prisma.workflowDefinition.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', isActive: true, deletedAt: null },
    });
  });

  it('reads a counter, defaulting to 0 when the row does not exist', async () => {
    prisma.tenantUsageCounter.findUnique.mockResolvedValueOnce({ value: 12 });
    prisma.tenantUsageCounter.findUnique.mockResolvedValueOnce(null);
    await expect(repo.getCounter('t1', 'emailsPerMonth', '2026-09')).resolves.toBe(12);
    await expect(repo.getCounter('t1', 'emailsPerMonth', '2026-10')).resolves.toBe(0);
    expect(prisma.tenantUsageCounter.findUnique).toHaveBeenCalledWith({
      where: { tenantId_key_period: { tenantId: 't1', key: 'emailsPerMonth', period: '2026-09' } },
    });
  });

  it('increments through a single atomic upsert statement and returns the new value', async () => {
    prisma.$queryRaw.mockResolvedValue([{ value: 5 }]);
    await expect(repo.incrementCounter('t1', 'emailsPerMonth', '2026-09', 2)).resolves.toBe(5);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = prisma.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toContain('ON CONFLICT ("tenantId", "key", "period")');
    expect(values).toEqual(expect.arrayContaining(['t1', 'emailsPerMonth', '2026-09', 2]));
  });

  it('returns 0 if the upsert returns no row', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(repo.incrementCounter('t1', 'aiSpendCentsPerMonth', '2026-09', 1)).resolves.toBe(
      0
    );
  });
});
