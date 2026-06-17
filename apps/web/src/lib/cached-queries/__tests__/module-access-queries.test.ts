/**
 * Tests for module-access-queries.ts
 *
 * Verifies that fetchEnabledModules:
 * - Calls cacheLife with the RECORD_DETAIL ("hours") profile
 * - Calls cacheTag with MODULE_ACCESS + user tag when userId provided
 * - Calls cacheTag with MODULE_ACCESS only when userId is null
 * - Delegates to caller.moduleAccess.getEnabledModules()
 * - Returns the tRPC response unchanged
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Stub transitive deps of trpc-server.ts that Vite transform resolves ──────
// Vite's import-analysis plugin resolves imports at transform time, before
// vi.mock hoisting runs. Stub these so the transform doesn't fail.
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

// ── Mock next/cache ──────────────────────────────────────────────────────────
const mockCacheLife = vi.fn();
const mockCacheTag = vi.fn();
vi.mock('next/cache', () => ({
  cacheLife: (...args: unknown[]) => mockCacheLife(...args),
  cacheTag: (...args: unknown[]) => mockCacheTag(...args),
}));

// ── Mock trpc-server ─────────────────────────────────────────────────────────
const mockGetEnabledModules = vi.fn();
const mockCreateCallerFromToken = vi.fn();
vi.mock('@/lib/trpc-server', () => ({
  createCallerFromToken: (...args: unknown[]) => mockCreateCallerFromToken(...args),
}));

import { fetchEnabledModules } from '../module-access-queries';

describe('module-access-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCallerFromToken.mockResolvedValue({
      moduleAccess: { getEnabledModules: { query: mockGetEnabledModules } },
    });
  });

  describe('fetchEnabledModules', () => {
    it('calls cacheLife with RECORD_DETAIL ("hours") profile', async () => {
      mockGetEnabledModules.mockResolvedValue({ modules: ['CORE_CRM'], plan: 'STARTER' });

      await fetchEnabledModules('tok', null);

      expect(mockCacheLife).toHaveBeenCalledWith('hours');
    });

    it('always tags with MODULE_ACCESS', async () => {
      mockGetEnabledModules.mockResolvedValue({ modules: ['CORE_CRM'], plan: 'STARTER' });

      await fetchEnabledModules('tok', null);

      expect(mockCacheTag).toHaveBeenCalledWith('module:access');
    });

    it('adds per-user tag when userId is provided', async () => {
      mockGetEnabledModules.mockResolvedValue({ modules: ['CORE_CRM', 'AI_TOOLS'], plan: 'PRO' });

      await fetchEnabledModules('tok', 'user-xyz');

      expect(mockCacheTag).toHaveBeenCalledWith('user:user-xyz');
    });

    it('does NOT add per-user tag when userId is null', async () => {
      mockGetEnabledModules.mockResolvedValue({ modules: ['CORE_CRM'], plan: 'STARTER' });

      await fetchEnabledModules('tok', null);

      // cacheTag should only be called once (for MODULE_ACCESS)
      expect(mockCacheTag).toHaveBeenCalledTimes(1);
      expect(mockCacheTag).not.toHaveBeenCalledWith(expect.stringContaining('user:'));
    });

    it('creates caller from the provided token', async () => {
      mockGetEnabledModules.mockResolvedValue({ modules: ['CORE_CRM'], plan: 'STARTER' });

      await fetchEnabledModules('my-jwt-token', 'uid-1');

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith('my-jwt-token');
    });

    it('returns the result from caller.moduleAccess.getEnabledModules', async () => {
      const expected = {
        modules: ['CORE_CRM', 'LEGAL', 'AI_TOOLS'],
        plan: 'ENTERPRISE',
        status: 'active',
      };
      mockGetEnabledModules.mockResolvedValue(expected);

      const result = await fetchEnabledModules('tok', 'uid-1');

      expect(result).toEqual(expected);
    });

    it('works with a null token (unauthenticated path)', async () => {
      mockGetEnabledModules.mockResolvedValue({ modules: ['CORE_CRM'], plan: 'STARTER' });

      await fetchEnabledModules(null, null);

      expect(mockCreateCallerFromToken).toHaveBeenCalledWith(null);
    });
  });
});
