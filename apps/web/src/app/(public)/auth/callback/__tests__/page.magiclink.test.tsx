/**
 * @vitest-environment happy-dom
 *
 * Callback page - magic link routing.
 *
 * A `token_hash` must bypass useRedirectIfAuthenticated (an existing session would otherwise
 * redirect before the link is processed) and land on the sanitised `next` path.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  redirectIfAuthenticated: vi.fn(),
  oauthProps: vi.fn(),
  query: { value: '' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.query.value),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRedirectIfAuthenticated: (p: string) => h.redirectIfAuthenticated(p),
}));
vi.mock('@/components/shared/oauth-callback', () => ({
  OAuthCallback: (props: Record<string, unknown>) => {
    h.oauthProps(props);
    return <div data-testid="mock-oauth-callback" />;
  },
}));
vi.mock('@/components/shared/auth-background', () => ({
  AuthBackground: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
}));

import SSOCallbackPage from '../page';

describe('SSOCallbackPage magic link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '', assign: vi.fn(), replace: vi.fn() },
    });
  });

  it('does not run the already-authenticated redirect when token_hash is present', () => {
    h.query.value = 'token_hash=abc&type=magiclink&next=/dashboard';
    render(<SSOCallbackPage />);

    expect(screen.getByTestId('mock-oauth-callback')).toBeInTheDocument();
    expect(h.redirectIfAuthenticated).not.toHaveBeenCalled();
  });

  it('hard-navigates to the next path on success', () => {
    h.query.value = 'token_hash=abc&type=magiclink&next=/leads%3Ftab%3Dnew';
    render(<SSOCallbackPage />);

    const { onSuccess } = h.oauthProps.mock.calls[0][0] as { onSuccess: () => void };
    onSuccess();
    expect(window.location.href).toBe('/leads?tab=new');
  });

  it('falls back to /dashboard for an off-origin next', () => {
    h.query.value = 'token_hash=abc&type=magiclink&next=https://evil.example.net';
    render(<SSOCallbackPage />);

    const { onSuccess } = h.oauthProps.mock.calls[0][0] as { onSuccess: () => void };
    onSuccess();
    expect(window.location.href).toBe('/dashboard');
  });

  it('keeps the OAuth behaviour (redirect hook, "/" landing) without token_hash', () => {
    h.query.value = 'code=xyz&nonce=n';
    render(<SSOCallbackPage />);

    expect(h.redirectIfAuthenticated).toHaveBeenCalledWith('/');
    const { onSuccess } = h.oauthProps.mock.calls[0][0] as { onSuccess: () => void };
    onSuccess();
    expect(window.location.href).toBe('/');
  });
});
