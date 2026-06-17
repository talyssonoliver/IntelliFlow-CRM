/**
 * Tests for account-queries.ts
 *
 * Verifies that:
 * fetchAccountStats:
 * - Calls cacheLife with DASHBOARD_STATS ("minutes") profile
 * - Calls cacheTag with ACCOUNTS_STATS ("accounts:stats") and DASHBOARD ("dashboard") tags
 * - Adds per-user tag when userId is provided
 * - Does NOT add per-user tag when userId is null/undefined
 * - Delegates to caller.account.stats.query()
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
const mockAccountStats = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchAccountStats } from '../account-queries';

const SAMPLE_ACCOUNT_STATS = {
  total: 25,
  active: 20,
  inactive: 5,
  newThisMonth: 3,
};

describe('account-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      account: { stats: { query: mockAccountStats } },
    });
  });

  // ── fetchAccountStats ─────────────────────────────────────────────────────

  describe('fetchAccountStats', () => {
    it('calls cacheLife with DASHBOARD_STATS ("minutes") profile', async () => {
      mockAccountStats.mockResolvedValue(SAMPLE_ACCOUNT_STATS);

      await fetchAccountStats('tok', null);

      expect(mockCacheLife).toHaveBeenCalledWith('minutes');
    });

    it('always tags with ACCOUNTS_STATS ("accounts:stats") and DASHBOARD ("dashboard")', async () => {
      mockAccountStats.mockResolvedValue(SAMPLE_ACCOUNT_STATS);

      await fetchAccountStats('tok', null);

      expect(mockCacheTag).toHaveBeenCalledWith('accounts:stats', 'dashboard');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockAccountStats.mockResolvedValue(SAMPLE_ACCOUNT_STATS);

      await fetchAccountStats('tok', 'user-abc');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-abc');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockAccountStats.mockResolvedValue(SAMPLE_ACCOUNT_STATS);

      await fetchAccountStats('tok', null);

      // cacheTag called exactly once (ACCOUNTS_STATS + DASHBOARD in one call)
      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('does NOT add per-user tag when userId is undefined', async () => {
      mockAccountStats.mockResolvedValue(SAMPLE_ACCOUNT_STATS);

      await fetchAccountStats('tok');

      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('creates caller from the provided token', async () => {
      mockAccountStats.mockResolvedValue(SAMPLE_ACCOUNT_STATS);

      await fetchAccountStats('my-jwt-token', 'uid-1');

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith('my-jwt-token');
    });

    it('delegates to caller.account.stats.query()', async () => {
      mockAccountStats.mockResolvedValue(SAMPLE_ACCOUNT_STATS);

      await fetchAccountStats('tok', 'uid-1');

      expect(mockAccountStats).toHaveBeenCalledOnce();
    });

    it('returns the result from caller.account.stats unchanged', async () => {
      mockAccountStats.mockResolvedValue(SAMPLE_ACCOUNT_STATS);

      const result = await fetchAccountStats('tok', 'uid-1');

      expect(result).toEqual(SAMPLE_ACCOUNT_STATS);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockAccountStats.mockResolvedValue(SAMPLE_ACCOUNT_STATS);

      await fetchAccountStats(null, null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });
  });
});
