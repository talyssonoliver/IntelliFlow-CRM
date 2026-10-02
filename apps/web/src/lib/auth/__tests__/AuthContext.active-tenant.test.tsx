/**
 * @vitest-environment happy-dom
 *
 * AuthContext (ADR-071): a password sign-in starts from the home tenant. A selection left in
 * storage by an earlier session must not ride along and turn every request into NOT_A_MEMBER.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { ACTIVE_TENANT_STORAGE_KEY, setActiveTenantId } from '@/lib/tenant/active-tenant';

const h = vi.hoisted(() => ({
  loginMutateAsync: vi.fn(),
}));

// vitest.setup.ts replaces AuthContext globally; this file tests the real one.
vi.unmock('@/lib/auth/AuthContext');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    removeQueries: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock('../../trpc', () => ({
  trpc: {
    auth: {
      login: { useMutation: () => ({ mutateAsync: h.loginMutateAsync }) },
      logout: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      verifyMfa: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      refreshSession: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      getStatus: { useQuery: () => ({ data: undefined, isLoading: false, error: null }) },
    },
  },
}));
vi.mock('../../supabase-browser', () => ({ getSupabaseBrowserClient: () => null }));
vi.mock('@/lib/shared/token-exchange', () => ({
  storeSessionTokens: vi.fn(),
  clearSessionTokens: vi.fn(),
}));

import { AuthProvider, useAuth } from '../AuthContext';

const FLAG = 'NEXT_PUBLIC_INHERITED_MEMBERSHIP_ENABLED';

describe('AuthProvider.login and the active tenant', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv(FLAG, '1');
    h.loginMutateAsync.mockReset();
  });

  it('clears a leftover active-tenant selection on a successful password sign-in', async () => {
    setActiveTenantId('tenant_client_1');
    expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBe('tenant_client_1');
    h.loginMutateAsync.mockResolvedValue({
      success: true,
      user: { id: 'u1', email: 'a@b.test', name: 'A', role: 'USER' },
      session: { accessToken: 'tok', refreshToken: 'ref', expiresAt: new Date().toISOString() },
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.login('a@b.test', 'pw');
    });

    expect(ok).toBe(true);
    expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBeNull();
  });

  it('keeps the selection when the sign-in fails', async () => {
    setActiveTenantId('tenant_client_1');
    h.loginMutateAsync.mockRejectedValue(new Error('Invalid credentials'));

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });
    await act(async () => {
      await result.current.login('a@b.test', 'bad');
    });

    expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBe('tenant_client_1');
  });
});
