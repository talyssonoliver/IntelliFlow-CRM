/**
 * @vitest-environment jsdom
 */
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ replace: nav.replace }),
}));
const complete = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const restart = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    emailMailbox: {
      oauthComplete: { useMutation: () => complete },
      oauthStart: { useMutation: () => restart },
    },
  },
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));

import OAuthCallbackContent from '../OAuthCallbackContent';
import { oauthProviderKey, oauthSendOnlyKey } from '../../oauth-session';

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

  it("passes Zoho's accounts server on, and returns as connected=zoho", async () => {
    sessionStorage.setItem(oauthProviderKey(STATE), 'ZOHO');
    renderAt(
      `code=${CODE}&state=${STATE}&location=eu&accounts-server=${encodeURIComponent('https://accounts.zoho.eu')}`
    );
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith('/email/email-settings?connected=zoho')
    );
    expect(complete.mutateAsync).toHaveBeenCalledWith({
      provider: 'ZOHO',
      code: CODE,
      state: STATE,
      accountsServer: 'https://accounts.zoho.eu',
    });
  });

  it('never sends an accounts server for Google or Microsoft', async () => {
    sessionStorage.setItem(oauthProviderKey(STATE), 'MICROSOFT');
    renderAt(`code=${CODE}&state=${STATE}&accounts-server=https://accounts.example.invalid`);
    await waitFor(() => expect(complete.mutateAsync).toHaveBeenCalled());
    expect(complete.mutateAsync).toHaveBeenCalledWith({
      provider: 'MICROSOFT',
      code: CODE,
      state: STATE,
    });
  });

  it('sends a cancelled sign-in back with error=denied and completes nothing', async () => {
    renderAt(`error=access_denied&state=${STATE}`);
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith('/email/email-settings?error=denied')
    );
    expect(complete.mutateAsync).not.toHaveBeenCalled();
  });

  it('points a refused Google sign-in at the Workspace admin help (MVP-011)', async () => {
    sessionStorage.setItem(oauthProviderKey(STATE), 'GMAIL');
    renderAt(`error=access_denied&state=${STATE}`);
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith('/email/email-settings?error=google-denied')
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
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mailbox not connected');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('asks before connecting a personal mailbox and signs in again with the confirmation', async () => {
    sessionStorage.setItem(oauthProviderKey(STATE), 'GMAIL');
    complete.mutateAsync.mockRejectedValue(
      new Error(
        'PERSONAL_MAILBOX:USER: This looks like a personal mailbox. Aurora will import mail with your leads and contacts. Continue?'
      )
    );
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    restart.mutateAsync.mockResolvedValue({
      url: 'https://accounts.example.invalid/auth?state=' + 'n'.repeat(43),
    });
    renderAt(`code=${CODE}&state=${STATE}`);

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'This looks like a personal mailbox. Aurora will import mail with your leads and contacts. Continue?'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(restart.mutateAsync).toHaveBeenCalledWith({
      provider: 'GMAIL',
      scope: 'USER',
      acceptPersonal: true,
    });
    vi.unstubAllGlobals();
  });

  it('keeps a send-only sign-in send-only when it restarts after the confirmation', async () => {
    sessionStorage.setItem(oauthProviderKey(STATE), 'GMAIL');
    sessionStorage.setItem(oauthSendOnlyKey(STATE), '1');
    complete.mutateAsync.mockRejectedValue(new Error('PERSONAL_MAILBOX:USER: confirm'));
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const next = 'n'.repeat(43);
    restart.mutateAsync.mockResolvedValue({
      url: 'https://accounts.example.invalid/auth?state=' + next,
    });
    renderAt(`code=${CODE}&state=${STATE}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(restart.mutateAsync).toHaveBeenCalledWith({
      provider: 'GMAIL',
      scope: 'USER',
      acceptPersonal: true,
      sendOnly: true,
    });
    expect(sessionStorage.getItem(oauthSendOnlyKey(next))).toBe('1');
    vi.unstubAllGlobals();
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
