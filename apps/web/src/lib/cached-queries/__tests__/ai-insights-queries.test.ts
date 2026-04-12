/**
 * Tests for ai-insights-queries.ts
 *
 * Verifies that fetchAIInsights:
 * - Calls cacheLife with the DASHBOARD_STATS ("minutes") profile
 * - Calls cacheTag with HOME_AI_INSIGHTS + user tag when userId provided
 * - Calls cacheTag with HOME_AI_INSIGHTS only when userId is null
 * - Delegates to caller.home.getAIInsights()
 * - Returns the tRPC response unchanged
 * - Works with a null token (unauthenticated path)
 * - Creates the caller from the provided token
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
const mockGetAIInsights = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchAIInsights } from '../ai-insights-queries';

const MOCK_INSIGHTS_RESPONSE = {
  insights: [
    {
      id: 'insight-1',
      type: 'DEAL_AT_RISK',
      title: 'Deal at risk',
      description: 'This deal has been inactive for 30 days.',
      priority: 'HIGH',
      entityId: 'deal-1',
      entityType: 'DEAL',
    },
  ],
  lastRefreshed: new Date('2026-04-12T00:00:00.000Z'),
};

describe('ai-insights-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      home: { getAIInsights: mockGetAIInsights },
    });
  });

  describe('fetchAIInsights', () => {
    it('calls cacheLife with DASHBOARD_STATS ("minutes") profile', async () => {
      mockGetAIInsights.mockResolvedValue(MOCK_INSIGHTS_RESPONSE);

      await fetchAIInsights('tok', null);

      expect(mockCacheLife).toHaveBeenCalledWith('minutes');
    });

    it('always tags with HOME_AI_INSIGHTS', async () => {
      mockGetAIInsights.mockResolvedValue(MOCK_INSIGHTS_RESPONSE);

      await fetchAIInsights('tok', null);

      expect(mockCacheTag).toHaveBeenCalledWith('home:ai-insights');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockGetAIInsights.mockResolvedValue(MOCK_INSIGHTS_RESPONSE);

      await fetchAIInsights('tok', 'user-abc');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-abc');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockGetAIInsights.mockResolvedValue(MOCK_INSIGHTS_RESPONSE);

      await fetchAIInsights('tok', null);

      // cacheTag should only be called once (for HOME_AI_INSIGHTS)
      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('creates caller from the provided token', async () => {
      mockGetAIInsights.mockResolvedValue(MOCK_INSIGHTS_RESPONSE);

      await fetchAIInsights('my-jwt-token', 'uid-1');

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith('my-jwt-token');
    });

    it('returns the result from caller.home.getAIInsights', async () => {
      mockGetAIInsights.mockResolvedValue(MOCK_INSIGHTS_RESPONSE);

      const result = await fetchAIInsights('tok', 'uid-1');

      expect(result).toEqual(MOCK_INSIGHTS_RESPONSE);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockGetAIInsights.mockResolvedValue({ insights: [], lastRefreshed: new Date() });

      await fetchAIInsights(null, null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });

    it('passes userId tag as "user:<userId>" format', async () => {
      mockGetAIInsights.mockResolvedValue(MOCK_INSIGHTS_RESPONSE);

      await fetchAIInsights('tok', 'user-xyz-789');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-xyz-789');
    });
  });
});
