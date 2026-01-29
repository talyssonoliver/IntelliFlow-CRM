/**
 * Tests for useLogout hook
 *
 * @module apps/web/src/hooks/__tests__/useLogout.test.ts
 * IMPLEMENTS: PG-018 (Logout Page) - AC2, AC3, AC6, AC7, AC8
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLogout } from '../useLogout';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock session-cleanup
vi.mock('@/lib/shared/session-cleanup', () => ({
  cleanupSession: vi.fn().mockResolvedValue({ success: true }),
  clearLocalStorage: vi.fn().mockReturnValue([]),
  clearSessionStorage: vi.fn().mockReturnValue([]),
}));

// Mock broadcast - use hoisted variable pattern
vi.mock('@/lib/broadcast', () => {
  const mockBroadcastFn = vi.fn();
  return {
    authBroadcast: {
      broadcast: mockBroadcastFn,
      subscribe: vi.fn().mockReturnValue(() => {}),
    },
    __mockBroadcast: mockBroadcastFn,
  };
});

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useLogout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: true });

    // Mock localStorage
    const storage: Record<string, string> = {
      accessToken: 'test-token',
      refreshToken: 'test-refresh',
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => storage[key] || null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      storage[key] = value;
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => {
      delete storage[key];
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('successful logout', () => {
    it('should clear all auth tokens from localStorage', async () => {
      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.logout();
        vi.advanceTimersByTime(100);
      });

      const { cleanupSession } = await import('@/lib/shared/session-cleanup');
      expect(cleanupSession).toHaveBeenCalled();
    });

    it('should clear React Query cache', async () => {
      const queryClient = new QueryClient();
      const clearSpy = vi.spyOn(queryClient, 'clear');

      function Wrapper({ children }: { children: ReactNode }) {
        return (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        );
      }

      const { result } = renderHook(() => useLogout(), { wrapper: Wrapper });

      await act(async () => {
        await result.current.logout();
        vi.advanceTimersByTime(100);
      });

      expect(clearSpy).toHaveBeenCalled();
    });

    it('should broadcast logout to other tabs', async () => {
      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.logout();
        vi.advanceTimersByTime(100);
      });

      const { authBroadcast } = await import('@/lib/broadcast');
      expect(authBroadcast.broadcast).toHaveBeenCalledWith('LOGOUT_EVENT');
    });

    it('should attempt server notification', async () => {
      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.logout();
        vi.advanceTimersByTime(100);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', {
        method: 'POST',
      });
    });

    it('should redirect to /login after completion', async () => {
      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.logout();
        vi.advanceTimersByTime(100);
      });

      expect(mockPush).toHaveBeenCalledWith('/login?logged_out=true');
    });
  });

  describe('state management', () => {
    it('should set isLoggingOut=true during logout', async () => {
      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoggingOut).toBe(false);

      let logoutPromise: Promise<void>;
      act(() => {
        logoutPromise = result.current.logout();
      });

      expect(result.current.isLoggingOut).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(100);
        await logoutPromise;
      });
    });

    it('should set isLoggingOut=false after completion', async () => {
      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.logout();
        vi.advanceTimersByTime(100);
      });

      expect(result.current.isLoggingOut).toBe(false);
    });

    it('should set error when logout fails', async () => {
      const { cleanupSession } = await import('@/lib/shared/session-cleanup');
      vi.mocked(cleanupSession).mockRejectedValueOnce(new Error('Cleanup failed'));

      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.logout();
        vi.advanceTimersByTime(100);
      });

      expect(result.current.error).toBeTruthy();
    });
  });
});
