/**
 * Runs the real session cleanup, unlike useLogout.test.tsx, because what matters here
 * is the cookie itself. The server renders the logged-in portal from it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLogout } from '../useLogout';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('@/lib/shared/session-cleanup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/shared/session-cleanup')>()),
  leaveAfterLogout: replace,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      logout: {
        useMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({ success: true }) }),
      },
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('useLogout, with the real cleanup', () => {
  afterEach(() => {
    document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    localStorage.clear();
  });

  it('leaves no token behind in the cookie or in storage', async () => {
    document.cookie = 'accessToken=a-token; path=/';
    localStorage.setItem('accessToken', 'a-token');
    localStorage.setItem('refreshToken', 'a-refresh-token');
    localStorage.setItem('sb-project-auth-token', 'a-session');
    const { result } = renderHook(() => useLogout(), { wrapper });

    await act(async () => {
      await result.current.logout();
    });

    expect(document.cookie).not.toContain('accessToken');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('sb-project-auth-token')).toBeNull();
    expect(replace).toHaveBeenCalledWith('/');
  });
});
