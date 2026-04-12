/**
 * Tests for deal-queries.ts
 *
 * Verifies that:
 * fetchDeals:
 * - Calls cacheLife with LIST_PAGE ("minutes") profile
 * - Calls cacheTag with DEALS_LIST ("deals:list") tag
 * - Adds per-user tag when userId is provided
 * - Does NOT add per-user tag when userId is null
 * - Delegates to caller.opportunity.list() with correct default args
 * - Returns the tRPC response unchanged
 * - Works with a null token (unauthenticated path)
 * - Passes through custom limit and page arguments
 *
 * fetchDealForecast:
 * - Calls cacheLife with DASHBOARD_STATS ("minutes") profile
 * - Calls cacheTag with DEALS_FORECAST ("deals:forecast") tag
 * - Adds per-user tag when userId is provided
 * - Does NOT add per-user tag when userId is null
 * - Delegates to caller.opportunity.forecast()
 * - Returns the tRPC response unchanged
 * - Works with a null token (unauthenticated path)
 * - Creates caller from the provided token
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Stub transitive deps of trpc-server.ts that Vite transform resolves ──────
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@intelliflow/api/context', () => ({ createContext: vi.fn() }));
vi.mock('@intelliflow/api/router', () => ({ appRouter: { createCaller: vi.fn() } }));

// ── Mock next/cache ──────────────────────────────────────────────────────────
const mockCacheLife = vi.fn();
const mockCacheTag = vi.fn();
vi.mock('next/cache', () => ({
  cacheLife: (...args: unknown[]) => mockCacheLife(...args),
  cacheTag: (...args: unknown[]) => mockCacheTag(...args),
}));

// ── Mock trpc-server ─────────────────────────────────────────────────────────
const mockOpportunityList = vi.fn();
const mockOpportunityForecast = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchDeals, fetchDealForecast } from '../deal-queries';

// ── Sample data ──────────────────────────────────────────────────────────────

const SAMPLE_DEALS_PAGE = {
  opportunities: [
    {
      id: 'deal-1',
      name: 'Enterprise Contract',
      stage: 'PROPOSAL',
      value: 50000,
      probability: 70,
      createdAt: new Date(),
    },
    {
      id: 'deal-2',
      name: 'SMB Renewal',
      stage: 'NEGOTIATION',
      value: 12000,
      probability: 85,
      createdAt: new Date(),
    },
  ],
  total: 2,
  page: 1,
  limit: 100,
  totalPages: 1,
};

const SAMPLE_FORECAST = {
  totalPipelineValue: 62000,
  weightedValue: 48200,
  totalOpportunities: 2,
  winRate: 45,
  forecastAccuracy: { accuracy: 87, target: 85, isAtRisk: false },
  stageBreakdown: [
    { stage: 'PROPOSAL', totalValue: 50000, percentage: 80.6 },
    { stage: 'NEGOTIATION', totalValue: 12000, percentage: 19.4 },
  ],
  monthlyRevenue: [
    { month: 'Jan', actual: 40000, projected: null },
    { month: 'Feb', actual: 55000, projected: null },
  ],
  winRateTrend: [
    { month: 'Jan', rate: 40, isProjected: false },
    { month: 'Feb', rate: 45, isProjected: false },
  ],
  deals: [],
};

// ============================================================================
// fetchDeals
// ============================================================================

describe('fetchDeals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      opportunity: {
        list: mockOpportunityList,
        forecast: mockOpportunityForecast,
      },
    });
  });

  it('calls cacheLife with LIST_PAGE ("minutes") profile', async () => {
    mockOpportunityList.mockResolvedValue(SAMPLE_DEALS_PAGE);

    await fetchDeals('tok', null);

    expect(mockCacheLife).toHaveBeenCalledWith('minutes');
  });

  it('always tags with DEALS_LIST ("deals:list")', async () => {
    mockOpportunityList.mockResolvedValue(SAMPLE_DEALS_PAGE);

    await fetchDeals('tok', null);

    expect(mockCacheTag).toHaveBeenCalledWith('deals:list');
  });

  it('adds per-user tag when userId is provided', async () => {
    mockOpportunityList.mockResolvedValue(SAMPLE_DEALS_PAGE);

    await fetchDeals('tok', 'user-abc');

    expect(mockCacheTag).toHaveBeenCalledWith('user:user-abc');
  });

  it('does NOT add per-user tag when userId is null', async () => {
    mockOpportunityList.mockResolvedValue(SAMPLE_DEALS_PAGE);

    await fetchDeals('tok', null);

    // cacheTag called exactly once (for DEALS_LIST only)
    expect(mockCacheTag).toHaveBeenCalledTimes(1);
    expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
  });

  it('calls opportunity.list with default args (limit 100, page 1, sorted by createdAt desc)', async () => {
    mockOpportunityList.mockResolvedValue(SAMPLE_DEALS_PAGE);

    await fetchDeals('tok', 'uid-1');

    expect(mockOpportunityList).toHaveBeenCalledWith({
      limit: 100,
      page: 1,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('passes through custom limit and page arguments', async () => {
    mockOpportunityList.mockResolvedValue(SAMPLE_DEALS_PAGE);

    await fetchDeals('tok', 'uid-1', 20, 2);

    expect(mockOpportunityList).toHaveBeenCalledWith({
      limit: 20,
      page: 2,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('returns the result from caller.opportunity.list unchanged', async () => {
    mockOpportunityList.mockResolvedValue(SAMPLE_DEALS_PAGE);

    const result = await fetchDeals('tok', 'uid-1');

    expect(result).toEqual(SAMPLE_DEALS_PAGE);
  });

  it('works with a null token (unauthenticated path)', async () => {
    mockOpportunityList.mockResolvedValue(SAMPLE_DEALS_PAGE);

    await fetchDeals(null, null);

    expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
  });

  it('creates caller from the provided token', async () => {
    mockOpportunityList.mockResolvedValue(SAMPLE_DEALS_PAGE);

    await fetchDeals('my-jwt-token', 'uid-1');

    expect(mockCreateCallerFromToken).toHaveBeenCalledWith('my-jwt-token');
  });
});

// ============================================================================
// fetchDealForecast
// ============================================================================

describe('fetchDealForecast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      opportunity: {
        list: mockOpportunityList,
        forecast: mockOpportunityForecast,
      },
    });
  });

  it('calls cacheLife with DASHBOARD_STATS ("minutes") profile', async () => {
    mockOpportunityForecast.mockResolvedValue(SAMPLE_FORECAST);

    await fetchDealForecast('tok', null);

    expect(mockCacheLife).toHaveBeenCalledWith('minutes');
  });

  it('always tags with DEALS_FORECAST ("deals:forecast")', async () => {
    mockOpportunityForecast.mockResolvedValue(SAMPLE_FORECAST);

    await fetchDealForecast('tok', null);

    expect(mockCacheTag).toHaveBeenCalledWith('deals:forecast');
  });

  it('adds per-user tag when userId is provided', async () => {
    mockOpportunityForecast.mockResolvedValue(SAMPLE_FORECAST);

    await fetchDealForecast('tok', 'user-xyz');

    expect(mockCacheTag).toHaveBeenCalledWith('user:user-xyz');
  });

  it('does NOT add per-user tag when userId is null', async () => {
    mockOpportunityForecast.mockResolvedValue(SAMPLE_FORECAST);

    await fetchDealForecast('tok', null);

    // cacheTag called exactly once (for DEALS_FORECAST only)
    expect(mockCacheTag).toHaveBeenCalledTimes(1);
    expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
  });

  it('calls opportunity.forecast with no arguments', async () => {
    mockOpportunityForecast.mockResolvedValue(SAMPLE_FORECAST);

    await fetchDealForecast('tok', 'uid-1');

    expect(mockOpportunityForecast).toHaveBeenCalledWith();
  });

  it('returns the result from caller.opportunity.forecast unchanged', async () => {
    mockOpportunityForecast.mockResolvedValue(SAMPLE_FORECAST);

    const result = await fetchDealForecast('tok', 'uid-1');

    expect(result).toEqual(SAMPLE_FORECAST);
  });

  it('works with a null token (unauthenticated path)', async () => {
    mockOpportunityForecast.mockResolvedValue(SAMPLE_FORECAST);

    await fetchDealForecast(null, null);

    expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
  });

  it('creates caller from the provided token', async () => {
    mockOpportunityForecast.mockResolvedValue(SAMPLE_FORECAST);

    await fetchDealForecast('bearer-token-123', 'uid-2');

    expect(mockCreateCallerFromToken).toHaveBeenCalledWith('bearer-token-123');
  });
});
