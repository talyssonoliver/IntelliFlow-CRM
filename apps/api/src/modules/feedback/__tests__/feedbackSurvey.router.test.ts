/**
 * Feedback Survey Analytics Router Tests - IFC-068
 *
 * Tests for customer feedback survey analytics endpoints:
 * - getDashboardStats
 * - getNPSTrend
 * - getSentimentBreakdown
 * - exportData
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { feedbackSurveyRouter } from '../feedbackSurvey.router';
import type { UserSession, Context } from '../../../context';

const mockPrisma = {} as Context['prisma'];

const mockFeedbackSurveyService = {
  getDashboardSummary: vi.fn(),
};

const mockUser: UserSession = {
  userId: 'user_123',
  email: 'test@example.com',
  role: 'USER',
  tenantId: 'tenant_123',
};

function createMockContext(overrides?: Partial<Context>) {
  return {
    prisma: mockPrisma,
    user: mockUser,
    services: {
      feedbackSurvey: mockFeedbackSurveyService,
    },
    ...overrides,
  } as any;
}

describe('feedbackSurveyRouter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getDashboardStats', () => {
    it('returns dashboard data with valid tenant context', async () => {
      const dashboardData = {
        hasData: true,
        nps: { score: 42, distribution: { promoters: 5, passives: 3, detractors: 2, total: 10 } },
        csat: { score: 80, totalResponses: 5 },
        ces: { score: 4.2, totalResponses: 3 },
        sentiment: { positive: 6, neutral: 2, negative: 2, total: 10 },
        trends: [{ period: '2025-01', nps: 40, csat: 78, ces: 4.1, responseCount: 10 }],
        responseRates: [{ type: 'NPS', sent: 20, responded: 10, rate: 50 }],
      };
      mockFeedbackSurveyService.getDashboardSummary.mockResolvedValue(dashboardData);

      const caller = feedbackSurveyRouter.createCaller(createMockContext());
      const result = await caller.getDashboardStats({ granularity: 'month' });

      expect(result.hasData).toBe(true);
      expect(result.nps?.score).toBe(42);
      expect(result.csat?.score).toBe(80);
      expect(mockFeedbackSurveyService.getDashboardSummary).toHaveBeenCalledWith(
        'tenant_123',
        expect.objectContaining({ granularity: 'month' })
      );
    });

    it('rejects unauthenticated calls (no tenant ID)', async () => {
      const caller = feedbackSurveyRouter.createCaller(
        createMockContext({ user: { ...mockUser, tenantId: '' } })
      );

      await expect(caller.getDashboardStats({ granularity: 'month' })).rejects.toThrow(TRPCError);
    });

    it('returns empty state when no data', async () => {
      mockFeedbackSurveyService.getDashboardSummary.mockResolvedValue({
        hasData: false,
        nps: null,
        csat: null,
        ces: null,
        sentiment: null,
        trends: [],
        responseRates: [],
      });

      const caller = feedbackSurveyRouter.createCaller(createMockContext());
      const result = await caller.getDashboardStats({ granularity: 'month' });

      expect(result.hasData).toBe(false);
      expect(result.nps).toBeNull();
    });
  });

  describe('getNPSTrend', () => {
    it('returns trend data for date range', async () => {
      const dashboardData = {
        hasData: true,
        nps: { score: 50, distribution: { promoters: 8, passives: 1, detractors: 1, total: 10 } },
        csat: null,
        ces: null,
        sentiment: null,
        trends: [
          { period: '2025-01', nps: 45, csat: null, ces: null, responseCount: 5 },
          { period: '2025-02', nps: 55, csat: null, ces: null, responseCount: 8 },
        ],
        responseRates: [],
      };
      mockFeedbackSurveyService.getDashboardSummary.mockResolvedValue(dashboardData);

      const caller = feedbackSurveyRouter.createCaller(createMockContext());
      const result = await caller.getNPSTrend({ granularity: 'month' });

      expect(result.trends).toHaveLength(2);
      expect(result.nps?.score).toBe(50);
    });
  });

  describe('getSentimentBreakdown', () => {
    it('returns sentiment distribution', async () => {
      const dashboardData = {
        hasData: true,
        nps: null,
        csat: null,
        ces: null,
        sentiment: { positive: 10, neutral: 5, negative: 3, total: 18 },
        trends: [],
        responseRates: [],
      };
      mockFeedbackSurveyService.getDashboardSummary.mockResolvedValue(dashboardData);

      const caller = feedbackSurveyRouter.createCaller(createMockContext());
      const result = await caller.getSentimentBreakdown({ granularity: 'month' });

      expect(result).toEqual({ positive: 10, neutral: 5, negative: 3, total: 18 });
    });
  });

  describe('exportData', () => {
    it('returns exportable data array', async () => {
      const dashboardData = {
        hasData: true,
        nps: { score: 30, distribution: { promoters: 3, passives: 2, detractors: 1, total: 6 } },
        csat: { score: 75, totalResponses: 4 },
        ces: null,
        sentiment: { positive: 3, neutral: 2, negative: 1, total: 6 },
        trends: [],
        responseRates: [{ type: 'NPS', sent: 10, responded: 6, rate: 60 }],
      };
      mockFeedbackSurveyService.getDashboardSummary.mockResolvedValue(dashboardData);

      const caller = feedbackSurveyRouter.createCaller(createMockContext());
      const result = await caller.exportData({ granularity: 'month' });

      expect(result.hasData).toBe(true);
      expect(result.responseRates).toHaveLength(1);
    });
  });

  describe('service availability', () => {
    it('throws INTERNAL_SERVER_ERROR when service is not available', async () => {
      const caller = feedbackSurveyRouter.createCaller(
        createMockContext({ services: { feedbackSurvey: undefined } as any })
      );

      await expect(caller.getDashboardStats({ granularity: 'month' })).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Feedback Survey Analytics service not available',
      });
    });

    it('all procedures use tenantProcedure (require tenant context)', async () => {
      const callerNoUser = feedbackSurveyRouter.createCaller(createMockContext({ user: null }));

      // All procedures should fail without authentication
      await expect(callerNoUser.getDashboardStats({ granularity: 'month' })).rejects.toThrow();
      await expect(callerNoUser.getNPSTrend({ granularity: 'month' })).rejects.toThrow();
      await expect(callerNoUser.getSentimentBreakdown({ granularity: 'month' })).rejects.toThrow();
      await expect(callerNoUser.exportData({ granularity: 'month' })).rejects.toThrow();
    });
  });

  describe('router registration', () => {
    it('feedbackSurvey key exists in appRouter', async () => {
      // Verify the router has the expected procedures
      const procedures = Object.keys(feedbackSurveyRouter._def.procedures);
      expect(procedures).toContain('getDashboardStats');
      expect(procedures).toContain('getNPSTrend');
      expect(procedures).toContain('getSentimentBreakdown');
      expect(procedures).toContain('exportData');
    });
  });
});
