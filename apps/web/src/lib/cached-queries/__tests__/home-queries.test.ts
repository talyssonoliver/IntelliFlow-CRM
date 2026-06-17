/**
 * Tests for home-queries.ts
 *
 * Verifies that:
 * fetchWelcomeSummary:
 * - Calls cacheLife with DASHBOARD_STATS ("minutes") profile
 * - Calls cacheTag with DASHBOARD ("dashboard") tag
 * - Adds per-user tag when userId is provided
 * - Does NOT add per-user tag when userId is null/undefined
 * - Delegates to caller.home.getWelcomeSummary.query()
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
const mockGetWelcomeSummary = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchWelcomeSummary } from '../home-queries';

const SAMPLE_WELCOME_SUMMARY = {
  userName: 'Alice',
  greeting: 'Good morning, Alice!',
  unreadNotifications: 3,
};

describe('home-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      home: { getWelcomeSummary: { query: mockGetWelcomeSummary } },
    });
  });

  // ── fetchWelcomeSummary ───────────────────────────────────────────────────

  describe('fetchWelcomeSummary', () => {
    it('calls cacheLife with DASHBOARD_STATS ("minutes") profile', async () => {
      mockGetWelcomeSummary.mockResolvedValue(SAMPLE_WELCOME_SUMMARY);

      await fetchWelcomeSummary('tok', null);

      expect(mockCacheLife).toHaveBeenCalledWith('minutes');
    });

    it('always tags with DASHBOARD ("dashboard")', async () => {
      mockGetWelcomeSummary.mockResolvedValue(SAMPLE_WELCOME_SUMMARY);

      await fetchWelcomeSummary('tok', null);

      expect(mockCacheTag).toHaveBeenCalledWith('dashboard');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockGetWelcomeSummary.mockResolvedValue(SAMPLE_WELCOME_SUMMARY);

      await fetchWelcomeSummary('tok', 'user-abc');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-abc');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockGetWelcomeSummary.mockResolvedValue(SAMPLE_WELCOME_SUMMARY);

      await fetchWelcomeSummary('tok', null);

      // cacheTag called exactly once (for DASHBOARD in one call)
      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('does NOT add per-user tag when userId is undefined', async () => {
      mockGetWelcomeSummary.mockResolvedValue(SAMPLE_WELCOME_SUMMARY);

      await fetchWelcomeSummary('tok');

      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('creates caller from the provided token', async () => {
      mockGetWelcomeSummary.mockResolvedValue(SAMPLE_WELCOME_SUMMARY);

      await fetchWelcomeSummary('my-jwt-token', 'uid-1');

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith('my-jwt-token');
    });

    it('delegates to caller.home.getWelcomeSummary.query()', async () => {
      mockGetWelcomeSummary.mockResolvedValue(SAMPLE_WELCOME_SUMMARY);

      await fetchWelcomeSummary('tok', 'uid-1');

      expect(mockGetWelcomeSummary).toHaveBeenCalledOnce();
    });

    it('returns the result from caller.home.getWelcomeSummary unchanged', async () => {
      mockGetWelcomeSummary.mockResolvedValue(SAMPLE_WELCOME_SUMMARY);

      const result = await fetchWelcomeSummary('tok', 'uid-1');

      expect(result).toEqual(SAMPLE_WELCOME_SUMMARY);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockGetWelcomeSummary.mockResolvedValue(SAMPLE_WELCOME_SUMMARY);

      await fetchWelcomeSummary(null, null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });
  });
});
