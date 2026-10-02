/**
 * @vitest-environment jsdom
 */
/**
 * OAuthCallback magic link: the page can never hang silently, and the account-switch prompt is
 * a dialog whose buttons are always reachable.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  claim: vi.fn(),
  getStoredAccessToken: vi.fn(),
  storeSessionTokens: vi.fn(),
  clearSessionTokens: vi.fn(),
  clearSupabaseLocalStorage: vi.fn(),
  query: { value: '' },
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
  syncTokenToCookie: vi.fn(),
  clearTokenCookie: vi.fn(),
  recordAuthBreadcrumb: vi.fn(),
}));
vi.mock('@/lib/shared/login-security', () => ({ storeSessionFingerprint: vi.fn() }));
vi.mock('@/lib/tenant/claim-grant', () => {
  class ClaimLoginGrantError extends Error {
    readonly reason: string | null;
    constructor(message: string, reason: string | null) {
      super(message);
      this.reason = reason;
    }
  }
  return { claimLoginGrant: h.claim, ClaimLoginGrantError };
});

import { OAuthCallback } from '../oauth-callback';
import { ClaimLoginGrantError } from '@/lib/tenant/claim-grant';

const SESSION = { access_token: 'acc', refresh_token: 'ref' };
const LINK = 'token_hash=hash123&type=magiclink&next=/dashboard&tenant=ten_1&grant=grant_1';
const NEVER = () => new Promise<never>(() => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  h.query.value = LINK;
  h.getStoredAccessToken.mockReturnValue(null);
  h.signOut.mockResolvedValue({ error: null });
  h.verifyOtp.mockResolvedValue({
    data: { session: SESSION, user: { id: 'u1', email: 'a@b.co' } },
    error: null,
  });
  h.claim.mockResolvedValue({ tenantId: 'ten_1', pinned: false, sessionExpiresAt: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('account-switch dialog', () => {
  beforeEach(() => {
    h.getStoredAccessToken.mockReturnValue('x.e30.y');
  });

  it('renders as a dialog with test ids on both actions', async () => {
    render(<OAuthCallback onSuccess={vi.fn()} />);
    const dialog = await screen.findByTestId('switch-account-dialog');
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByTestId('switch-account-continue')).toBeInTheDocument();
    expect(screen.getByTestId('switch-account-stay')).toBeInTheDocument();
  });

  it('does not assert the link is for a different account', async () => {
    render(<OAuthCallback onSuccess={vi.fn()} />);
    await screen.findByTestId('switch-account-dialog');
    expect(screen.queryByText(/different account/i)).toBeNull();
    expect(
      screen.getByText(
        /This link signs you in through the Leangency Portal\. Continue and switch\?/
      )
    ).toBeInTheDocument();
  });

  it('Continue works while another modal dialog is open on the page', async () => {
    const other = document.createElement('dialog');
    other.setAttribute('open', '');
    other.setAttribute('data-testid', 'foreign-overlay');
    document.body.appendChild(other);
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);

    await userEvent.click(await screen.findByTestId('switch-account-continue'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    other.remove();
  });

  it('a dialog closed without a choice reopens, so its actions stay reachable', async () => {
    render(<OAuthCallback onSuccess={vi.fn()} />);
    const dialog = await screen.findByTestId('switch-account-dialog');
    // What Chromium does on a repeated Escape: close without a cancelable cancel event.
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByTestId('switch-account-continue')).toBeInTheDocument();
  });

  it('Escape cannot dismiss the prompt without a choice', async () => {
    render(<OAuthCallback onSuccess={vi.fn()} />);
    const dialog = await screen.findByTestId('switch-account-dialog');
    const evt = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });
});

describe('never hangs silently', () => {
  it('shows the error state when the grant claim fails', async () => {
    h.claim.mockRejectedValue(
      new ClaimLoginGrantError('This sign-in link is invalid or has expired.', 'GRANT_INVALID')
    );
    render(<OAuthCallback onSuccess={vi.fn()} />);

    expect(await screen.findByText('Authentication Failed')).toBeInTheDocument();
    expect(screen.getByTestId('callback-back-to-login')).toBeInTheDocument();
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
    expect(h.clearSessionTokens).toHaveBeenCalled();
  });

  it('shows the error state when the grant claim hangs', async () => {
    vi.useFakeTimers();
    h.claim.mockImplementation(NEVER);
    render(<OAuthCallback onSuccess={vi.fn()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(screen.getByText('Authentication Failed')).toBeInTheDocument();
    expect(screen.getByText(/taking too long/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to sign in/i })).toBeInTheDocument();
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
  });

  it('shows the error state when verifyOtp hangs', async () => {
    vi.useFakeTimers();
    h.verifyOtp.mockImplementation(NEVER);
    render(<OAuthCallback onSuccess={vi.fn()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(screen.getByText('Authentication Failed')).toBeInTheDocument();
  });

  it('a hung signOut is terminal: verifyOtp never starts, so a late signOut cannot erase it', async () => {
    vi.useFakeTimers();
    h.signOut.mockImplementation(NEVER);
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(screen.getByText('Authentication Failed')).toBeInTheDocument();
    expect(h.verifyOtp).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('a signOut that fails (settles with an error) does not block the exchange', async () => {
    h.signOut.mockRejectedValue(new Error('no session'));
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(h.verifyOtp).toHaveBeenCalled();
  });

  it('a late result cannot sign in after the error state was shown', async () => {
    vi.useFakeTimers();
    let release: (v: unknown) => void = () => undefined;
    h.verifyOtp.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(screen.getByText('Authentication Failed')).toBeInTheDocument();

    await act(async () => {
      release({ data: { session: SESSION, user: { id: 'u1' } }, error: null });
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByText('Authentication Failed')).toBeInTheDocument();
    // The session the SDK persisted when the abandoned request landed is signed out again.
    expect(h.signOut).toHaveBeenCalledTimes(2);
    expect(h.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
  });

  it('a late result never signs out a session the user created after the failure', async () => {
    vi.useFakeTimers();
    let release: (v: unknown) => void = () => undefined;
    h.verifyOtp.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    render(<OAuthCallback onSuccess={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(screen.getByText('Authentication Failed')).toBeInTheDocument();

    // The user went back to /login and signed in with a password: the app now holds that token.
    h.getStoredAccessToken.mockReturnValue('password-session-token');
    h.signOut.mockClear();
    h.clearSessionTokens.mockClear();
    h.clearSupabaseLocalStorage.mockClear();
    await act(async () => {
      release({ data: { session: SESSION, user: { id: 'u1' } }, error: null });
      await vi.advanceTimersByTimeAsync(100);
    });
    // No SIGNED_OUT (AuthContext would wipe the new session), no app-token wipe: only the
    // abandoned session's copy in the SDK's storage is removed.
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.clearSessionTokens).not.toHaveBeenCalled();
    expect(h.clearSupabaseLocalStorage).toHaveBeenCalledTimes(1);
  });

  describe('a step that settles after the flow watchdog fired', () => {
    // Each step stays inside its own 10 s ceiling; the watchdog is lowered so it fires first.
    const after = <T,>(ms: number, value: T) =>
      new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
    beforeEach(() => {
      vi.useFakeTimers();
      h.signOut.mockImplementationOnce(() => after(9_900, { error: null }));
      h.verifyOtp.mockImplementation(() =>
        after(9_900, { data: { session: SESSION, user: { id: 'u1' } }, error: null })
      );
      h.claim.mockImplementation(() =>
        after(9_900, { tenantId: 'ten_1', pinned: false, sessionExpiresAt: null })
      );
    });

    it('during verifyOtp: the grant is never claimed and the late session is dropped', async () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} onError={onError} flowTimeoutMs={15_000} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(screen.getByText('Authentication Failed')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(h.claim).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(h.storeSessionTokens).not.toHaveBeenCalled();
      // The pre-switch sign-out, then the drop of the session verifyOtp produced.
      expect(h.signOut).toHaveBeenCalledTimes(2);
      expect(h.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('during the grant claim: no sign-in, the session is dropped, one error only', async () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} onError={onError} flowTimeoutMs={25_000} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(25_000);
      });
      expect(screen.getByText('Authentication Failed')).toBeInTheDocument();
      expect(h.claim).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(onSuccess).not.toHaveBeenCalled();
      expect(h.storeSessionTokens).not.toHaveBeenCalled();
      expect(h.signOut).toHaveBeenCalledTimes(2);
      expect(h.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
      expect(onError).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/taking too long/i)).toBeInTheDocument();
    });
  });
});

describe('OAuth code flow', () => {
  beforeEach(() => {
    h.query.value = 'code=abc&nonce=n1';
    sessionStorage.setItem('intelliflow_oauth_nonce', 'n1');
    h.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  });

  it('a session exchanged after getSession timed out is signed out when it lands', async () => {
    vi.useFakeTimers();
    let release: (v: unknown) => void = () => undefined;
    h.getSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(screen.getByText('Authentication Failed')).toBeInTheDocument();
    expect(h.signOut).not.toHaveBeenCalled();

    await act(async () => {
      release({ data: { session: SESSION }, error: null });
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(h.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(h.storeSessionTokens).not.toHaveBeenCalled();
  });

  it('a late getSession with no session signs nothing out', async () => {
    vi.useFakeTimers();
    let release: (v: unknown) => void = () => undefined;
    h.getSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    render(<OAuthCallback onSuccess={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    await act(async () => {
      release({ data: { session: null }, error: null });
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it('a getUser timeout drops the already exchanged session', async () => {
    vi.useFakeTimers();
    h.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    h.getUser.mockImplementation(NEVER);
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(screen.getByText('Authentication Failed')).toBeInTheDocument();
    expect(h.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('signs in when both steps settle in time', async () => {
    h.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    const onSuccess = vi.fn();
    render(<OAuthCallback onSuccess={onSuccess} />);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(h.signOut).not.toHaveBeenCalled();
  });
});
