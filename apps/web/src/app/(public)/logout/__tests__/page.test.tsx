/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  logout: vi.fn(),
  cleanupSession: vi.fn(),
  performLogoutRedirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ logout: h.logout }),
}));

vi.mock('@/components/shared', () => ({
  AuthBackground: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/shared/session-cleanup', () => ({
  cleanupSession: h.cleanupSession,
}));

vi.mock('@/lib/shared/logout-redirect', () => ({
  parseLogoutReason: () => null,
  parseReturnUrl: () => null,
  getLogoutMessage: () => 'You have been signed out.',
  performLogoutRedirect: h.performLogoutRedirect,
}));

import LogoutPage from '../page';

describe('LogoutPage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('logs out, cleans the session and shows the signed-out state', async () => {
    h.logout.mockResolvedValue(undefined);
    h.cleanupSession.mockResolvedValue({ success: true, errors: [] });

    render(<LogoutPage />);

    expect(await screen.findByRole('heading', { name: 'Signed Out' })).toBeInTheDocument();
    expect(h.cleanupSession).toHaveBeenCalledTimes(1);
  });

  it('warns but still completes when some cleanup operations fail', async () => {
    h.logout.mockResolvedValue(undefined);
    h.cleanupSession.mockResolvedValue({ success: false, errors: ['cookies'] });

    render(<LogoutPage />);

    expect(await screen.findByRole('heading', { name: 'Signed Out' })).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalled();
  });

  it('shows the error state with the failure message when auth.logout rejects', async () => {
    h.logout.mockRejectedValue(new Error('server said no'));
    h.cleanupSession.mockResolvedValue({ success: true, errors: [] });

    render(<LogoutPage />);

    expect(await screen.findByRole('heading', { name: 'Logout Error' })).toBeInTheDocument();
    expect(screen.getByText('server said no')).toBeInTheDocument();
    expect(h.cleanupSession).toHaveBeenCalledWith({ broadcastLogout: true });
  });

  it('surfaces the error state when the fallback cleanup also rejects', async () => {
    h.logout.mockRejectedValue(new Error('server said no'));
    h.cleanupSession.mockRejectedValue(new Error('cleanup exploded'));

    render(<LogoutPage />);

    await waitFor(() => expect(screen.getByText('cleanup exploded')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Logout Error' })).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith(
      '[Logout] Cleanup after logout failure also failed:',
      expect.any(Error)
    );
  });

  it('uses a generic message when the fallback cleanup rejects with a non-Error', async () => {
    h.logout.mockRejectedValue(new Error('server said no'));
    h.cleanupSession.mockRejectedValue('boom');

    render(<LogoutPage />);

    expect(await screen.findByText('An error occurred during logout')).toBeInTheDocument();
  });
});
