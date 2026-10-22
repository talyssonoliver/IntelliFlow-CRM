import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaPurposeSpendRepository } from '../PrismaPurposeSpendRepository';

/** Flatten a tagged-template `$queryRaw` call into its SQL text and bound values. */
function rawCall(mock: ReturnType<typeof vi.fn>, index = 0): { sql: string; values: unknown[] } {
  const [strings, ...values] = mock.mock.calls[index] as [TemplateStringsArray, ...unknown[]];
  return { sql: strings.join('?'), values };
}

describe('PrismaPurposeSpendRepository (PG-199)', () => {
  let prisma: Record<string, any>;
  let repo: PrismaPurposeSpendRepository;

  beforeEach(() => {
    prisma = {
      tenantUsageCounter: { findMany: vi.fn() },
      $queryRaw: vi.fn(),
    };
    repo = new PrismaPurposeSpendRepository(prisma as never);
  });

  describe('addSpend', () => {
    it('upserts the per-purpose counter atomically and returns the new value', async () => {
      prisma.$queryRaw.mockResolvedValue([{ value: 1250 }]);
      await expect(repo.addSpend('t1', 'reasoning', '2026-10', 250)).resolves.toBe(1250);

      const { sql, values } = rawCall(prisma.$queryRaw);
      expect(sql).toMatch(/INSERT INTO tenant_usage_counters/);
      expect(sql).toMatch(/ON CONFLICT \("tenantId", "key", "period"\)/);
      expect(values).toContain('t1');
      expect(values).toContain('aiSpendCentiCents:reasoning');
      expect(values).toContain('2026-10');
      expect(values).toContain(250);
    });

    it('clamps at the INTEGER maximum instead of overflowing', async () => {
      prisma.$queryRaw.mockResolvedValue([{ value: 2147483647 }]);
      await expect(repo.addSpend('t1', 'scoring', '2026-10', 5_000_000_000)).resolves.toBe(
        2147483647
      );

      const { sql, values } = rawCall(prisma.$queryRaw);
      expect(sql).toMatch(/LEAST\(/);
      expect(values).toContain(2147483647);
      expect(values).not.toContain(5_000_000_000);
    });

    it('ignores zero or negative amounts without writing', async () => {
      await expect(repo.addSpend('t1', 'scoring', '2026-10', 0)).resolves.toBe(0);
      await expect(repo.addSpend('t1', 'scoring', '2026-10', -5)).resolves.toBe(0);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('rounds fractional amounts up so no spend is dropped', async () => {
      prisma.$queryRaw.mockResolvedValue([{ value: 1 }]);
      await repo.addSpend('t1', 'rag', '2026-10', 0.2);
      expect(rawCall(prisma.$queryRaw).values).toContain(1);
    });

    it('returns 0 when the statement returns no row', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(repo.addSpend('t1', 'scoring', '2026-10', 3)).resolves.toBe(0);
    });
  });

  describe('getSpend', () => {
    it('reads the requested purposes for the tenant and period in one query', async () => {
      prisma.tenantUsageCounter.findMany.mockResolvedValue([
        { key: 'aiSpendCentiCents:scoring', value: 40 },
        { key: 'aiSpendCentiCents:email', value: 9 },
      ]);
      await expect(repo.getSpend('t1', '2026-10', ['scoring', 'email', 'rag'])).resolves.toEqual({
        scoring: 40,
        email: 9,
        rag: 0,
      });
      expect(prisma.tenantUsageCounter.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 't1',
          period: '2026-10',
          key: {
            in: ['aiSpendCentiCents:scoring', 'aiSpendCentiCents:email', 'aiSpendCentiCents:rag'],
          },
        },
        select: { key: true, value: true },
      });
    });

    it('returns an empty map without querying when no purposes are asked for', async () => {
      await expect(repo.getSpend('t1', '2026-10', [])).resolves.toEqual({});
      expect(prisma.tenantUsageCounter.findMany).not.toHaveBeenCalled();
    });
  });
});
