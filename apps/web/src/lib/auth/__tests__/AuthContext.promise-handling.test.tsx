/**
 * @vitest-environment happy-dom
 *
 * AuthContext: the background promises (auth-status invalidation, scheduled Supabase session
 * refresh) must report their failures instead of floating.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import React from 'react';
import { AUTH_TOKEN_CHANGED_EVENT } from '@/lib/shared/session-cleanup';

const h = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  refreshSession: vi.fn(),
  authStateCallback: null as null | ((event: string, session: unknown) => Promise<void>),
}));

// vitest.setup.ts replaces AuthContext globally; this file tests the real one.
vi.unmock('@/lib/auth/AuthContext');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: h.invalidateQueries,
    removeQueries: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock('../../trpc', () => ({
  trpc: {
    auth: {
      login: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      logout: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      verifyMfa: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      refreshSession: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      getStatus: { useQuery: () => ({ data: undefined, isLoading: false, error: null }) },
    },
  },
}));
vi.mock('../../supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => Promise<void>) => {
        h.authStateCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      refreshSession: h.refreshSession,
      setSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  }),
}));
vi.mock('@/lib/shared/token-exchange', () => ({
  storeSessionTokens: vi.fn(),
  clearSessionTokens: vi.fn(),
}));

import { AuthProvider } from '../AuthContext';

function jwtExpiringIn(ms: number): string {
  const payload = btoa(JSON.stringify({ sub: 'u1', exp: Math.floor((Date.now() + ms) / 1000) }));
  return `h.${payload}.s`;
}

function mountProvider() {
  return render(
    <AuthProvider>
      <div />
    </AuthProvider>
  );
}

describe('AuthProvider background promise handling', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    h.invalidateQueries.mockReset().mockResolvedValue(undefined);
    h.refreshSession.mockReset();
    h.authStateCallback = null;
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('logs when re-validating the auth status after a token change fails', async () => {
    const failure = new Error('network down');
    h.invalidateQueries.mockRejectedValue(failure);
    mountProvider();

    await act(async () => {
      globalThis.dispatchEvent(new Event(AUTH_TOKEN_CHANGED_EVENT));
    });

    expect(errorSpy).toHaveBeenCalledWith('[AuthContext] Failed to refresh auth status:', failure);
  });

  it('stays quiet when re-validating the auth status succeeds', async () => {
    mountProvider();

    await act(async () => {
      globalThis.dispatchEvent(new Event(AUTH_TOKEN_CHANGED_EVENT));
    });

    expect(h.invalidateQueries).toHaveBeenCalledWith({ queryKey: [['auth', 'getStatus']] });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('waits for the auth-status refresh after Supabase rotates the token', async () => {
    mountProvider();
    let release!: () => void;
    h.invalidateQueries.mockReturnValue(new Promise<void>((r) => (release = r)));

    let settled = false;
    const done = h.authStateCallback!('TOKEN_REFRESHED', {
      access_token: 'new-access',
      refresh_token: 'new-refresh',
    }).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await act(async () => {
      release();
      await done;
    });

    expect(settled).toBe(true);
    expect(localStorage.getItem('accessToken')).toBe('new-access');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs when the auth-status refresh after a Supabase token rotation fails', async () => {
    const failure = new Error('network down');
    mountProvider();
    h.invalidateQueries.mockRejectedValue(failure);

    await act(async () => {
      await h.authStateCallback!('TOKEN_REFRESHED', {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      });
    });

    expect(errorSpy).toHaveBeenCalledWith('[AuthContext] Failed to refresh auth status:', failure);
  });

  describe('scheduled session refresh', () => {
    function mountWithTimer() {
      vi.useFakeTimers();
      localStorage.setItem('accessToken', jwtExpiringIn(60 * 60 * 1000));
      mountProvider();
    }

    it('requests a Supabase refresh when the timer fires and stays quiet on success', async () => {
      h.refreshSession.mockResolvedValue({ data: {}, error: null });
      mountWithTimer();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(56 * 60 * 1000);
      });

      expect(h.refreshSession).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs the error Supabase returns when the scheduled refresh is rejected', async () => {
      const failure = { message: 'refresh token revoked' };
      h.refreshSession.mockResolvedValue({ data: {}, error: failure });
      mountWithTimer();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(56 * 60 * 1000);
      });

      expect(errorSpy).toHaveBeenCalledWith(
        '[AuthContext] Scheduled session refresh failed:',
        failure
      );
    });

    it('logs when the scheduled refresh call itself rejects', async () => {
      const failure = new Error('network down');
      h.refreshSession.mockRejectedValue(failure);
      mountWithTimer();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(56 * 60 * 1000);
      });

      expect(errorSpy).toHaveBeenCalledWith(
        '[AuthContext] Scheduled session refresh failed:',
        failure
      );
    });
  });
});
