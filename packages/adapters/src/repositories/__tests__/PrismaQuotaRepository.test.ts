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
      $executeRaw: vi.fn(),
      $transaction: vi.fn(),
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

  it('reserves with one conditional upsert guarding both the insert and the update branch', async () => {
    prisma.$queryRaw.mockResolvedValue([{ value: 7 }]);
    await expect(repo.reserveCounter('t1', 'emailsPerMonth', '2026-09', 2, 500)).resolves.toBe(7);
    const [strings, ...values] = prisma.$queryRaw.mock.calls[0];
    const sql = strings.join('?');
    expect(sql).toContain('ON CONFLICT ("tenantId", "key", "period")');
    // Insert branch: SELECT ... WHERE by <= limit. Update branch: DO UPDATE ... WHERE value + by <= limit.
    expect(sql).toMatch(/SELECT[\s\S]*WHERE \?::int <= \?::int/);
    expect(sql).toMatch(
      /DO UPDATE SET[\s\S]*WHERE tenant_usage_counters\."value" \+ \?::int <= \?::int/
    );
    expect(values).toEqual(expect.arrayContaining(['t1', 'emailsPerMonth', '2026-09', 2, 500]));
  });

  it('reports null when the reservation would exceed the limit (no row returned)', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(
      repo.reserveCounter('t1', 'emailsPerMonth', '2026-09', 2, 500)
    ).resolves.toBeNull();
  });

  it('decrements with a floor at zero, scoped to the tenant, key and period', async () => {
    prisma.$executeRaw.mockResolvedValue(1);
    await repo.decrementCounter('t1', 'emailsPerMonth', '2026-09', 2);
    const [strings, ...values] = prisma.$executeRaw.mock.calls[0];
    expect(strings.join('?')).toContain('GREATEST("value" - ?::int, 0)');
    expect(values).toEqual([2, 't1', 'emailsPerMonth', '2026-09']);
  });

  it('runs fn inside a transaction that first takes the (tenant, key) advisory lock', async () => {
    const order: string[] = [];
    const tx = {
      // $executeRaw: Prisma 7 cannot deserialize pg_advisory_xact_lock's void result via $queryRaw.
      $executeRaw: vi.fn(async (strings: string[], ...values: unknown[]) => {
        order.push(`lock:${strings.join('?')}:${values.join(',')}`);
        return 1;
      }),
    };
    prisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown, opts: unknown) => {
      order.push(`tx:${JSON.stringify(opts)}`);
      return fn(tx);
    });

    const out = await repo.runExclusive('t1', 'contacts', async () => {
      order.push('fn');
      return 42;
    });

    expect(out).toBe(42);
    expect(order[0]).toContain('"timeout":30000');
    expect(order[1]).toContain('pg_advisory_xact_lock');
    expect(order[1]).toContain('quota:t1:contacts');
    expect(order[2]).toBe('fn');
  });
});
