/**
 * @vitest-environment jsdom
 */
/**
 * OAuthCallback - partner magic-link flow (?token_hash=...&type=magiclink&next=...)
 *
 * The link carries a hashed OTP issued by `partner.issueLoginLink`. The callback must sign out
 * any existing local session first, exchange the OTP with verifyOtp, then run the same
 * post-login steps as the OAuth path.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  storeSessionTokens: vi.fn(),
  clearSessionTokens: vi.fn(),
  getStoredAccessToken: vi.fn(),
  storeSessionFingerprint: vi.fn(),
  clearSupabaseLocalStorage: vi.fn(),
  syncTokenToCookie: vi.fn(),
  clearTokenCookie: vi.fn(),
  recordAuthBreadcrumb: vi.fn(),
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
      getSession: h.getSession,
      getUser: h.getUser,
    },
  }),
  clearSupabaseLocalStorage: h.clearSupabaseLocalStorage,
}));
vi.mock('@/lib/shared/token-exchange', () => ({
  storeSessionTokens: h.storeSessionTokens,
  clearSessionTokens: h.clearSessionTokens,
  getStoredAccessToken: h.getStoredAccessToken,
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

const SESSION = { access_token: 'acc', refresh_token: 'ref' };

describe('OAuthCallback magic link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    h.order.length = 0;
    h.getStoredAccessToken.mockReturnValue(null);
    h.query.value = 'token_hash=hash123&type=magiclink&next=/dashboard';
    h.signOut.mockImplementation(async () => {
      h.order.push('signOut');
      return { error: null };
    });
    h.verifyOtp.mockImplementation(async () => {
      h.order.push('verifyOtp');
      return { data: { session: SESSION, user: { id: 'u1', email: 'a@b.co' } }, error: null };
    });
  });

  it('signs out the existing session FIRST, then verifies the token hash', async () => {
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(h.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(h.verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'hash123' });
    expect(h.order).toEqual(['signOut', 'verifyOtp']);
    expect(h.clearSessionTokens).toHaveBeenCalled();
    expect(h.clearTokenCookie).toHaveBeenCalled();
  });

  it('runs the same post-login steps as the OAuth path and skips the PKCE exchange', async () => {
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(h.storeSessionTokens).toHaveBeenCalledWith('acc', 'ref');
    expect(h.syncTokenToCookie).toHaveBeenCalledWith('acc');
    expect(h.storeSessionFingerprint).toHaveBeenCalled();
    expect(h.clearSupabaseLocalStorage).toHaveBeenCalled();
    expect(sessionStorage.getItem('oauth_login_success')).toBeTruthy();
    expect(onSuccess).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.co' }, { accessToken: 'acc' });
    expect(h.getSession).not.toHaveBeenCalled();
  });

  it('navigates to the next path when no onSuccess is given', async () => {
    h.query.value = 'token_hash=hash123&type=magiclink&next=/leads%3Ftab%3Dnew';
    render(<OAuthCallback />);

    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/leads?tab=new'), { timeout: 2000 });
  });

  it('defaults to /dashboard and refuses an off-origin next', async () => {
    h.query.value = 'token_hash=hash123&type=magiclink&next=//evil.example.net';
    render(<OAuthCallback />);

    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/dashboard'), { timeout: 2000 });
  });

  it('shows a clear error and Back to Sign In for an invalid or expired token', async () => {
    const onError = vi.fn();
    h.verifyOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Token has expired or is invalid' },
    });
    render(<OAuthCallback onError={onError} />);

    expect(await screen.findByText('Authentication Failed')).toBeInTheDocument();
    expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
    expect(h.syncTokenToCookie).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/invalid or has expired/i));

    await userEvent.click(screen.getByRole('button', { name: /back to sign in/i }));
    expect(h.push).toHaveBeenCalledWith('/login');
  });

  it('rejects a token_hash whose type is not magiclink without calling verifyOtp', async () => {
    h.query.value = 'token_hash=hash123&type=recovery';
    render(<OAuthCallback />);

    expect(await screen.findByText('Authentication Failed')).toBeInTheDocument();
    expect(h.verifyOtp).not.toHaveBeenCalled();
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it('still signs in when signOut throws', async () => {
    h.signOut.mockRejectedValue(new Error('network'));
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(h.verifyOtp).toHaveBeenCalled();
  });
});

describe('OAuthCallback magic link with an existing session (login CSRF guard)', () => {
  // header.payload.signature with payload {"email":"victim@example.com"}
  const VICTIM_JWT = `x.${btoa(JSON.stringify({ email: 'victim@example.com' }))}.y`;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    h.query.value = 'token_hash=hash123&type=magiclink&next=/leads';
    h.getStoredAccessToken.mockReturnValue(VICTIM_JWT);
    h.signOut.mockResolvedValue({ error: null });
    h.verifyOtp.mockResolvedValue({
      data: { session: SESSION, user: { id: 'u1', email: 'a@b.co' } },
      error: null,
    });
  });

  it('asks first: no signOut and no verifyOtp until the user confirms', async () => {
    render(<OAuthCallback onSuccess={vi.fn()} />);

    expect(await screen.findByText('Switch account?')).toBeInTheDocument();
    expect(screen.getByText(/signed in as victim@example\.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stay signed in/i })).toBeInTheDocument();
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.verifyOtp).not.toHaveBeenCalled();
    expect(h.clearSessionTokens).not.toHaveBeenCalled();
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
  });

  it('removes the token from the address bar before showing the prompt', async () => {
    window.history.replaceState(null, '', '/auth/callback?token_hash=hash123&type=magiclink');
    render(<OAuthCallback onSuccess={vi.fn()} />);

    await screen.findByText('Switch account?');
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain('hash123');
  });

  it('Continue runs signOut then verifyOtp with the in-memory token, then signs in', async () => {
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(h.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(h.verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'hash123' });
    expect(h.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      h.verifyOtp.mock.invocationCallOrder[0]
    );
    expect(h.storeSessionTokens).toHaveBeenCalledWith('acc', 'ref');
  });

  it('Continue navigates to the sanitised next path', async () => {
    render(<OAuthCallback />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/leads'), { timeout: 2000 });
  });

  it('Stay signed in keeps the session, never touches the token, and goes to /dashboard', async () => {
    render(<OAuthCallback onSuccess={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: /stay signed in/i }));

    expect(h.push).toHaveBeenCalledWith('/dashboard');
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.verifyOtp).not.toHaveBeenCalled();
    expect(h.clearSessionTokens).not.toHaveBeenCalled();
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
  });

  it('an invalid token after Continue shows the error and Back to Sign In', async () => {
    h.verifyOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'expired' },
    });
    render(<OAuthCallback onSuccess={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Authentication Failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to sign in/i })).toBeInTheDocument();
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
  });
});
