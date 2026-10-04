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

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
  adminSignOut: vi.fn(),
  createIsolatedAuthClient: vi.fn(),
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
      admin: { signOut: h.adminSignOut },
    },
  }),
  clearSupabaseLocalStorage: h.clearSupabaseLocalStorage,
  // Verifying a link while signed in uses an isolated client; it shares the verifyOtp spy.
  createIsolatedAuthClient: h.createIsolatedAuthClient,
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
    h.createIsolatedAuthClient.mockReturnValue({ auth: { verifyOtp: h.verifyOtp } });
    h.adminSignOut.mockResolvedValue({ error: null });
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

  it('with no session, verifies on the app client and revokes nothing extra', async () => {
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(h.createIsolatedAuthClient).not.toHaveBeenCalled();
    expect(h.adminSignOut).not.toHaveBeenCalled();
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
  // header.payload.signature with payload {"sub":"victim-id","email":"victim@example.com"}
  const jwtFor = (claims: Record<string, string>) => `x.${btoa(JSON.stringify(claims))}.y`;
  const VICTIM_JWT = jwtFor({ sub: 'victim-id', email: 'victim@example.com' });

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    h.createIsolatedAuthClient.mockReturnValue({ auth: { verifyOtp: h.verifyOtp } });
    h.adminSignOut.mockResolvedValue({ error: null });
    h.query.value = 'token_hash=hash123&type=magiclink&next=/leads';
    h.getStoredAccessToken.mockReturnValue(VICTIM_JWT);
    h.signOut.mockResolvedValue({ error: null });
    h.verifyOtp.mockResolvedValue({
      data: { session: SESSION, user: { id: 'u1', email: 'a@b.co' } },
      error: null,
    });
  });

  it('a different account asks first: the link is verified but the app session is untouched', async () => {
    render(<OAuthCallback onSuccess={vi.fn()} />);

    expect(await screen.findByText('Switch account?')).toBeInTheDocument();
    expect(screen.getByText(/signed in as victim@example\.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stay signed in/i })).toBeInTheDocument();
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.clearSessionTokens).not.toHaveBeenCalled();
    expect(h.clearTokenCookie).not.toHaveBeenCalled();
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
    expect(h.syncTokenToCookie).not.toHaveBeenCalled();
  });

  it('the same account (same user id) shows no dialog and signs straight in', async () => {
    h.verifyOtp.mockResolvedValue({
      data: { session: SESSION, user: { id: 'victim-id', email: 'victim@example.com' } },
      error: null,
    });
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(screen.queryByText('Switch account?')).not.toBeInTheDocument();
    expect(screen.queryByTestId('switch-account-dialog')).not.toBeInTheDocument();
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.storeSessionTokens).toHaveBeenCalledWith('acc', 'ref');
    expect(h.syncTokenToCookie).toHaveBeenCalledWith('acc');
  });

  it('the same account navigates to the next path with no prompt', async () => {
    h.verifyOtp.mockResolvedValue({
      data: { session: SESSION, user: { id: 'victim-id', email: 'victim@example.com' } },
      error: null,
    });
    render(<OAuthCallback />);

    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/leads'), { timeout: 2000 });
    expect(screen.queryByText('Switch account?')).not.toBeInTheDocument();
  });

  it('without a stable id on the session, the same email compares case-insensitively', async () => {
    h.getStoredAccessToken.mockReturnValue(jwtFor({ email: 'Victim@Example.com' }));
    h.verifyOtp.mockResolvedValue({
      data: { session: SESSION, user: { id: 'u9', email: 'victim@example.COM' } },
      error: null,
    });
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(screen.queryByText('Switch account?')).not.toBeInTheDocument();
  });

  it('a different user id wins over a matching email: the dialog still appears', async () => {
    h.verifyOtp.mockResolvedValue({
      data: { session: SESSION, user: { id: 'other-id', email: 'victim@example.com' } },
      error: null,
    });
    render(<OAuthCallback onSuccess={vi.fn()} />);

    expect(await screen.findByText('Switch account?')).toBeInTheDocument();
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
  });

  it('an identity that cannot be compared is treated as a different account', async () => {
    h.getStoredAccessToken.mockReturnValue('not-a-jwt');
    render(<OAuthCallback onSuccess={vi.fn()} />);

    expect(await screen.findByText('Switch account?')).toBeInTheDocument();
  });

  it('verifies the link on the isolated client, so nothing is persisted before consent', async () => {
    render(<OAuthCallback onSuccess={vi.fn()} />);

    await screen.findByText('Switch account?');
    expect(h.createIsolatedAuthClient).toHaveBeenCalledTimes(1);
    expect(h.clearSupabaseLocalStorage).not.toHaveBeenCalled();
    expect(h.adminSignOut).not.toHaveBeenCalled();
  });

  it('Continue revokes the replaced session once the new one is signed in', async () => {
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(h.adminSignOut).toHaveBeenCalledTimes(1);
    expect(h.adminSignOut).toHaveBeenCalledWith(VICTIM_JWT, 'local');
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it('the same account revokes the replaced session after signing in', async () => {
    h.verifyOtp.mockResolvedValue({
      data: { session: SESSION, user: { id: 'victim-id', email: 'victim@example.com' } },
      error: null,
    });
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(h.adminSignOut).toHaveBeenCalledWith(VICTIM_JWT, 'local');
  });

  it('leaving the prompt without a choice revokes the held session', async () => {
    const { unmount } = render(<OAuthCallback onSuccess={vi.fn()} />);
    await screen.findByText('Switch account?');

    unmount();
    expect(h.adminSignOut).toHaveBeenCalledWith('acc', 'local');
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
  });

  it('a page restored from the back/forward cache shows the used-link error, not the prompt', async () => {
    render(<OAuthCallback onSuccess={vi.fn()} />);
    await screen.findByText('Switch account?');

    const hide = new Event('pagehide');
    Object.defineProperty(hide, 'persisted', { value: true });
    act(() => {
      globalThis.dispatchEvent(hide);
    });

    expect(await screen.findByText('Authentication Failed')).toBeInTheDocument();
    expect(h.adminSignOut).toHaveBeenCalledWith('acc', 'local');
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
  });

  it('a verification that lands after the page is gone is revoked, never held', async () => {
    let land!: (value: unknown) => void;
    h.verifyOtp.mockReturnValue(new Promise((resolve) => (land = resolve)));
    const { unmount } = render(<OAuthCallback onSuccess={vi.fn()} />);
    await waitFor(() => expect(h.verifyOtp).toHaveBeenCalled());

    unmount();
    expect(h.adminSignOut).not.toHaveBeenCalled();
    await act(async () => {
      land({ data: { session: SESSION, user: { id: 'u1', email: 'a@b.co' } }, error: null });
    });

    await waitFor(() => expect(h.adminSignOut).toHaveBeenCalledWith('acc', 'local'));
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
  });

  it('pagehide while the prompt is open revokes the held session once', async () => {
    const { unmount } = render(<OAuthCallback onSuccess={vi.fn()} />);
    await screen.findByText('Switch account?');

    globalThis.dispatchEvent(new Event('pagehide'));
    unmount();
    expect(h.adminSignOut).toHaveBeenCalledTimes(1);
    expect(h.adminSignOut).toHaveBeenCalledWith('acc', 'local');
  });

  it('removes the token from the address bar before showing the prompt', async () => {
    window.history.replaceState(null, '', '/auth/callback?token_hash=hash123&type=magiclink');
    render(<OAuthCallback onSuccess={vi.fn()} />);

    await screen.findByText('Switch account?');
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain('hash123');
  });

  it('Continue signs in with the held session, verifying the token only once', async () => {
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(h.verifyOtp).toHaveBeenCalledTimes(1);
    expect(h.verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'hash123' });
    expect(h.storeSessionTokens).toHaveBeenCalledWith('acc', 'ref');
    expect(onSuccess).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.co' }, { accessToken: 'acc' });
  });

  it('Continue navigates to the sanitised next path', async () => {
    render(<OAuthCallback />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/leads'), { timeout: 2000 });
  });

  it('Stay signed in keeps the app session, discards the held one, and goes to /dashboard', async () => {
    render(<OAuthCallback onSuccess={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: /stay signed in/i }));

    expect(h.push).toHaveBeenCalledWith('/dashboard');
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.clearSessionTokens).not.toHaveBeenCalled();
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
    expect(h.clearSupabaseLocalStorage).toHaveBeenCalled();
  });

  it('an invalid token shows the error and Back to Sign In without a prompt', async () => {
    h.verifyOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'expired' },
    });
    render(<OAuthCallback onSuccess={vi.fn()} />);

    expect(await screen.findByText('Authentication Failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to sign in/i })).toBeInTheDocument();
    expect(screen.queryByText('Switch account?')).not.toBeInTheDocument();
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
    expect(h.clearSessionTokens).not.toHaveBeenCalled();
  });
});
