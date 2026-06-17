/**
 * Tests for contact-queries.ts
 *
 * Verifies that:
 * fetchContactStats:
 * - Calls cacheLife with DASHBOARD_STATS ("minutes") profile
 * - Calls cacheTag with CONTACTS_STATS + DASHBOARD tags
 * - Adds per-user tag when userId is provided
 * - Does NOT add per-user tag when userId is null
 * - Delegates to caller.contact.stats()
 * - Returns the tRPC response unchanged
 * - Works with a null token (unauthenticated path)
 *
 * fetchContactsFirstPage:
 * - Calls cacheLife with LIST_PAGE ("minutes") profile
 * - Calls cacheTag with CONTACTS_LIST tag
 * - Adds per-user tag when userId is provided
 * - Does NOT add per-user tag when userId is null
 * - Delegates to caller.contact.list() with correct default args
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
const mockContactStats = vi.fn();
const mockContactList = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchContactStats, fetchContactsFirstPage } from '../contact-queries';

const SAMPLE_STATS = {
  total: 128,
  byStatus: { active: 80, inactive: 30, prospect: 18 },
  recentlyAdded: 5,
};

const SAMPLE_CONTACTS_PAGE = {
  data: [
    { id: 'con-1', firstName: 'Bob', lastName: 'Jones', status: 'active', createdAt: new Date() },
  ],
  total: 1,
  page: 1,
  limit: 10,
  totalPages: 1,
};

describe('contact-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      contact: { stats: { query: mockContactStats }, list: { query: mockContactList } },
    });
  });

  // ── fetchContactStats ───────────────────────────────────────────────────────

  describe('fetchContactStats', () => {
    it('calls cacheLife with DASHBOARD_STATS ("minutes") profile', async () => {
      mockContactStats.mockResolvedValue(SAMPLE_STATS);

      await fetchContactStats('tok', null);

      expect(mockCacheLife).toHaveBeenCalledWith('minutes');
    });

    it('always tags with CONTACTS_STATS ("contacts:stats") and DASHBOARD ("dashboard")', async () => {
      mockContactStats.mockResolvedValue(SAMPLE_STATS);

      await fetchContactStats('tok', null);

      expect(mockCacheTag).toHaveBeenCalledWith('contacts:stats', 'dashboard');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockContactStats.mockResolvedValue(SAMPLE_STATS);

      await fetchContactStats('tok', 'user-abc');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-abc');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockContactStats.mockResolvedValue(SAMPLE_STATS);

      await fetchContactStats('tok', null);

      // cacheTag called exactly once (for CONTACTS_STATS + DASHBOARD in one call)
      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('creates caller from the provided token', async () => {
      mockContactStats.mockResolvedValue(SAMPLE_STATS);

      await fetchContactStats('my-jwt-token', 'uid-1');

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith('my-jwt-token');
    });

    it('returns the result from caller.contact.stats', async () => {
      mockContactStats.mockResolvedValue(SAMPLE_STATS);

      const result = await fetchContactStats('tok', 'uid-1');

      expect(result).toEqual(SAMPLE_STATS);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockContactStats.mockResolvedValue(SAMPLE_STATS);

      await fetchContactStats(null, null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });
  });

  // ── fetchContactsFirstPage ──────────────────────────────────────────────────

  describe('fetchContactsFirstPage', () => {
    it('calls cacheLife with LIST_PAGE ("minutes") profile', async () => {
      mockContactList.mockResolvedValue(SAMPLE_CONTACTS_PAGE);

      await fetchContactsFirstPage('tok', null);

      expect(mockCacheLife).toHaveBeenCalledWith('minutes');
    });

    it('always tags with CONTACTS_LIST ("contacts:list")', async () => {
      mockContactList.mockResolvedValue(SAMPLE_CONTACTS_PAGE);

      await fetchContactsFirstPage('tok', null);

      expect(mockCacheTag).toHaveBeenCalledWith('contacts:list');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockContactList.mockResolvedValue(SAMPLE_CONTACTS_PAGE);

      await fetchContactsFirstPage('tok', 'user-xyz');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-xyz');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockContactList.mockResolvedValue(SAMPLE_CONTACTS_PAGE);

      await fetchContactsFirstPage('tok', null);

      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('calls contact.list with page 1, limit 10, sorted by createdAt desc', async () => {
      mockContactList.mockResolvedValue(SAMPLE_CONTACTS_PAGE);

      await fetchContactsFirstPage('tok', 'uid-1');

      expect(mockContactList).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
    });

    it('returns the result from caller.contact.list', async () => {
      mockContactList.mockResolvedValue(SAMPLE_CONTACTS_PAGE);

      const result = await fetchContactsFirstPage('tok', 'uid-1');

      expect(result).toEqual(SAMPLE_CONTACTS_PAGE);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockContactList.mockResolvedValue(SAMPLE_CONTACTS_PAGE);

      await fetchContactsFirstPage(null, null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });
  });
});
