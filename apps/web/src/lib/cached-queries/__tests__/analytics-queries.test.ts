/**
 * Tests for analytics-queries.ts
 *
 * fetchAnalyticsOverview:
 * - Calls cacheLife with DASHBOARD_STATS ("minutes") profile
 * - Calls cacheTag with ANALYTICS_OVERVIEW ("analytics:overview")
 * - Adds per-user tag when userId is provided
 * - Does NOT add per-user tag when userId is null
 * - Delegates to caller.analytics.getOverview() with optional date range
 * - Delegates to caller.analytics.getOverview() without dates when omitted
 * - Returns the tRPC response unchanged
 * - Works with a null token (unauthenticated path)
 *
 * fetchConversionFunnel:
 * - Calls cacheLife with RECORD_DETAIL ("hours") profile
 * - Calls cacheTag with ANALYTICS_OVERVIEW ("analytics:overview")
 * - Adds per-user tag when userId is provided
 * - Does NOT add per-user tag when userId is null
 * - Delegates to caller.analytics.getConversionFunnel() with correct args
 * - Defaults includeLeads to true
 * - Returns the tRPC response unchanged
 * - Works with a null token (unauthenticated path)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Stub transitive deps of trpc-server.ts ───────────────────────────────────
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

// ── Mock next/cache ──────────────────────────────────────────────────────────
const mockCacheLife = vi.fn();
const mockCacheTag = vi.fn();
vi.mock('next/cache', () => ({
  cacheLife: (...args: unknown[]) => mockCacheLife(...args),
  cacheTag: (...args: unknown[]) => mockCacheTag(...args),
}));

// ── Mock trpc-server ─────────────────────────────────────────────────────────
const mockGetOverview = vi.fn();
const mockGetConversionFunnel = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchAnalyticsOverview, fetchConversionFunnel } from '../analytics-queries';

const SAMPLE_OVERVIEW = {
  totalLeads: 120,
  leadDelta: 5,
  totalRevenue: 450_000,
  revenueDelta: 12_000,
  openOpportunities: 34,
  openOpportunitiesDelta: 3,
  winRate: 42,
  winRateDelta: 2,
  newContacts: 18,
  newContactsDelta: 4,
  recentActivity: [],
};

const SAMPLE_FUNNEL = {
  overallConversionRate: 28,
  totalLeads: 120,
  stages: [
    { stage: 'PROSPECTING', label: 'Prospecting', value: 200_000, count: 40 },
    { stage: 'QUALIFICATION', label: 'Qualification', value: 150_000, count: 25 },
    { stage: 'CLOSED_WON', label: 'Closed Won', value: 100_000, count: 12 },
  ],
};

const START = '2026-01-01T00:00:00.000Z';
const END = '2026-03-31T23:59:59.999Z';

describe('analytics-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      analytics: {
        getOverview: { query: mockGetOverview },
        getConversionFunnel: { query: mockGetConversionFunnel },
      },
    });
  });

  // ── fetchAnalyticsOverview ──────────────────────────────────────────────────

  describe('fetchAnalyticsOverview', () => {
    it('calls cacheLife with DASHBOARD_STATS ("minutes") profile', async () => {
      mockGetOverview.mockResolvedValue(SAMPLE_OVERVIEW);

      await fetchAnalyticsOverview('tok', null);

      expect(mockCacheLife).toHaveBeenCalledWith('minutes');
    });

    it('always tags with ANALYTICS_OVERVIEW ("analytics:overview")', async () => {
      mockGetOverview.mockResolvedValue(SAMPLE_OVERVIEW);

      await fetchAnalyticsOverview('tok', null);

      expect(mockCacheTag).toHaveBeenCalledWith('analytics:overview');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockGetOverview.mockResolvedValue(SAMPLE_OVERVIEW);

      await fetchAnalyticsOverview('tok', 'user-abc');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-abc');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockGetOverview.mockResolvedValue(SAMPLE_OVERVIEW);

      await fetchAnalyticsOverview('tok', null);

      // cacheTag called exactly once (ANALYTICS_OVERVIEW only)
      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('delegates getOverview with startDate and endDate when provided', async () => {
      mockGetOverview.mockResolvedValue(SAMPLE_OVERVIEW);

      await fetchAnalyticsOverview('tok', 'uid-1', START, END);

      expect(mockGetOverview).toHaveBeenCalledWith({ startDate: START, endDate: END });
    });

    it('delegates getOverview with undefined dates when omitted', async () => {
      mockGetOverview.mockResolvedValue(SAMPLE_OVERVIEW);

      await fetchAnalyticsOverview('tok', 'uid-1');

      expect(mockGetOverview).toHaveBeenCalledWith({ startDate: undefined, endDate: undefined });
    });

    it('returns the result from caller.analytics.getOverview unchanged', async () => {
      mockGetOverview.mockResolvedValue(SAMPLE_OVERVIEW);

      const result = await fetchAnalyticsOverview('tok', 'uid-1', START, END);

      expect(result).toEqual(SAMPLE_OVERVIEW);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockGetOverview.mockResolvedValue(SAMPLE_OVERVIEW);

      await fetchAnalyticsOverview(null, null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });
  });

  // ── fetchConversionFunnel ───────────────────────────────────────────────────

  describe('fetchConversionFunnel', () => {
    it('calls cacheLife with RECORD_DETAIL ("hours") profile', async () => {
      mockGetConversionFunnel.mockResolvedValue(SAMPLE_FUNNEL);

      await fetchConversionFunnel('tok', null, START, END);

      expect(mockCacheLife).toHaveBeenCalledWith('hours');
    });

    it('always tags with ANALYTICS_OVERVIEW ("analytics:overview")', async () => {
      mockGetConversionFunnel.mockResolvedValue(SAMPLE_FUNNEL);

      await fetchConversionFunnel('tok', null, START, END);

      expect(mockCacheTag).toHaveBeenCalledWith('analytics:overview');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockGetConversionFunnel.mockResolvedValue(SAMPLE_FUNNEL);

      await fetchConversionFunnel('tok', 'user-xyz', START, END);

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-xyz');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockGetConversionFunnel.mockResolvedValue(SAMPLE_FUNNEL);

      await fetchConversionFunnel('tok', null, START, END);

      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('delegates to getConversionFunnel with startDate, endDate, and includeLeads=true by default', async () => {
      mockGetConversionFunnel.mockResolvedValue(SAMPLE_FUNNEL);

      await fetchConversionFunnel('tok', 'uid-1', START, END);

      expect(mockGetConversionFunnel).toHaveBeenCalledWith({
        startDate: START,
        endDate: END,
        includeLeads: true,
      });
    });

    it('passes explicit includeLeads=false when provided', async () => {
      mockGetConversionFunnel.mockResolvedValue(SAMPLE_FUNNEL);

      await fetchConversionFunnel('tok', 'uid-1', START, END, false);

      expect(mockGetConversionFunnel).toHaveBeenCalledWith({
        startDate: START,
        endDate: END,
        includeLeads: false,
      });
    });

    it('returns the result from caller.analytics.getConversionFunnel unchanged', async () => {
      mockGetConversionFunnel.mockResolvedValue(SAMPLE_FUNNEL);

      const result = await fetchConversionFunnel('tok', 'uid-1', START, END);

      expect(result).toEqual(SAMPLE_FUNNEL);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockGetConversionFunnel.mockResolvedValue(SAMPLE_FUNNEL);

      await fetchConversionFunnel(null, null, START, END);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });
  });
});
