/**
 * Tests for activity-feed-queries.ts
 *
 * Verifies that fetchUnifiedFeed:
 * - Calls cacheLife with the REALTIME ("seconds") profile
 * - Calls cacheTag with ACTIVITY_FEED + user tag when userId provided
 * - Calls cacheTag with ACTIVITY_FEED only when userId is null
 * - Delegates to caller.activityFeed.getUnifiedFeed() with the correct args
 * - Returns the tRPC response unchanged
 * - Handles null token (unauthenticated path)
 * - Forwards limit and cursor arguments correctly
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
const mockGetUnifiedFeed = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchUnifiedFeed } from '../activity-feed-queries';

const SAMPLE_FEED = {
  items: [
    {
      id: 'act-1',
      source: 'lead',
      type: 'created',
      title: 'Lead created',
      description: null,
      timestamp: new Date('2026-04-12T10:00:00Z'),
      actor: null,
      entity: null,
      metadata: null,
    },
  ],
  nextCursor: null,
  hasMore: false,
};

describe('activity-feed-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      activityFeed: { getUnifiedFeed: mockGetUnifiedFeed },
    });
  });

  describe('fetchUnifiedFeed', () => {
    it('calls cacheLife with REALTIME ("seconds") profile', async () => {
      mockGetUnifiedFeed.mockResolvedValue(SAMPLE_FEED);

      await fetchUnifiedFeed('tok', null);

      expect(mockCacheLife).toHaveBeenCalledWith('seconds');
    });

    it('always tags with ACTIVITY_FEED ("activity:feed")', async () => {
      mockGetUnifiedFeed.mockResolvedValue(SAMPLE_FEED);

      await fetchUnifiedFeed('tok', null);

      expect(mockCacheTag).toHaveBeenCalledWith('activity:feed');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockGetUnifiedFeed.mockResolvedValue(SAMPLE_FEED);

      await fetchUnifiedFeed('tok', 'user-abc');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-abc');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockGetUnifiedFeed.mockResolvedValue(SAMPLE_FEED);

      await fetchUnifiedFeed('tok', null);

      // cacheTag should only be called once (for ACTIVITY_FEED)
      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('creates caller from the provided token', async () => {
      mockGetUnifiedFeed.mockResolvedValue(SAMPLE_FEED);

      await fetchUnifiedFeed('my-jwt-token', 'uid-1');

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith('my-jwt-token');
    });

    it('returns the result from caller.activityFeed.getUnifiedFeed', async () => {
      mockGetUnifiedFeed.mockResolvedValue(SAMPLE_FEED);

      const result = await fetchUnifiedFeed('tok', 'uid-1');

      expect(result).toEqual(SAMPLE_FEED);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockGetUnifiedFeed.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });

      await fetchUnifiedFeed(null, null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });

    it('forwards limit and cursor arguments to the tRPC procedure', async () => {
      mockGetUnifiedFeed.mockResolvedValue(SAMPLE_FEED);

      await fetchUnifiedFeed('tok', 'uid-1', 50, 'cursor-xyz');

      expect(mockGetUnifiedFeed).toHaveBeenCalledWith({ limit: 50, cursor: 'cursor-xyz' });
    });

    it('uses default limit of 20 when limit is not provided', async () => {
      mockGetUnifiedFeed.mockResolvedValue(SAMPLE_FEED);

      await fetchUnifiedFeed('tok', 'uid-1');

      expect(mockGetUnifiedFeed).toHaveBeenCalledWith({ limit: 20, cursor: undefined });
    });
  });
});
