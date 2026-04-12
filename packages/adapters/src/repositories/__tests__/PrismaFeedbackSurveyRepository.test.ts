/**
 * PrismaFeedbackSurveyRepository Tests - IFC-068
 *
 * Tests the Prisma-based feedback survey repository implementation
 * using a mock Prisma client. Covers all 5 public methods,
 * tenantId isolation, BigInt conversion, and SQL injection prevention.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaFeedbackSurveyRepository } from '../PrismaFeedbackSurveyRepository';

const createMockPrismaClient = () => ({
  feedbackSurvey: {
    findMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
  $queryRawUnsafe: vi.fn(),
});

describe('PrismaFeedbackSurveyRepository', () => {
  let repository: PrismaFeedbackSurveyRepository;
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  const tenantId = 'tenant-feedback-test';
  const from = new Date('2025-01-01');
  const to = new Date('2025-12-31');

  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma = createMockPrismaClient();
    repository = new PrismaFeedbackSurveyRepository(mockPrisma as any);
  });

  describe('getDashboardSummary()', () => {
    it('returns empty result when no surveys found', async () => {
      mockPrisma.feedbackSurvey.findMany.mockResolvedValue([]);

      const result = await repository.getDashboardSummary(tenantId, { granularity: 'month' });

      expect(result.hasData).toBe(false);
      expect(result.totalResponses).toBe(0);
      expect(result.npsScores).toEqual([]);
      expect(result.csatScores).toEqual([]);
      expect(result.cesScores).toEqual([]);
    });

    it('categorizes scores by survey type', async () => {
      mockPrisma.feedbackSurvey.findMany.mockResolvedValue([
        { type: 'NPS', score: 9 },
        { type: 'NPS', score: 3 },
        { type: 'CSAT', score: 4 },
        { type: 'CES', score: 5 },
      ]);

      const result = await repository.getDashboardSummary(tenantId, { granularity: 'month' });

      expect(result.hasData).toBe(true);
      expect(result.totalResponses).toBe(4);
      expect(result.npsScores).toEqual([9, 3]);
      expect(result.csatScores).toEqual([4]);
      expect(result.cesScores).toEqual([5]);
    });

    it('includes tenantId in query', async () => {
      mockPrisma.feedbackSurvey.findMany.mockResolvedValue([]);

      await repository.getDashboardSummary(tenantId, { granularity: 'month' });

      expect(mockPrisma.feedbackSurvey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
        })
      );
    });

    it('filters by status IN responded statuses', async () => {
      mockPrisma.feedbackSurvey.findMany.mockResolvedValue([]);

      await repository.getDashboardSummary(tenantId, { granularity: 'month' });

      expect(mockPrisma.feedbackSurvey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['RESPONDED', 'FOLLOWED_UP', 'CLOSED'] },
            score: { not: null },
          }),
        })
      );
    });

    it('applies date and type filters when provided', async () => {
      mockPrisma.feedbackSurvey.findMany.mockResolvedValue([]);

      await repository.getDashboardSummary(tenantId, {
        granularity: 'month',
        dateFrom: from,
        dateTo: to,
        surveyType: 'NPS',
      });

      expect(mockPrisma.feedbackSurvey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            createdAt: { lte: to },
            type: 'NPS',
          }),
        })
      );
    });

    it('skips null scores when categorizing', async () => {
      mockPrisma.feedbackSurvey.findMany.mockResolvedValue([
        { type: 'NPS', score: 9 },
        { type: 'NPS', score: null },
      ]);

      const result = await repository.getDashboardSummary(tenantId, { granularity: 'month' });

      expect(result.npsScores).toEqual([9]);
      expect(result.totalResponses).toBe(2);
    });
  });

  describe('getNPSDistribution()', () => {
    it('correctly categorizes promoters/passives/detractors', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { category: 'promoter', count: 10n },
        { category: 'passive', count: 5n },
        { category: 'detractor', count: 3n },
      ]);

      const result = await repository.getNPSDistribution(tenantId, from, to);

      expect(result.promoters).toBe(10);
      expect(result.passives).toBe(5);
      expect(result.detractors).toBe(3);
      expect(result.total).toBe(18);
    });

    it('converts BigInt count to Number', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ category: 'promoter', count: 999999999999n }]);

      const result = await repository.getNPSDistribution(tenantId, from, to);

      expect(typeof result.promoters).toBe('number');
      expect(result.promoters).toBe(999999999999);
    });

    it('handles empty distribution result', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await repository.getNPSDistribution(tenantId, from, to);

      expect(result.promoters).toBe(0);
      expect(result.passives).toBe(0);
      expect(result.detractors).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getTrendData()', () => {
    it('returns mapped trend data with correct types', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { period: '2025-01-01', avg_nps: 8.5, avg_csat: 4.2, avg_ces: 3.14, response_count: 50n },
      ]);

      const result = await repository.getTrendData(tenantId, from, to, 'month');

      expect(result).toHaveLength(1);
      expect(result[0].period).toBe('2025-01-01');
      expect(result[0].nps).toBe(9); // Math.round(8.5)
      expect(result[0].csat).toBe(4); // Math.round(4.2)
      expect(result[0].ces).toBe(3.14); // toFixed(2)
      expect(result[0].responseCount).toBe(50);
    });

    it('handles null averages in trend data', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { period: '2025-01-01', avg_nps: null, avg_csat: null, avg_ces: null, response_count: 0n },
      ]);

      const result = await repository.getTrendData(tenantId, from, to, 'month');

      expect(result[0].nps).toBeNull();
      expect(result[0].csat).toBeNull();
      expect(result[0].ces).toBeNull();
      expect(result[0].responseCount).toBe(0);
    });

    it('converts BigInt response_count to Number', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { period: '2025-01-01', avg_nps: 7, avg_csat: null, avg_ces: null, response_count: 42n },
      ]);

      const result = await repository.getTrendData(tenantId, from, to, 'day');

      expect(typeof result[0].responseCount).toBe('number');
      expect(result[0].responseCount).toBe(42);
    });

    it('throws for invalid granularity (SQL injection prevention)', async () => {
      await expect(
        repository.getTrendData(tenantId, from, to, 'DROP TABLE' as any)
      ).rejects.toThrow('Invalid granularity');
    });

    it('accepts all valid granularity values', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      for (const g of ['day', 'week', 'month'] as const) {
        await expect(repository.getTrendData(tenantId, from, to, g)).resolves.toEqual([]);
      }
    });

    it('passes tenantId as $1 parameter', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      await repository.getTrendData(tenantId, from, to, 'month');

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"tenantId" = $1'),
        tenantId,
        from,
        to
      );
    });
  });

  describe('getSentimentBreakdown()', () => {
    it('returns correct sentiment counts', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { sentiment: 'positive', count: 20n },
        { sentiment: 'negative', count: 5n },
        { sentiment: null, count: 10n },
      ]);

      const result = await repository.getSentimentBreakdown(tenantId, from, to);

      expect(result.positive).toBe(20);
      expect(result.neutral).toBe(10);
      expect(result.negative).toBe(5);
      expect(result.total).toBe(35);
    });

    it('maps null sentiment to neutral', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ sentiment: null, count: 15n }]);

      const result = await repository.getSentimentBreakdown(tenantId, from, to);

      expect(result.neutral).toBe(15);
      expect(result.total).toBe(15);
    });

    it('handles empty result', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const result = await repository.getSentimentBreakdown(tenantId, from, to);

      expect(result.positive).toBe(0);
      expect(result.neutral).toBe(0);
      expect(result.negative).toBe(0);
      expect(result.total).toBe(0);
    });

    it('includes type filter when provided', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      await repository.getSentimentBreakdown(tenantId, from, to, 'NPS');

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("AND type = 'NPS'"),
        tenantId,
        from,
        to
      );
    });

    it('passes tenantId as $1 parameter', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      await repository.getSentimentBreakdown(tenantId, from, to);

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('"tenantId" = $1'),
        tenantId,
        from,
        to
      );
    });
  });

  describe('getResponseRateByType()', () => {
    it('returns correct response rates', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { type: 'NPS', total_sent: 100n, total_responded: 75n },
        { type: 'CSAT', total_sent: 50n, total_responded: 40n },
      ]);

      const result = await repository.getResponseRateByType(tenantId, from, to);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: 'NPS', sent: 100, responded: 75, rate: 75 });
      expect(result[1]).toEqual({ type: 'CSAT', sent: 50, responded: 40, rate: 80 });
    });

    it('handles zero sent (no division by zero)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { type: 'CES', total_sent: 0n, total_responded: 0n },
      ]);

      const result = await repository.getResponseRateByType(tenantId, from, to);

      expect(result[0].rate).toBe(0);
    });

    it('converts BigInt to Number for all fields', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { type: 'NPS', total_sent: 1000n, total_responded: 800n },
      ]);

      const result = await repository.getResponseRateByType(tenantId, from, to);

      expect(typeof result[0].sent).toBe('number');
      expect(typeof result[0].responded).toBe('number');
      expect(typeof result[0].rate).toBe('number');
    });

    it('handles empty result', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await repository.getResponseRateByType(tenantId, from, to);

      expect(result).toEqual([]);
    });
  });
});
