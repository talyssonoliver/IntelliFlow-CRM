/**
 * Tests for lead-queries.ts
 *
 * Verifies that:
 * fetchLeadStats:
 * - Calls cacheLife with DASHBOARD_STATS ("minutes") profile
 * - Calls cacheTag with LEADS_STATS + DASHBOARD tags
 * - Adds per-user tag when userId is provided
 * - Does NOT add per-user tag when userId is null
 * - Delegates to caller.lead.stats()
 * - Returns the tRPC response unchanged
 * - Works with a null token (unauthenticated path)
 *
 * fetchLeadsFirstPage:
 * - Calls cacheLife with LIST_PAGE ("minutes") profile
 * - Calls cacheTag with LEADS_LIST tag
 * - Adds per-user tag when userId is provided
 * - Does NOT add per-user tag when userId is null
 * - Delegates to caller.lead.list() with correct default args
 * - Returns the tRPC response unchanged
 * - Works with a null token (unauthenticated path)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Stub transitive deps of trpc-server.ts that Vite transform resolves ──────
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

// ── Mock next/cache ──────────────────────────────────────────────────────────
const mockCacheLife = vi.fn();
const mockCacheTag = vi.fn();
vi.mock('next/cache', () => ({
  cacheLife: (...args: unknown[]) => mockCacheLife(...args),
  cacheTag: (...args: unknown[]) => mockCacheTag(...args),
}));

// ── Mock trpc-server ─────────────────────────────────────────────────────────
const mockLeadStats = vi.fn();
const mockLeadList = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchLeadStats, fetchLeadsFirstPage } from '../lead-queries';

const SAMPLE_STATS = {
  total: 42,
  byStatus: { new: 10, qualified: 12, converted: 8, disqualified: 4, in_progress: 8 },
  conversionRate: 0.19,
};

const SAMPLE_LEADS_PAGE = {
  data: [
    { id: 'lead-1', firstName: 'Alice', lastName: 'Smith', status: 'new', createdAt: new Date() },
  ],
  total: 1,
  page: 1,
  limit: 10,
  totalPages: 1,
};

describe('lead-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      lead: { stats: { query: mockLeadStats }, list: { query: mockLeadList } },
    });
  });

  // ── fetchLeadStats ──────────────────────────────────────────────────────────

  describe('fetchLeadStats', () => {
    it('calls cacheLife with DASHBOARD_STATS ("minutes") profile', async () => {
      mockLeadStats.mockResolvedValue(SAMPLE_STATS);

      await fetchLeadStats('tok', null);

      expect(mockCacheLife).toHaveBeenCalledWith('minutes');
    });

    it('always tags with LEADS_STATS ("leads:stats") and DASHBOARD ("dashboard")', async () => {
      mockLeadStats.mockResolvedValue(SAMPLE_STATS);

      await fetchLeadStats('tok', null);

      expect(mockCacheTag).toHaveBeenCalledWith('leads:stats', 'dashboard');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockLeadStats.mockResolvedValue(SAMPLE_STATS);

      await fetchLeadStats('tok', 'user-abc');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-abc');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockLeadStats.mockResolvedValue(SAMPLE_STATS);

      await fetchLeadStats('tok', null);

      // cacheTag called exactly once (for LEADS_STATS + DASHBOARD in one call)
      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('creates caller from the provided token', async () => {
      mockLeadStats.mockResolvedValue(SAMPLE_STATS);

      await fetchLeadStats('my-jwt-token', 'uid-1');

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith('my-jwt-token');
    });

    it('returns the result from caller.lead.stats', async () => {
      mockLeadStats.mockResolvedValue(SAMPLE_STATS);

      const result = await fetchLeadStats('tok', 'uid-1');

      expect(result).toEqual(SAMPLE_STATS);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockLeadStats.mockResolvedValue(SAMPLE_STATS);

      await fetchLeadStats(null, null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });
  });

  // ── fetchLeadsFirstPage ─────────────────────────────────────────────────────

  describe('fetchLeadsFirstPage', () => {
    it('calls cacheLife with LIST_PAGE ("minutes") profile', async () => {
      mockLeadList.mockResolvedValue(SAMPLE_LEADS_PAGE);

      await fetchLeadsFirstPage('tok', null);

      expect(mockCacheLife).toHaveBeenCalledWith('minutes');
    });

    it('always tags with LEADS_LIST ("leads:list")', async () => {
      mockLeadList.mockResolvedValue(SAMPLE_LEADS_PAGE);

      await fetchLeadsFirstPage('tok', null);

      expect(mockCacheTag).toHaveBeenCalledWith('leads:list');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockLeadList.mockResolvedValue(SAMPLE_LEADS_PAGE);

      await fetchLeadsFirstPage('tok', 'user-xyz');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-xyz');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockLeadList.mockResolvedValue(SAMPLE_LEADS_PAGE);

      await fetchLeadsFirstPage('tok', null);

      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('calls lead.list with page 1, limit 10, sorted by createdAt desc', async () => {
      mockLeadList.mockResolvedValue(SAMPLE_LEADS_PAGE);

      await fetchLeadsFirstPage('tok', 'uid-1');

      expect(mockLeadList).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
    });

    it('returns the result from caller.lead.list', async () => {
      mockLeadList.mockResolvedValue(SAMPLE_LEADS_PAGE);

      const result = await fetchLeadsFirstPage('tok', 'uid-1');

      expect(result).toEqual(SAMPLE_LEADS_PAGE);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockLeadList.mockResolvedValue(SAMPLE_LEADS_PAGE);

      await fetchLeadsFirstPage(null, null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });
  });
});
