/**
 * Tests for notifications-queries.ts
 *
 * Verifies that fetchUnreadCount:
 * - Calls cacheLife with the REALTIME profile
 * - Calls cacheTag with NOTIFICATIONS_UNREAD + user tag when userId provided
 * - Calls cacheTag with NOTIFICATIONS_UNREAD only when userId is null
 * - Delegates to caller.notifications.getUnreadCount()
 * - Returns the tRPC response unchanged
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Stub transitive deps of trpc-server.ts that Vite transform resolves ──────
// Vite's import-analysis plugin resolves imports at transform time, before
// vi.mock hoisting runs. Stub these so the transform doesn't fail.
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
const mockGetUnreadCount = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchUnreadCount } from '../notifications-queries';

describe('notifications-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      notifications: { getUnreadCount: mockGetUnreadCount },
    });
  });

  describe('fetchUnreadCount', () => {
    it('calls cacheLife with REALTIME ("seconds") profile', async () => {
      mockGetUnreadCount.mockResolvedValue({ total: 0, byPriority: { high: 0, normal: 0, low: 0 } });

      await fetchUnreadCount('tok', null);

      expect(mockCacheLife).toHaveBeenCalledWith('seconds');
    });

    it('always tags with NOTIFICATIONS_UNREAD', async () => {
      mockGetUnreadCount.mockResolvedValue({ total: 3, byPriority: { high: 1, normal: 2, low: 0 } });

      await fetchUnreadCount('tok', null);

      expect(mockCacheTag).toHaveBeenCalledWith('notifications:unread');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockGetUnreadCount.mockResolvedValue({ total: 5, byPriority: { high: 2, normal: 2, low: 1 } });

      await fetchUnreadCount('tok', 'user-abc');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-abc');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockGetUnreadCount.mockResolvedValue({ total: 0, byPriority: { high: 0, normal: 0, low: 0 } });

      await fetchUnreadCount('tok', null);

      // cacheTag should only be called once (for NOTIFICATIONS_UNREAD)
      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('creates caller from the provided token', async () => {
      mockGetUnreadCount.mockResolvedValue({ total: 2, byPriority: { high: 0, normal: 2, low: 0 } });

      await fetchUnreadCount('my-jwt-token', 'uid-1');

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith('my-jwt-token');
    });

    it('returns the result from caller.notifications.getUnreadCount', async () => {
      const expected = { total: 7, byPriority: { high: 3, normal: 3, low: 1 } };
      mockGetUnreadCount.mockResolvedValue(expected);

      const result = await fetchUnreadCount('tok', 'uid-1');

      expect(result).toEqual(expected);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockGetUnreadCount.mockResolvedValue({ total: 0, byPriority: { high: 0, normal: 0, low: 0 } });

      await fetchUnreadCount(null, null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });
  });
});
