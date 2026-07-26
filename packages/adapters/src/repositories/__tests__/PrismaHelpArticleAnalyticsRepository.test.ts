/**
 * PrismaHelpArticleAnalyticsRepository unit tests (IFC-304 PR A).
 *
 * Uses a mocked Prisma client to verify the atomic + idempotent write logic,
 * read aggregation, and batched purge — without a real database. Real-DB
 * behaviour (transaction rollback, cross-tenant isolation) is covered by the
 * sibling *.integration.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma, type PrismaClient } from '@intelliflow/db';
import { PrismaHelpArticleAnalyticsRepository } from '../PrismaHelpArticleAnalyticsRepository';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function makeMock() {
  const viewUpsert = vi.fn().mockResolvedValue({});
  const searchUpsert = vi.fn().mockResolvedValue({});
  const dedupCreate = vi.fn().mockResolvedValue({});

  const tx = {
    helpArticleViewDaily: { upsert: viewUpsert },
    helpArticleSearchNoResultDaily: { upsert: searchUpsert },
    helpArticleAnalyticsDedup: { create: dedupCreate },
  };

  const $transaction = vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

  const prisma = {
    $transaction,
    helpArticleViewDaily: { aggregate: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    helpArticleSearchNoResultDaily: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    helpArticleAnalyticsDedup: { findMany: vi.fn(), deleteMany: vi.fn() },
  };

  const repo = new PrismaHelpArticleAnalyticsRepository(prisma as unknown as PrismaClient);
  return { repo, prisma, viewUpsert, searchUpsert, dedupCreate };
}

describe('PrismaHelpArticleAnalyticsRepository', () => {
  const occurredAt = new Date('2026-07-26T14:00:00Z');
  let m: ReturnType<typeof makeMock>;

  beforeEach(() => {
    m = makeMock();
  });

  describe('recordArticleView', () => {
    it('increments the day bucket atomically (no dedup key)', async () => {
      const res = await m.repo.recordArticleView({ tenantId: 't1', articleId: 'a1', occurredAt });
      expect(res).toEqual({ recorded: true, deduped: false });
      expect(m.viewUpsert).toHaveBeenCalledTimes(1);
      const arg = m.viewUpsert.mock.calls[0][0];
      expect(arg.where.tenantId_articleId_day).toEqual({
        tenantId: 't1',
        articleId: 'a1',
        day: new Date('2026-07-26T00:00:00Z'),
      });
      expect(arg.create).toMatchObject({ viewCount: 1 });
      expect(arg.update).toEqual({ viewCount: { increment: 1 } });
      expect(m.dedupCreate).not.toHaveBeenCalled();
    });

    it('writes a namespaced dedup guard when an idempotencyKey is supplied', async () => {
      await m.repo.recordArticleView({
        tenantId: 't1',
        articleId: 'a1',
        idempotencyKey: 'abc',
        occurredAt,
      });
      expect(m.dedupCreate).toHaveBeenCalledTimes(1);
      expect(m.dedupCreate.mock.calls[0][0].data.idempotencyKey).toBe('view:abc');
    });

    it('returns deduped when the guard hits a unique violation (P2002)', async () => {
      m.dedupCreate.mockRejectedValueOnce(p2002());
      const res = await m.repo.recordArticleView({
        tenantId: 't1',
        articleId: 'a1',
        idempotencyKey: 'abc',
        occurredAt,
      });
      expect(res).toEqual({ recorded: false, deduped: true });
    });

    it('rethrows non-P2002 errors', async () => {
      m.dedupCreate.mockRejectedValueOnce(new Error('boom'));
      await expect(
        m.repo.recordArticleView({
          tenantId: 't1',
          articleId: 'a1',
          idempotencyKey: 'x',
          occurredAt,
        })
      ).rejects.toThrow('boom');
    });
  });

  describe('recordSearchNoResult', () => {
    it('short-circuits on an empty normalized term without touching the DB', async () => {
      const res = await m.repo.recordSearchNoResult({
        tenantId: 't1',
        normalizedTerm: '',
        occurredAt,
      });
      expect(res).toEqual({ recorded: false, deduped: false });
      expect(m.searchUpsert).not.toHaveBeenCalled();
    });

    it('increments the term/day bucket atomically', async () => {
      const res = await m.repo.recordSearchNoResult({
        tenantId: 't1',
        normalizedTerm: 'reset password',
        occurredAt,
      });
      expect(res).toEqual({ recorded: true, deduped: false });
      const arg = m.searchUpsert.mock.calls[0][0];
      expect(arg.where.tenantId_normalizedTerm_day.normalizedTerm).toBe('reset password');
      expect(arg.update).toEqual({ searchCount: { increment: 1 } });
    });

    it('namespaces the dedup key with the search prefix', async () => {
      await m.repo.recordSearchNoResult({
        tenantId: 't1',
        normalizedTerm: 'reset password',
        idempotencyKey: 'k9',
        occurredAt,
      });
      expect(m.dedupCreate.mock.calls[0][0].data.idempotencyKey).toBe('search:k9');
    });
  });

  describe('read helpers', () => {
    it('sums view counts, defaulting to 0', async () => {
      (m.prisma.helpArticleViewDaily.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
        _sum: { viewCount: 7 },
      });
      expect(await m.repo.getArticleViewTotal('t1', 'a1')).toBe(7);

      (m.prisma.helpArticleViewDaily.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
        _sum: { viewCount: null },
      });
      expect(await m.repo.getArticleViewTotal('t1', 'a2')).toBe(0);
    });

    it('sums no-result search counts, defaulting to 0 when null', async () => {
      (
        m.prisma.helpArticleSearchNoResultDaily.aggregate as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ _sum: { searchCount: 3 } });
      expect(await m.repo.getSearchNoResultTotal('t1', 'reset')).toBe(3);

      (
        m.prisma.helpArticleSearchNoResultDaily.aggregate as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ _sum: { searchCount: null } });
      expect(await m.repo.getSearchNoResultTotal('t1', 'other')).toBe(0);
    });
  });

  describe('purgeExpired', () => {
    it('batch-deletes expired dedup + out-of-retention aggregates and totals them', async () => {
      // dedup: 2 rows in one batch
      let dedupRows = [{ id: 'd1' }, { id: 'd2' }];
      (m.prisma.helpArticleAnalyticsDedup.findMany as ReturnType<typeof vi.fn>).mockImplementation(
        ({ take }: { take: number }) => Promise.resolve(dedupRows.slice(0, take))
      );
      (
        m.prisma.helpArticleAnalyticsDedup.deleteMany as ReturnType<typeof vi.fn>
      ).mockImplementation(({ where }: { where: { id: { in: string[] } } }) => {
        const ids = new Set(where.id.in);
        const count = dedupRows.filter((r) => ids.has(r.id)).length;
        dedupRows = dedupRows.filter((r) => !ids.has(r.id));
        return Promise.resolve({ count });
      });
      // views: 1 row
      let viewRows = [{ id: 'v1' }];
      (m.prisma.helpArticleViewDaily.findMany as ReturnType<typeof vi.fn>).mockImplementation(
        ({ take }: { take: number }) => Promise.resolve(viewRows.slice(0, take))
      );
      (m.prisma.helpArticleViewDaily.deleteMany as ReturnType<typeof vi.fn>).mockImplementation(
        ({ where }: { where: { id: { in: string[] } } }) => {
          const ids = new Set(where.id.in);
          const count = viewRows.filter((r) => ids.has(r.id)).length;
          viewRows = viewRows.filter((r) => !ids.has(r.id));
          return Promise.resolve({ count });
        }
      );
      // searches: none
      (
        m.prisma.helpArticleSearchNoResultDaily.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      const res = await m.repo.purgeExpired(new Date('2026-07-26T00:00:00Z'), 100);
      expect(res).toEqual({
        dedupPurged: 2,
        viewDailyPurged: 1,
        searchNoResultPurged: 0,
        totalPurged: 3,
      });
    });

    it('deletes in multiple batches when rows exceed the batch size', async () => {
      // 3 dedup rows, batchSize 2 → first full batch (2) continues, then 1 stops.
      let rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      (m.prisma.helpArticleAnalyticsDedup.findMany as ReturnType<typeof vi.fn>).mockImplementation(
        ({ take }: { take: number }) => Promise.resolve(rows.slice(0, take))
      );
      (
        m.prisma.helpArticleAnalyticsDedup.deleteMany as ReturnType<typeof vi.fn>
      ).mockImplementation(({ where }: { where: { id: { in: string[] } } }) => {
        const ids = new Set(where.id.in);
        const count = rows.filter((r) => ids.has(r.id)).length;
        rows = rows.filter((r) => !ids.has(r.id));
        return Promise.resolve({ count });
      });
      (m.prisma.helpArticleViewDaily.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (
        m.prisma.helpArticleSearchNoResultDaily.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      const res = await m.repo.purgeExpired(new Date('2026-07-26T00:00:00Z'), 2);
      expect(res.dedupPurged).toBe(3);
      expect(m.prisma.helpArticleAnalyticsDedup.deleteMany).toHaveBeenCalledTimes(2);
    });
  });
});
