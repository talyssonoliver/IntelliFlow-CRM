// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseAuth = vi.fn();
const mockGetEnabledModules = vi.fn();

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    moduleAccess: {
      getEnabledModules: {
        useQuery: (...args: unknown[]) => (mockGetEnabledModules as (...params: unknown[]) => unknown)(...args),
      },
    },
  },
}));

const { useEnabledModules } = await import('../useEnabledModules');

describe('useEnabledModules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });
    mockGetEnabledModules.mockReturnValue({
      data: { modules: ['CORE_CRM'], plan: 'starter' },
      isLoading: false,
      isError: false,
    });
  });

  it('disables the query while auth is unresolved', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    const { result } = renderHook(() => useEnabledModules());

    expect(mockGetEnabledModules).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        enabled: false,
      })
    );
    expect(result.current.isLoading).toBe(true);
  });

  it('disables the query for unauthenticated users', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    const { result } = renderHook(() => useEnabledModules());

    expect(mockGetEnabledModules).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        enabled: false,
      })
    );
    expect(result.current.isError).toBe(false);
  });

  it('enables the query for authenticated users', () => {
    renderHook(() => useEnabledModules());

    expect(mockGetEnabledModules).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        enabled: true,
      })
    );
  });
});
