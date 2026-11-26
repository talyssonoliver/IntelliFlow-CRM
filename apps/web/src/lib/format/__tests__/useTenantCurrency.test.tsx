// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const useQueryMock = vi.fn<(...args: unknown[]) => { data?: { currency?: unknown } }>();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      reportSettings: {
        get: { useQuery: (...args: unknown[]) => useQueryMock(...args) },
      },
    },
  },
}));

import { useTenantCurrency } from '../useTenantCurrency';

describe('useTenantCurrency', () => {
  it('returns the saved report-settings currency', () => {
    useQueryMock.mockReturnValue({ data: { currency: 'USD' } });
    const { result } = renderHook(() => useTenantCurrency());
    expect(result.current).toBe('USD');
  });

  it('caches the setting for five minutes', () => {
    useQueryMock.mockReturnValue({ data: { currency: 'EUR' } });
    renderHook(() => useTenantCurrency());
    expect(useQueryMock).toHaveBeenCalledWith(undefined, { staleTime: 5 * 60_000 });
  });

  it('is GBP while loading or on error', () => {
    useQueryMock.mockReturnValue({ data: undefined });
    expect(renderHook(() => useTenantCurrency()).result.current).toBe('GBP');
    useQueryMock.mockReturnValue({ data: { currency: '' } });
    expect(renderHook(() => useTenantCurrency()).result.current).toBe('GBP');
  });
});
