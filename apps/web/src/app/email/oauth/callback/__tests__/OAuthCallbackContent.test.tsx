/**
 * @vitest-environment jsdom
 */
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ replace: nav.replace }),
}));
const complete = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/lib/trpc', () => ({
  trpc: { emailMailbox: { oauthComplete: { useMutation: () => complete } } },
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));

import OAuthCallbackContent from '../OAuthCallbackContent';
import { oauthProviderKey } from '../../oauth-session';

const STATE = 's'.repeat(43);
const CODE = 'c'.repeat(30);

function renderAt(query: string) {
  nav.params = new URLSearchParams(query);
  return render(
    <StrictMode>
      <OAuthCallbackContent />
    </StrictMode>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  complete.mutateAsync.mockResolvedValue({ id: 'mb1' });
});

describe('OAuthCallbackContent', () => {
  it('completes once (even under StrictMode) and returns to Email Settings', async () => {
    sessionStorage.setItem(oauthProviderKey(STATE), 'GMAIL');
    renderAt(`code=${CODE}&state=${STATE}`);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Connecting your mailbox' })
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Finishing the sign-in…');
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith('/email/email-settings?connected=google')
    );
    expect(complete.mutateAsync).toHaveBeenCalledTimes(1);
    expect(complete.mutateAsync).toHaveBeenCalledWith({
      provider: 'GMAIL',
      code: CODE,
      state: STATE,
    });
    expect(sessionStorage.getItem(oauthProviderKey(STATE))).toBeNull();
  });

  it('returns to Microsoft as connected=microsoft', async () => {
    sessionStorage.setItem(oauthProviderKey(STATE), 'MICROSOFT');
    renderAt(`code=${CODE}&state=${STATE}`);
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith('/email/email-settings?connected=microsoft')
    );
  });

  it('sends a cancelled sign-in back with error=denied and completes nothing', async () => {
    renderAt(`error=access_denied&state=${STATE}`);
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith('/email/email-settings?error=denied')
    );
    expect(complete.mutateAsync).not.toHaveBeenCalled();
  });

  it('explains an incomplete link, with a way back', async () => {
    renderAt(`state=${STATE}`);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This sign-in link is incomplete.');
    expect(screen.getByRole('link', { name: 'Back to Email Settings' })).toHaveAttribute(
      'href',
      '/email/email-settings'
    );
    expect(complete.mutateAsync).not.toHaveBeenCalled();
  });

  it('asks to start again when the sign-in was not started in this browser', async () => {
    renderAt(`code=${CODE}&state=${STATE}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Start the sign-in again from Email Settings.'
    );
    expect(complete.mutateAsync).not.toHaveBeenCalled();
  });

  it('shows a failure as an alert that receives focus', async () => {
    sessionStorage.setItem(oauthProviderKey(STATE), 'GMAIL');
    complete.mutateAsync.mockRejectedValue(new Error('This sign-in has expired.'));
    renderAt(`code=${CODE}&state=${STATE}`);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The mailbox could not be connected.');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('has no axe violations while working or failed', async () => {
    sessionStorage.setItem(oauthProviderKey(STATE), 'GMAIL');
    complete.mutateAsync.mockReturnValue(new Promise(() => undefined));
    const working = renderAt(`code=${CODE}&state=${STATE}`);
    expect((await axe.run(working.container)).violations).toEqual([]);
    working.unmount();
    const failed = renderAt(`state=${STATE}`);
    await screen.findByRole('alert');
    expect((await axe.run(failed.container)).violations).toEqual([]);
  });
});
