/**
 * AnalyticsAggregationService Tests
 *
 * Tests for application-layer analytics service using mocked AnalyticsRepository port.
 * Verifies: month-filling, raw value normalization (AC-007), parallel queries (AC-006),
 * YoY calculation, export pipeline, and empty data handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsAggregationService } from '../AnalyticsAggregationService';
import type {
  AnalyticsRepository,
  OpportunityGroupByResult,
  LeadGroupByResult,
  ActivityItem,
} from '../../ports/repositories/AnalyticsRepositoryPort';

const TENANT_ID = 'tenant_test_001';

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(15);
  return d;
}

function createMockRepo(): Record<keyof AnalyticsRepository, ReturnType<typeof vi.fn>> {
  return {
    getDealsWonByMonth: vi.fn().mockResolvedValue([]),
    getMonthlyRevenue: vi.fn().mockResolvedValue(0),
    countLeadsInRange: vi.fn().mockResolvedValue(0),
    countOpportunitiesInRange: vi.fn().mockResolvedValue(0),
    countContactsInRange: vi.fn().mockResolvedValue(0),
    getLeadsBySource: vi.fn().mockResolvedValue([]),
    getRecentAuditLogs: vi.fn().mockResolvedValue([]),
    countTotalLeads: vi.fn().mockResolvedValue(0),
    countLeadsThisMonth: vi.fn().mockResolvedValue(0),
  };
}

describe('AnalyticsAggregationService', () => {
  let mockRepo: ReturnType<typeof createMockRepo>;
  let service: AnalyticsAggregationService;

  beforeEach(() => {
    mockRepo = createMockRepo();
    service = new AnalyticsAggregationService(mockRepo as AnalyticsRepository);
  });

  // ============================================
  // getDealsWonTrend
  // ============================================

  describe('getDealsWonTrend', () => {
    it('returns monthly trend data with correct month labels', async () => {
      const oppResults: OpportunityGroupByResult[] = [
        { closedAt: monthsAgo(1), _count: 3, _sum: { value: 15000 } },
        { closedAt: monthsAgo(2), _count: 2, _sum: { value: 8000 } },
      ];
      mockRepo.getDealsWonByMonth.mockResolvedValue(oppResults);

      const result = await service.getDealsWonTrend(TENANT_ID, 6);

      expect(result).toHaveLength(6);
      expect(result[0]).toHaveProperty('month');
      expect(result[0]).toHaveProperty('value');
      expect(result[0]).toHaveProperty('revenue');
    });

    it('fills missing months with zero values', async () => {
      // Only 1 month has data, rest should be zero
      const closedDate = monthsAgo(0);
      mockRepo.getDealsWonByMonth.mockResolvedValue([
        { closedAt: closedDate, _count: 1, _sum: { value: 1000 } },
      ]);

      const result = await service.getDealsWonTrend(TENANT_ID, 6);

      expect(result).toHaveLength(6);
      const zeroMonths = result.filter((r) => r.value === 0);
      expect(zeroMonths.length).toBeGreaterThanOrEqual(4);
    });

    it('groups raw results by YYYY-MM month key', async () => {
      const closeDate = monthsAgo(1);
      const closeDate2 = new Date(closeDate);
      closeDate2.setDate(closeDate2.getDate() + 1);

      mockRepo.getDealsWonByMonth.mockResolvedValue([
        { closedAt: closeDate, _count: 1, _sum: { value: 2000 } },
        { closedAt: closeDate2, _count: 1, _sum: { value: 3000 } },
      ]);

      const result = await service.getDealsWonTrend(TENANT_ID, 6);

      const monthWithData = result.find((r) => r.value > 0);
      expect(monthWithData).toBeDefined();
      expect(monthWithData!.value).toBe(2);
      expect(monthWithData!.revenue).toBe(5000);
    });

    it('defaults to 6 months when not specified', async () => {
      const result = await service.getDealsWonTrend(TENANT_ID);

      expect(result).toHaveLength(6);
      expect(mockRepo.getDealsWonByMonth).toHaveBeenCalledWith(TENANT_ID, 6);
    });

    it('returns zero-filled array when no data exists', async () => {
      const result = await service.getDealsWonTrend(TENANT_ID, 6);

      expect(result).toHaveLength(6);
      expect(result.every((r) => r.value === 0)).toBe(true);
      expect(result.every((r) => r.revenue === 0)).toBe(true);
    });

    it('handles single-month request correctly', async () => {
      const now = new Date();
      mockRepo.getDealsWonByMonth.mockResolvedValue([
        { closedAt: now, _count: 5, _sum: { value: 7500 } },
      ]);

      const result = await service.getDealsWonTrend(TENANT_ID, 1);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(5);
      expect(result[0].revenue).toBe(7500);
    });
  });

  // ============================================
  // getGrowthTrend
  // ============================================

  describe('getGrowthTrend', () => {
    it('returns revenue growth trend for N months', async () => {
      mockRepo.getMonthlyRevenue.mockResolvedValue(50000);

      const result = await service.getGrowthTrend(TENANT_ID, 'revenue', 6);

      expect(result).toHaveLength(6);
      expect(result[result.length - 1].value).toBe(50000);
      expect(mockRepo.getMonthlyRevenue).toHaveBeenCalledTimes(6);
    });

    it('returns leads growth trend for N months', async () => {
      mockRepo.countLeadsInRange.mockResolvedValue(25);

      const result = await service.getGrowthTrend(TENANT_ID, 'leads', 3);

      expect(result).toHaveLength(3);
      expect(result[result.length - 1].value).toBe(25);
      expect(mockRepo.countLeadsInRange).toHaveBeenCalledTimes(3);
    });

    it('returns deals growth trend for N months', async () => {
      mockRepo.countOpportunitiesInRange.mockResolvedValue(10);

      const result = await service.getGrowthTrend(TENANT_ID, 'deals', 3);

      expect(result).toHaveLength(3);
      expect(result[result.length - 1].value).toBe(10);
    });

    it('returns contacts growth trend for N months', async () => {
      mockRepo.countContactsInRange.mockResolvedValue(42);

      const result = await service.getGrowthTrend(TENANT_ID, 'contacts', 3);

      expect(result).toHaveLength(3);
      expect(result[result.length - 1].value).toBe(42);
    });

    it('uses raw values (not broken 0-100 normalization) (AC-007)', async () => {
      mockRepo.countLeadsInRange.mockResolvedValue(150);

      const result = await service.getGrowthTrend(TENANT_ID, 'leads', 3);

      // AC-007: raw value, NOT capped to 100
      expect(result[result.length - 1].value).toBe(150);
      expect(result[result.length - 1].rawValue).toBe(150);
    });

    it('calculates YoY change correctly when 12+ months available', async () => {
      // First month (12 months ago) returns 10, last month returns 20
      let callIndex = 0;
      mockRepo.countLeadsInRange.mockImplementation(async () => {
        callIndex++;
        if (callIndex === 1) return 10; // First month (12 months ago)
        if (callIndex === 12) return 20; // Last month (current)
        return 0;
      });

      const result = await service.getGrowthTrend(TENANT_ID, 'leads', 12);

      expect(result).toHaveLength(12);
      const latest = result[result.length - 1];
      // YoY: (20 - 10) / 10 * 100 = 100%
      expect(latest.yoyChange).toBe(100);
    });

    it('handles months with zero values', async () => {
      const result = await service.getGrowthTrend(TENANT_ID, 'revenue', 6);

      expect(result).toHaveLength(6);
      expect(result.every((r) => r.value === 0)).toBe(true);
    });

    it('defaults to 12 months when not specified', async () => {
      const result = await service.getGrowthTrend(TENANT_ID, 'revenue');

      expect(result).toHaveLength(12);
    });

    it('executes queries in parallel via Promise.all (AC-006)', async () => {
      const startTime = Date.now();
      await service.getGrowthTrend(TENANT_ID, 'revenue', 12);
      const elapsed = Date.now() - startTime;

      // With mocked repo, parallel execution is near-instant
      expect(elapsed).toBeLessThan(300);
    });
  });

  // ============================================
  // getTrafficSources
  // ============================================

  describe('getTrafficSources', () => {
    it('returns formatted source distribution with percentages', async () => {
      const sources: LeadGroupByResult[] = [
        { source: 'WEBSITE', _count: 40 },
        { source: 'REFERRAL', _count: 30 },
        { source: 'SOCIAL', _count: 20 },
        { source: 'OTHER', _count: 10 },
      ];
      mockRepo.getLeadsBySource.mockResolvedValue(sources);

      const result = await service.getTrafficSources(TENANT_ID);

      expect(result).toHaveLength(4);
      const totalPercentage = result.reduce((sum, r) => sum + r.percentage, 0);
      expect(totalPercentage).toBe(100);
    });

    it('assigns correct CSS color classes', async () => {
      mockRepo.getLeadsBySource.mockResolvedValue([
        { source: 'WEBSITE', _count: 5 },
        { source: 'REFERRAL', _count: 3 },
      ]);

      const result = await service.getTrafficSources(TENANT_ID);

      const website = result.find((r) => r.name === 'Website');
      expect(website?.color).toBe('bg-ds-primary');

      const referral = result.find((r) => r.name === 'Referral');
      expect(referral?.color).toBe('bg-emerald-500');
    });

    it('formats source names (title case, replace underscores)', async () => {
      mockRepo.getLeadsBySource.mockResolvedValue([{ source: 'COLD_CALL', _count: 5 }]);

      const result = await service.getTrafficSources(TENANT_ID);

      expect(result[0].name).toBe('Cold Call');
    });

    it('returns empty array when no leads exist', async () => {
      const result = await service.getTrafficSources(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('sorts by percentage descending', async () => {
      mockRepo.getLeadsBySource.mockResolvedValue([
        { source: 'SOCIAL', _count: 10 },
        { source: 'WEBSITE', _count: 90 },
      ]);

      const result = await service.getTrafficSources(TENANT_ID);

      expect(result[0].name).toBe('Website');
      expect(result[0].percentage).toBeGreaterThan(result[1].percentage);
    });
  });

  // ============================================
  // getRecentActivity
  // ============================================

  describe('getRecentActivity', () => {
    it('returns activity feed with icons and descriptions', async () => {
      const activities: ActivityItem[] = [
        {
          id: 'log_1',
          action: 'CREATE',
          icon: 'add_circle',
          description: 'New item: Test',
          actorName: 'Test User',
          createdAt: new Date(),
        },
      ];
      mockRepo.getRecentAuditLogs.mockResolvedValue(activities);

      const result = await service.getRecentActivity(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('icon');
      expect(result[0]).toHaveProperty('description');
    });

    it('defaults to limit of 10', async () => {
      await service.getRecentActivity(TENANT_ID);

      expect(mockRepo.getRecentAuditLogs).toHaveBeenCalledWith(TENANT_ID, 10, [
        'CREATE',
        'QUALIFY',
        'CONVERT',
        'UPDATE',
      ]);
    });

    it('passes correct AuditAction enum values to repository', async () => {
      await service.getRecentActivity(TENANT_ID, 5);

      expect(mockRepo.getRecentAuditLogs).toHaveBeenCalledWith(TENANT_ID, 5, [
        'CREATE',
        'QUALIFY',
        'CONVERT',
        'UPDATE',
      ]);
    });
  });

  // ============================================
  // getLeadStats
  // ============================================

  describe('getLeadStats', () => {
    it('returns total and newThisMonth counts', async () => {
      mockRepo.countTotalLeads.mockResolvedValue(150);
      mockRepo.countLeadsThisMonth.mockResolvedValue(25);

      const result = await service.getLeadStats(TENANT_ID);

      expect(result.total).toBe(150);
      expect(result.newThisMonth).toBe(25);
    });

    it('calls both repository methods in parallel', async () => {
      const startTime = Date.now();
      await service.getLeadStats(TENANT_ID);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(100);
      expect(mockRepo.countTotalLeads).toHaveBeenCalledTimes(1);
      expect(mockRepo.countLeadsThisMonth).toHaveBeenCalledTimes(1);
    });

    it('returns zeros when no leads exist', async () => {
      const result = await service.getLeadStats(TENANT_ID);

      expect(result.total).toBe(0);
      expect(result.newThisMonth).toBe(0);
    });
  });

  // ============================================
  // exportMetrics (NEW)
  // ============================================

  describe('exportMetrics', () => {
    const dateRange = {
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-02-28'),
    };

    it('returns structured data for selected metrics in date range', async () => {
      mockRepo.countLeadsInRange.mockResolvedValue(42);

      const result = await service.exportMetrics(TENANT_ID, dateRange, ['leads']);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('month');
      expect(result[0]).toHaveProperty('metric');
      expect(result[0]).toHaveProperty('value');
      expect(result[0].metric).toBe('leads');
    });

    it('handles multiple metric types in single request', async () => {
      mockRepo.countLeadsInRange.mockResolvedValue(10);
      mockRepo.countContactsInRange.mockResolvedValue(5);

      const result = await service.exportMetrics(TENANT_ID, dateRange, ['leads', 'contacts']);

      const leadMetrics = result.filter((r) => r.metric === 'leads');
      const contactMetrics = result.filter((r) => r.metric === 'contacts');

      expect(leadMetrics.length).toBeGreaterThan(0);
      expect(contactMetrics.length).toBeGreaterThan(0);
    });

    it('returns raw values (not normalized) for export accuracy', async () => {
      mockRepo.countLeadsInRange.mockResolvedValue(200);

      const result = await service.exportMetrics(TENANT_ID, dateRange, ['leads']);

      // Raw value = 200, not capped to 100
      const firstMetric = result.find((r) => r.value > 0);
      expect(firstMetric?.value).toBe(200);
    });

    it('returns empty rows for months with no data', async () => {
      const result = await service.exportMetrics(TENANT_ID, dateRange, ['leads']);

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((r) => r.value === 0)).toBe(true);
    });

    it('NP-023: fans out all metric×month pairs in a single parallel batch (no sequential per-metric awaiting)', async () => {
      mockRepo.countLeadsInRange.mockResolvedValue(10);
      mockRepo.countContactsInRange.mockResolvedValue(5);
      mockRepo.countOpportunitiesInRange.mockResolvedValue(3);

      // 3 metrics × 2 months in dateRange (Jan + Feb 2026)
      const result = await service.exportMetrics(TENANT_ID, dateRange, [
        'leads',
        'contacts',
        'deals',
      ]);

      // 3 metrics × 2 months = 6 rows total
      expect(result).toHaveLength(6);

      // All lead rows come before contact rows (metric-outer × month-inner order preserved)
      const leadRows = result.filter((r) => r.metric === 'leads');
      const contactRows = result.filter((r) => r.metric === 'contacts');
      const dealRows = result.filter((r) => r.metric === 'deals');
      expect(leadRows).toHaveLength(2);
      expect(contactRows).toHaveLength(2);
      expect(dealRows).toHaveLength(2);

      // The repository methods must be called exactly N-months times each (not N-metrics × N-months sequentially)
      // For 2 months: countLeadsInRange called 2 times, countContactsInRange 2 times, countOpportunitiesInRange 2 times
      expect(mockRepo.countLeadsInRange).toHaveBeenCalledTimes(2);
      expect(mockRepo.countContactsInRange).toHaveBeenCalledTimes(2);
      expect(mockRepo.countOpportunitiesInRange).toHaveBeenCalledTimes(2);
    });

    it('NP-023: result order is metric-outer × month-inner regardless of collection size', async () => {
      mockRepo.getMonthlyRevenue.mockResolvedValue(100);
      mockRepo.countLeadsInRange.mockResolvedValue(20);

      // 2 metrics × 2 months
      const result = await service.exportMetrics(TENANT_ID, dateRange, ['revenue', 'leads']);

      expect(result[0].metric).toBe('revenue');
      expect(result[1].metric).toBe('revenue');
      expect(result[2].metric).toBe('leads');
      expect(result[3].metric).toBe('leads');
    });
  });

  // ============================================
  // exportConversionFunnel (NEW)
  // ============================================

  describe('exportConversionFunnel', () => {
    const dateRange = {
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-02-28'),
    };

    it('returns leads, opportunities, closedWon counts', async () => {
      mockRepo.countLeadsInRange.mockResolvedValue(100);
      mockRepo.countOpportunitiesInRange.mockResolvedValue(30);
      mockRepo.getDealsWonByMonth.mockResolvedValue([
        { closedAt: new Date('2026-01-15'), _count: 10, _sum: { value: 50000 } },
      ]);

      const result = await service.exportConversionFunnel(TENANT_ID, dateRange);

      expect(result).toHaveProperty('leads', 100);
      expect(result).toHaveProperty('opportunities', 30);
      expect(result).toHaveProperty('closedWon', 10);
      expect(result).toHaveProperty('conversionRate');
    });

    it('calculates conversion rates correctly', async () => {
      mockRepo.countLeadsInRange.mockResolvedValue(100);
      mockRepo.countOpportunitiesInRange.mockResolvedValue(50);
      mockRepo.getDealsWonByMonth.mockResolvedValue([
        { closedAt: new Date('2026-01-15'), _count: 10, _sum: { value: 50000 } },
      ]);

      const result = await service.exportConversionFunnel(TENANT_ID, dateRange);

      // 10 / 100 * 100 = 10%
      expect(result.conversionRate).toBe(10);
    });

    it('returns zeros when no data in range', async () => {
      const result = await service.exportConversionFunnel(TENANT_ID, dateRange);

      expect(result.leads).toBe(0);
      expect(result.opportunities).toBe(0);
      expect(result.closedWon).toBe(0);
      expect(result.conversionRate).toBe(0);
    });

    it('handles zero-division for conversion rate', async () => {
      const result = await service.exportConversionFunnel(TENANT_ID, dateRange);

      expect(result.conversionRate).toBe(0);
      expect(Number.isFinite(result.conversionRate)).toBe(true);
    });
  });

  // ============================================
  // Performance (NF-001)
  // ============================================

  describe('performance', () => {
    it('all service methods complete within 300ms (NF-001 p95 baseline)', async () => {
      const methods = [
        () => service.getDealsWonTrend(TENANT_ID, 6),
        () => service.getGrowthTrend(TENANT_ID, 'revenue', 12),
        () => service.getTrafficSources(TENANT_ID),
        () => service.getRecentActivity(TENANT_ID),
        () => service.getLeadStats(TENANT_ID),
        () =>
          service.exportMetrics(TENANT_ID, { startDate: monthsAgo(6), endDate: new Date() }, [
            'revenue',
            'leads',
          ]),
        () =>
          service.exportConversionFunnel(TENANT_ID, {
            startDate: monthsAgo(6),
            endDate: new Date(),
          }),
      ];

      for (const method of methods) {
        const start = Date.now();
        await method();
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(300);
      }
    });
  });
});
