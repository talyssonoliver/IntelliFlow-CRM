import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const auth = { isAuthenticated: true, isLoading: false };
const useQuery = vi.fn();

vi.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/trpc', () => ({
  trpc: { accountTiers: { get: { useQuery: (...args: unknown[]) => useQuery(...args) } } },
}));

import {
  UNKNOWN_TIER_VIEW,
  buildAccountTiersResult,
  toRevenueNumber,
  toTierViews,
  useAccountTiers,
} from '../useAccountTiers';

const customData = {
  tiers: [
    { key: 'BASE', label: 'Base', minRevenue: 0, colorToken: 'slate', benefits: [] },
    { key: 'GOLD', label: 'Gold', minRevenue: 500, colorToken: 'amber', benefits: ['CSM'] },
  ],
  defaultTierKey: 'BASE',
  canManage: true,
};

describe('useAccountTiers (PG-196)', () => {
  beforeEach(() => {
    auth.isAuthenticated = true;
    auth.isLoading = false;
    useQuery.mockReset().mockReturnValue({ data: undefined, isLoading: true, isError: false });
  });

  it('waits for authentication before querying', () => {
    auth.isLoading = true;
    renderHook(() => useAccountTiers());
    expect(useQuery).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: false }));
  });

  it('queries once authenticated with a long stale time', () => {
    renderHook(() => useAccountTiers());
    expect(useQuery).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: true, staleTime: 300_000 })
    );
  });

  it('resolves through the default tiers while loading, without exposing them as tenant tiers', () => {
    const { result } = renderHook(() => useAccountTiers());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.tiers).toBeNull();
    expect(result.current.resolveTier(20_000_000).label).toBe('Enterprise');
    expect(result.current.resolveTier(null)).toBe(UNKNOWN_TIER_VIEW);
    expect(result.current.canManage).toBe(false);
  });

  it('falls back to defaults on error', () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { result } = renderHook(() => useAccountTiers());
    expect(result.current.isError).toBe(true);
    expect(result.current.resolveTier('150000').label).toBe('SMB');
  });

  it('uses the tenant configuration once loaded', () => {
    useQuery.mockReturnValue({ data: customData, isLoading: false, isError: false });
    const { result } = renderHook(() => useAccountTiers());
    expect(result.current.tiers?.map((t) => t.key)).toEqual(['GOLD', 'BASE']);
    expect(result.current.resolveTier(600).label).toBe('Gold');
    expect(result.current.resolveTier(600).benefits).toEqual(['CSM']);
    expect(result.current.resolveTier(null).label).toBe('Base');
    expect(result.current.tierByKey('NOPE')).toBe(UNKNOWN_TIER_VIEW);
    expect(result.current.canManage).toBe(true);
  });

  it('returns the same result object while the data is unchanged', () => {
    useQuery.mockReturnValue({ data: customData, isLoading: false, isError: false });
    const { result, rerender } = renderHook(() => useAccountTiers());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('tier helpers', () => {
  it('orders views highest first with slugs and colours', () => {
    const views = toTierViews({ tiers: customData.tiers, defaultTierKey: null });
    expect(views.map((v) => [v.key, v.slug, v.colors.dot])).toEqual([
      ['GOLD', 'gold', 'bg-amber-500'],
      ['BASE', 'base', 'bg-slate-500'],
    ]);
  });

  it.each([
    [null, null],
    [undefined, null],
    ['', null],
    ['abc', null],
    ['1000.50', 1000.5],
    [42, 42],
  ])('toRevenueNumber(%s) is %s', (input, expected) => {
    expect(toRevenueNumber(input as never)).toBe(expected);
  });

  it('buildAccountTiersResult reports loading and error state', () => {
    const result = buildAccountTiersResult(undefined, { isLoading: false, isError: true });
    expect(result.isError).toBe(true);
    expect(result.config.tiers).toHaveLength(4);
  });
});
