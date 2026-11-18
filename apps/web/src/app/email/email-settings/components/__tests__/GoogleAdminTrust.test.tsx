/**
 * @vitest-environment jsdom
 *
 * MVP-011: Google is asked for read as well as send. A Workspace domain whose admin does not trust
 * Aurora refuses that: the mailbox sends only, and a plain card asks the user to get their admin to
 * trust Aurora, with the client ID and the four Admin console steps.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { NO_SMTP_ENDPOINT, smtpAccountSummary, type MailboxDto } from '@intelliflow/validators';

const api = vi.hoisted(() => ({
  oauthStart: { mutateAsync: vi.fn(), isPending: false },
  testConnection: { mutateAsync: vi.fn(), isPending: false },
  disconnect: { mutateAsync: vi.fn(), isPending: false },
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    emailMailbox: {
      oauthStart: { useMutation: () => api.oauthStart },
      testConnection: { useMutation: () => api.testConnection },
      disconnect: { useMutation: () => api.disconnect },
    },
  },
}));
vi.mock('../SendFromHint', () => ({ SendFromHint: () => null }));

import { MyMailboxCard } from '../MyMailboxCard';
import { ADMIN_TRUST_STEPS } from '../GoogleAdminTrust';

const CLIENT_ID = ['1234', 'apps.googleusercontent.example.invalid'].join('-');

const gmailMailbox = (over: Partial<MailboxDto> = {}): MailboxDto =>
  ({
    id: 'mb1',
    scope: 'USER',
    kind: 'GMAIL',
    status: 'ACTIVE',
    lastErrorCode: null,
    fromAddress: 'owner@studio.example.invalid',
    fromName: null,
    ...NO_SMTP_ENDPOINT,
    ...smtpAccountSummary(null, false),
    imapHost: null,
    imapPort: null,
    imapUsername: null,
    hasImapPassword: false,
    bounceReadingEnabled: false,
    accountAddress: 'owner@studio.example.invalid',
    replySync: 'NEEDS_ADMIN_TRUST',
    updatedAt: '2026-11-18T00:00:00.000Z',
    ...over,
  }) as MailboxDto;

function renderCard(props: Partial<Parameters<typeof MyMailboxCard>[0]> = {}) {
  return render(
    <MyMailboxCard
      mailbox={null}
      providersAvailable={{ GMAIL: true, MICROSOFT: false, ZOHO: false }}
      companyFallbackAddress={null}
      onChanged={vi.fn()}
      announce={vi.fn()}
      googleClientId={CLIENT_ID}
      {...props}
    />
  );
}

const assign = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, assign },
  });
  api.oauthStart.mutateAsync.mockResolvedValue({
    url: 'https://accounts.google.example.invalid/auth?state=g1',
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('a Google mailbox that sends only (MVP-011)', () => {
  it('shows the admin-trust card with the client ID and the four steps', () => {
    renderCard({ mailbox: gmailMailbox() });
    const card = screen.getByRole('region', {
      name: 'Ask your Google Workspace admin to trust Aurora',
    });
    expect(card).toHaveTextContent('This Google mailbox is connected for sending only.');
    expect(card).toHaveTextContent('email you send still leaves from this mailbox');
    const steps = within(card).getAllByRole('listitem');
    expect(steps.map((s) => s.textContent)).toEqual([...ADMIN_TRUST_STEPS]);
    expect(steps).toHaveLength(4);
    expect(within(card).getByLabelText('Aurora client ID')).toHaveValue(CLIENT_ID);
    expect(screen.queryByTestId('inbox-sync-status')).not.toBeInTheDocument();
  });

  it('connects again with reading once the admin has trusted Aurora', async () => {
    renderCard({ mailbox: gmailMailbox() });
    fireEvent.click(screen.getByRole('button', { name: 'Connect again' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(api.oauthStart.mutateAsync).toHaveBeenCalledWith({ provider: 'GMAIL', scope: 'USER' });
  });

  it('shows the sync line instead once Google granted reading', () => {
    renderCard({ mailbox: gmailMailbox({ replySync: 'ON' }) });
    expect(screen.queryByTestId('google-admin-trust')).not.toBeInTheDocument();
    expect(screen.getByTestId('inbox-sync-status')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderCard({ mailbox: gmailMailbox() });
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});

describe('when Google blocks the sign-in (MVP-011)', () => {
  it('offers the admin steps and a sign-in for sending only', async () => {
    renderCard();
    const help = screen.getByTestId('google-blocked-help');
    expect(help).toHaveTextContent('Google blocked the sign-in?');
    expect(within(help).getByLabelText('Aurora client ID')).toHaveValue(CLIENT_ID);
    fireEvent.click(within(help).getByRole('button', { name: 'Connect for sending only' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(api.oauthStart.mutateAsync).toHaveBeenCalledWith({
      provider: 'GMAIL',
      scope: 'USER',
      sendOnly: true,
    });
    expect(sessionStorage.getItem('email-oauth-provider:g1')).toBe('GMAIL');
  });

  it('is not offered when Google is not set up on this server', () => {
    renderCard({ providersAvailable: { GMAIL: false, MICROSOFT: true, ZOHO: false } });
    expect(screen.queryByTestId('google-blocked-help')).not.toBeInTheDocument();
  });

  it('still shows the steps without a client ID to copy', () => {
    renderCard({ googleClientId: null });
    const help = screen.getByTestId('google-blocked-help');
    expect(within(help).getAllByRole('listitem')).toHaveLength(4);
    expect(within(help).queryByLabelText('Aurora client ID')).not.toBeInTheDocument();
  });
});
