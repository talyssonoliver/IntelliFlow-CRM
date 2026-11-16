/**
 * @vitest-environment happy-dom
 *
 * MVP-007: while auth.getStatus is in flight, the provider starts from the status it last
 * confirmed for the same token subject, so the layout and page queries (which wait for
 * isAuthenticated) start without waiting one API round trip. getStatus keeps the last word.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { AUTH_STATUS_CACHE_KEY, writeCachedAuthStatus } from '../auth-status-snapshot';

type StatusView = {
  data?: unknown;
  isPending: boolean;
  isFetching: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: unknown;
};
const PENDING: StatusView = {
  data: undefined,
  isPending: true,
  isFetching: true,
  isSuccess: false,
  isError: false,
  error: null,
};
const h = vi.hoisted(() => ({ status: null as unknown as StatusView, logout: vi.fn() }));

// vitest.setup.ts replaces AuthContext globally; this file tests the real one.
vi.unmock('@/lib/auth/AuthContext');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(async () => undefined),
    removeQueries: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock('../../trpc', () => ({
  trpc: {
    auth: {
      login: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      logout: { useMutation: () => ({ mutateAsync: h.logout }) },
      verifyMfa: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      refreshSession: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      getStatus: { useQuery: () => h.status },
    },
  },
}));
vi.mock('../../supabase-browser', () => ({ getSupabaseBrowserClient: () => null }));
vi.mock('@/lib/shared/token-exchange', () => ({
  storeSessionTokens: vi.fn(),
  clearSessionTokens: vi.fn(),
}));
// Keep the real logout broadcast (the provider listens for it); stub only what touches storage.
vi.mock('@/lib/shared/session-cleanup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/shared/session-cleanup')>()),
  cleanupSession: vi.fn(async () => undefined),
  clearTokenCookie: vi.fn(),
  syncTokenToCookie: vi.fn(),
}));

import { AuthProvider, useAuth } from '../AuthContext';
import { AUTH_TOKEN_CHANGED_EVENT } from '@/lib/shared/session-cleanup';

/** A token-shaped string built at runtime: only its payload is read, nothing verifies it here. */
function tokenFor(payload: Record<string, unknown>): string {
  const part = (o: unknown) =>
    btoa(JSON.stringify(o)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return [part({ alg: 'none' }), part(payload), 'sig'].join('.');
}
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const owner = { id: 'u1', email: 'owner@example.invalid', name: 'Owner', role: 'ADMIN' };
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('AuthProvider starts from the last confirmed status (MVP-007)', () => {
  beforeEach(() => {
    localStorage.clear();
    h.status = PENDING;
    h.logout.mockReset().mockResolvedValue({ success: true });
  });

  it('is signed in at once, before getStatus answers, for the same token subject', async () => {
    const tok = tokenFor({ sub: 'user-1', exp: exp() });
    localStorage.setItem('accessToken', tok);
    writeCachedAuthStatus(tok, owner, true);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toEqual(owner);
    expect(result.current.emailVerified).toBe(true);
  });

  it('keeps waiting for getStatus when the stored status belongs to another subject', async () => {
    localStorage.setItem('accessToken', tokenFor({ sub: 'user-2', exp: exp() }));
    writeCachedAuthStatus(tokenFor({ sub: 'user-1', exp: exp() }), owner, true);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {});
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it('lets getStatus overturn it, and forgets the status when nobody is signed in', async () => {
    const tok = tokenFor({ sub: 'user-1', exp: exp() });
    localStorage.setItem('accessToken', tok);
    writeCachedAuthStatus(tok, owner, true);
    const { result, rerender } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    h.status = {
      data: { authenticated: false },
      isPending: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      error: null,
    };
    rerender();

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(localStorage.getItem(AUTH_STATUS_CACHE_KEY)).toBeNull();
  });

  const confirmed: StatusView = {
    data: { authenticated: true, user: { ...owner, emailVerified: false } },
    isPending: false,
    isFetching: false,
    isSuccess: true,
    isError: false,
    error: null,
  };

  it('remembers the user getStatus confirms for the token it was asked with', async () => {
    const tok = tokenFor({ sub: 'user-1', exp: exp() });
    localStorage.setItem('accessToken', tok);
    // A real load: getStatus is first in flight (with this token), then answers.
    const { result, rerender } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {});
    h.status = confirmed;
    rerender();

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    const stored = JSON.parse(localStorage.getItem(AUTH_STATUS_CACHE_KEY) ?? 'null');
    expect(stored).toMatchObject({
      sub: 'user-1',
      user: { id: 'u1', email: owner.email },
      emailVerified: false,
    });
  });

  it('stores nothing when another user signed in while getStatus was in flight', async () => {
    localStorage.setItem('accessToken', tokenFor({ sub: 'user-1', exp: exp() }));
    const { result, rerender } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {});
    // Another tab signs in as someone else before the answer for user-1 arrives.
    localStorage.setItem('accessToken', tokenFor({ sub: 'user-2', exp: exp() }));
    h.status = confirmed;
    rerender();

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(localStorage.getItem(AUTH_STATUS_CACHE_KEY)).toBeNull();
  });

  it('stores nothing when the token changed during the request, even for the same user', async () => {
    const tok = tokenFor({ sub: 'user-1', exp: exp() });
    localStorage.setItem('accessToken', tok);
    const { result, rerender } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {});
    await act(async () => {
      globalThis.dispatchEvent(new Event(AUTH_TOKEN_CHANGED_EVENT));
    });
    h.status = confirmed;
    rerender();

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(localStorage.getItem(AUTH_STATUS_CACHE_KEY)).toBeNull();
  });

  it('forgets the status on sign-out', async () => {
    const tok = tokenFor({ sub: 'user-1', exp: exp() });
    localStorage.setItem('accessToken', tok);
    writeCachedAuthStatus(tok, owner, true);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout({ navigate: false });
    });

    expect(localStorage.getItem(AUTH_STATUS_CACHE_KEY)).toBeNull();
  });
});
