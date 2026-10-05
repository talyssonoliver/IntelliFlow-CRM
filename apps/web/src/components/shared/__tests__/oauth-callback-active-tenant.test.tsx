/**
 * @vitest-environment jsdom
 */
/**
 * OAuthCallback - active tenant on the partner magic link (ADR-071)
 *
 * The link carries `tenant` and `grant` hints. The callback claims the grant FIRST with the new
 * session's token (the pin is bound there), stores the tenant the server returns as the active
 * tenant, and fails closed when the claim fails.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ACTIVE_TENANT_STORAGE_KEY,
  getActiveTenantId,
  setActiveTenantId,
} from '@/lib/tenant/active-tenant';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  signOut: vi.fn(),
  adminSignOut: vi.fn(),
  verifyOtp: vi.fn(),
  storeSessionTokens: vi.fn(),
  clearSessionTokens: vi.fn(),
  getStoredAccessToken: vi.fn(),
  storeSessionFingerprint: vi.fn(),
  clearSupabaseLocalStorage: vi.fn(),
  syncTokenToCookie: vi.fn(),
  clearTokenCookie: vi.fn(),
  recordAuthBreadcrumb: vi.fn(),
  fetch: vi.fn(),
  query: { value: '' },
  order: [] as string[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.query.value),
}));
vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: h.signOut,
      verifyOtp: h.verifyOtp,
      getSession: vi.fn(),
      getUser: vi.fn(),
      admin: { signOut: h.adminSignOut },
    },
  }),
  clearSupabaseLocalStorage: h.clearSupabaseLocalStorage,
  // Verifying a link while signed in uses an isolated client; it shares the verifyOtp spy.
  createIsolatedAuthClient: () => ({ auth: { verifyOtp: h.verifyOtp } }),
}));
vi.mock('@/lib/shared/token-exchange', () => ({
  storeSessionTokens: h.storeSessionTokens,
  clearSessionTokens: h.clearSessionTokens,
  getStoredAccessToken: h.getStoredAccessToken,
  getStoredRefreshToken: () => null,
}));
vi.mock('@/lib/shared/session-cleanup', () => ({
  syncTokenToCookie: h.syncTokenToCookie,
  clearTokenCookie: h.clearTokenCookie,
  recordAuthBreadcrumb: h.recordAuthBreadcrumb,
}));
vi.mock('@/lib/shared/login-security', () => ({
  storeSessionFingerprint: h.storeSessionFingerprint,
}));

import { OAuthCallback } from '../oauth-callback';

const FLAG = 'NEXT_PUBLIC_INHERITED_MEMBERSHIP_ENABLED';
const SESSION = { access_token: 'acc', refresh_token: 'ref' };
const FULL_LINK =
  'token_hash=hash123&type=magiclink&next=/dashboard&tenant=tenant_hint&grant=grant_1';

function trpcOk(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ result: { data } }) };
}
function trpcError(reason: string) {
  return {
    ok: false,
    status: 403,
    json: async () => ({
      error: { message: `${reason}: nope`, data: { code: 'FORBIDDEN', reason } },
    }),
  };
}
function notJson() {
  return {
    ok: false,
    status: 500,
    json: async (): Promise<never> => {
      throw new Error('not json');
    },
  };
}

describe('OAuthCallback active tenant', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    h.order.length = 0;
    h.getStoredAccessToken.mockReturnValue(null);
    h.adminSignOut.mockResolvedValue({ data: null, error: null });
    vi.stubEnv(FLAG, '1');
    vi.stubGlobal('fetch', h.fetch);
    h.query.value = FULL_LINK;
    h.signOut.mockImplementation(async () => {
      h.order.push('signOut');
      return { error: null };
    });
    h.verifyOtp.mockImplementation(async () => {
      h.order.push('verifyOtp');
      return { data: { session: SESSION, user: { id: 'u1', email: 'a@b.co' } }, error: null };
    });
    h.storeSessionTokens.mockImplementation(() => {
      h.order.push('storeSessionTokens');
    });
    h.fetch.mockImplementation(async () => {
      h.order.push('claim');
      return trpcOk({ tenantId: 'tenant_client', pinned: true, sessionExpiresAt: null });
    });
  });

  describe('with an existing session', () => {
    it('keeps the grant and tenant in memory and claims them only after Continue (verify holds the session, never the app tokens)', async () => {
      h.getStoredAccessToken.mockReturnValue('x.e30.y');
      const onSuccess = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} />);

      await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());

      expect(h.order).toEqual(['verifyOtp', 'claim', 'storeSessionTokens']);
      expect(JSON.parse((h.fetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({
        grant: 'grant_1',
      });
      expect(getActiveTenantId()).toBe('tenant_client');
    });

    it('a claim that settles after the user left signs nothing in and revokes nothing old', async () => {
      h.getStoredAccessToken.mockReturnValue('x.e30.y');
      let settle!: (value: ReturnType<typeof trpcOk>) => void;
      h.fetch.mockImplementation(
        () => new Promise<ReturnType<typeof trpcOk>>((resolve) => (settle = resolve))
      );
      const onSuccess = vi.fn();
      const { unmount } = render(<OAuthCallback onSuccess={onSuccess} />);
      await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
      await waitFor(() => expect(h.fetch).toHaveBeenCalled());

      unmount();
      await act(async () => {
        settle(trpcOk({ tenantId: 'tenant_client', pinned: true, sessionExpiresAt: null }));
      });

      expect(onSuccess).not.toHaveBeenCalled();
      expect(h.storeSessionTokens).not.toHaveBeenCalled();
      expect(h.adminSignOut).not.toHaveBeenCalledWith('x.e30.y', 'local');
      expect(getActiveTenantId()).toBeNull();
    });

    it('claims nothing and stores no tenant when the user stays signed in', async () => {
      h.getStoredAccessToken.mockReturnValue('x.e30.y');
      render(<OAuthCallback onSuccess={vi.fn()} />);

      await userEvent.click(await screen.findByRole('button', { name: /stay signed in/i }));

      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.storeSessionTokens).not.toHaveBeenCalled();
      expect(getActiveTenantId()).toBeNull();
    });
  });

  describe('claiming the grant', () => {
    it('claims with the NEW session token before anything else is stored', async () => {
      const onSuccess = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} />);
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());

      expect(h.order).toEqual(['signOut', 'verifyOtp', 'claim', 'storeSessionTokens']);
      expect(h.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = h.fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/api\/trpc\/user\.claimLoginGrant$/);
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ authorization: 'Bearer acc' });
      expect(JSON.parse(init.body as string)).toEqual({ grant: 'grant_1' });
    });

    it('sends no x-active-tenant with the claim (the claim decides the tenant)', async () => {
      setActiveTenantId('tenant_stale');
      const onSuccess = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} />);
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());

      const init = h.fetch.mock.calls[0][1] as RequestInit;
      expect(Object.keys(init.headers as object).map((k) => k.toLowerCase())).not.toContain(
        'x-active-tenant'
      );
    });

    it('does not claim a link without a grant', async () => {
      h.query.value = 'token_hash=hash123&type=magiclink&next=/dashboard&tenant=tenant_hint';
      const onSuccess = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} />);
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());

      expect(h.fetch).not.toHaveBeenCalled();
    });

    it('refuses a malformed grant id without calling the API', async () => {
      h.query.value = 'token_hash=hash123&type=magiclink&grant=bad%20grant%0D%0A';
      const onError = vi.fn();
      render(<OAuthCallback onError={onError} />);

      expect(await screen.findByText('Authentication Failed')).toBeInTheDocument();
      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.storeSessionTokens).not.toHaveBeenCalled();
    });
  });

  describe('active tenant', () => {
    it('stores the tenant the SERVER returned, not the link hint', async () => {
      const onSuccess = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} />);
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());

      expect(getActiveTenantId()).toBe('tenant_client');
      expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBe('tenant_client');
    });

    it('stores it before the success callback navigates away', async () => {
      let seenAtSuccess: string | null = null;
      const onSuccess = vi.fn(() => {
        seenAtSuccess = getActiveTenantId();
      });
      render(<OAuthCallback onSuccess={onSuccess} />);
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());

      expect(seenAtSuccess).toBe('tenant_client');
    });

    it('falls back to the valid tenant hint when the link has no grant', async () => {
      h.query.value = 'token_hash=hash123&type=magiclink&tenant=tenant_hint';
      const onSuccess = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} />);
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());

      expect(getActiveTenantId()).toBe('tenant_hint');
    });

    it('ignores a malformed tenant hint', async () => {
      h.query.value = 'token_hash=hash123&type=magiclink&tenant=bad%20tenant%0D%0A';
      const onSuccess = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} />);
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());

      expect(getActiveTenantId()).toBeNull();
    });

    it('replaces a selection left over from a previous session', async () => {
      setActiveTenantId('tenant_stale');
      h.query.value = 'token_hash=hash123&type=magiclink';
      const onSuccess = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} />);
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());

      expect(getActiveTenantId()).toBeNull();
      expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBeNull();
    });

    it('stores the claimed tenant even while the web flag is off (the API decides by data)', async () => {
      vi.stubEnv(FLAG, '0');
      const onSuccess = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} />);
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());

      expect(h.fetch).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)).toBe('tenant_client');
    });
  });

  describe('fails closed', () => {
    it.each([
      ['GRANT_INVALID', () => trpcError('GRANT_INVALID')],
      ['an error with a non-JSON body', () => notJson()],
      ['a malformed success payload', () => trpcOk({ tenantId: 'bad tenant', pinned: true })],
    ])('when the claim fails with %s', async (_label, response) => {
      h.fetch.mockImplementation(async () => response());
      const onSuccess = vi.fn();
      const onError = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} onError={onError} />);

      expect(await screen.findByText('Authentication Failed')).toBeInTheDocument();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(h.storeSessionTokens).not.toHaveBeenCalled();
      expect(h.syncTokenToCookie).not.toHaveBeenCalled();
      expect(getActiveTenantId()).toBeNull();
      expect(onError).toHaveBeenCalledWith(expect.stringMatching(/invalid or has expired/i));
    });

    it('drops the Supabase session it just created', async () => {
      h.fetch.mockImplementation(async () => trpcError('GRANT_INVALID'));
      render(<OAuthCallback />);
      await screen.findByText('Authentication Failed');

      // signOut only before verifyOtp. The session the failed claim leaves behind is revoked on
      // the server and dropped locally without SIGNED_OUT (no sign-out that could land after a
      // later sign-in); the local cleanup runs once before verifyOtp and once after the claim.
      expect(h.signOut).toHaveBeenCalledTimes(1);
      expect(h.adminSignOut).toHaveBeenCalledWith(expect.any(String), 'local');
      expect(h.clearSessionTokens).toHaveBeenCalledTimes(2);
      expect(h.clearTokenCookie).toHaveBeenCalledTimes(2);
      expect(h.clearSupabaseLocalStorage).toHaveBeenCalledTimes(2);
    });

    it('when the network fails', async () => {
      h.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
      const onSuccess = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} />);

      expect(await screen.findByText('Authentication Failed')).toBeInTheDocument();
      expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(h.storeSessionTokens).not.toHaveBeenCalled();
    });
  });
});
