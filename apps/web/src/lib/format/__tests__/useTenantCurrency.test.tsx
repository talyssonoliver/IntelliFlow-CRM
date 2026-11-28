// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const useQueryMock = vi.fn<
  (...args: unknown[]) => {
    data?: { currency?: unknown };
    isSuccess?: boolean;
    isError?: boolean;
    refetch?: () => void;
  }
>();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    analytics: {
      reportSettings: {
        currency: { useQuery: (...args: unknown[]) => useQueryMock(...args) },
      },
    },
  },
}));

import { useTenantCurrency, useTenantCurrencyForSave } from '../useTenantCurrency';

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

// Codex review 26/11: a create form must not save the GBP placeholder.
describe('useTenantCurrencyForSave', () => {
  it('is not ready while the setting loads', () => {
    useQueryMock.mockReturnValue({ data: undefined, isSuccess: false, isError: false });
    const { result } = renderHook(() => useTenantCurrencyForSave());
    expect(result.current.ready).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it('is ready with the saved currency once loaded', () => {
    useQueryMock.mockReturnValue({ data: { currency: 'EUR' }, isSuccess: true });
    const { result } = renderHook(() => useTenantCurrencyForSave());
    expect(result.current).toMatchObject({ currency: 'EUR', ready: true, failed: false });
  });

  it('says when the setting failed, and retries', () => {
    const refetch = vi.fn();
    useQueryMock.mockReturnValue({ data: undefined, isSuccess: false, isError: true, refetch });
    const { result } = renderHook(() => useTenantCurrencyForSave());
    expect(result.current.ready).toBe(false);
    expect(result.current.failed).toBe(true);
    result.current.retry();
    expect(refetch).toHaveBeenCalled();
  });
});
