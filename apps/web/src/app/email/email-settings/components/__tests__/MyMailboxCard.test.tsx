/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import type { MailboxDto } from '@intelliflow/validators';

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
vi.mock('../SmtpMailboxForm', () => ({
  SmtpMailboxForm: (p: { scope: string; onSaved: (d: unknown) => void; onCancel: () => void }) => (
    <div data-testid="smtp-form">
      form for {p.scope}
      <button type="button" onClick={() => p.onSaved({})}>
        stub save
      </button>
      <button type="button" onClick={p.onCancel}>
        stub cancel
      </button>
    </div>
  ),
}));

import { MyMailboxCard } from '../MyMailboxCard';

const mailbox = (over: Partial<MailboxDto> = {}): MailboxDto => ({
  id: 'mb1',
  scope: 'USER',
  kind: 'SMTP',
  status: 'ACTIVE',
  lastErrorCode: null,
  fromAddress: 'me@mail.example.invalid',
  fromName: null,
  smtpHost: 'smtp.mail.example.invalid',
  smtpPort: 587,
  smtpSecurity: 'STARTTLS',
  smtpUsername: 'me@mail.example.invalid',
  hasSmtpPassword: true,
  imapHost: null,
  imapPort: null,
  imapUsername: null,
  hasImapPassword: false,
  bounceReadingEnabled: false,
  accountAddress: null,
  updatedAt: '2026-10-20T00:00:00.000Z',
  ...over,
});

function renderCard(props: Partial<Parameters<typeof MyMailboxCard>[0]> = {}) {
  const onChanged = vi.fn();
  const announce = vi.fn();
  const utils = render(
    <MyMailboxCard
      mailbox={null}
      providersAvailable={{ GMAIL: true, MICROSOFT: false }}
      companyFallbackAddress={null}
      onChanged={onChanged}
      announce={announce}
      {...props}
    />
  );
  return { onChanged, announce, ...utils };
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
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('MyMailboxCard', () => {
  it('is a labelled section with one h2', () => {
    renderCard();
    expect(screen.getByRole('region', { name: 'My mailbox' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'My mailbox' })).toBeInTheDocument();
  });

  it('explains how to connect when nothing is connected', () => {
    renderCard();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByText('Connect your mailbox to send email.')).toBeInTheDocument();
  });

  it('disables an unconfigured provider and says why in visible text', () => {
    renderCard();
    const microsoft = screen.getByRole('button', { name: 'Connect Microsoft' });
    expect(microsoft).toBeDisabled();
    expect(screen.getByText('Microsoft sign-in is not set up on this server yet.')).toBeVisible();
    expect(microsoft).toHaveAccessibleDescription(
      'Microsoft sign-in is not set up on this server yet.'
    );
    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeEnabled();
  });

  it('starts Google sign-in, remembers the provider for this state and redirects', async () => {
    api.oauthStart.mutateAsync.mockResolvedValue({
      url: 'https://accounts.google.example.invalid/auth?client_id=x&state=s123',
    });
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Google' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(api.oauthStart.mutateAsync).toHaveBeenCalledWith({ provider: 'GMAIL', scope: 'USER' });
    expect(sessionStorage.getItem('email-oauth-provider:s123')).toBe('GMAIL');
    expect(assign).toHaveBeenCalledWith(
      'https://accounts.google.example.invalid/auth?client_id=x&state=s123'
    );
  });

  it('shows why a sign-in could not start', async () => {
    api.oauthStart.mutateAsync.mockRejectedValue(new Error('Google sign-in is not available.'));
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Google sign-in is not available.');
    expect(assign).not.toHaveBeenCalled();
  });

  it('opens the SMTP form (loaded on demand) and closes it after saving', async () => {
    const { onChanged } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Set Up SMTP' }));
    expect(await screen.findByTestId('smtp-form')).toHaveTextContent('form for USER');
    fireEvent.click(screen.getByRole('button', { name: 'stub save' }));
    expect(onChanged).toHaveBeenCalled();
    expect(screen.queryByTestId('smtp-form')).not.toBeInTheDocument();
  });

  it('shows a connected SMTP mailbox with its server', () => {
    renderCard({ mailbox: mailbox() });
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('me@mail.example.invalid')).toBeInTheDocument();
    expect(screen.getByText('SMTP · smtp.mail.example.invalid')).toBeInTheDocument();
  });

  it('shows a connected Google mailbox by its verified address', () => {
    renderCard({
      mailbox: mailbox({
        kind: 'GMAIL',
        smtpHost: null,
        accountAddress: 'me@gmail.example.invalid',
        fromAddress: 'me@gmail.example.invalid',
      }),
    });
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('me@gmail.example.invalid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit SMTP Settings' })).not.toBeInTheDocument();
  });

  it('tests the connection and announces the result', async () => {
    api.testConnection.mutateAsync.mockResolvedValue({ ok: true, code: null });
    const { announce } = renderCard({ mailbox: mailbox() });
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
    expect(await screen.findByText('Connection works.')).toBeInTheDocument();
    expect(api.testConnection.mutateAsync).toHaveBeenCalledWith({ scope: 'USER' });
    expect(announce).toHaveBeenCalledWith('Connection works.');
  });

  it('reports a failed test with a specific reason', async () => {
    api.testConnection.mutateAsync.mockResolvedValue({ ok: false, code: 'AUTH_FAILED' });
    const { onChanged } = renderCard({ mailbox: mailbox() });
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
    expect(await screen.findByText(/refused the sign-in/)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it('cannot test while the SMTP form is open', async () => {
    renderCard({ mailbox: mailbox() });
    fireEvent.click(screen.getByRole('button', { name: 'Edit SMTP Settings' }));
    await screen.findByTestId('smtp-form');
    expect(screen.getByRole('button', { name: 'Test Connection' })).toBeDisabled();
  });

  it('flags a broken mailbox with the reason and a way to reconnect', () => {
    renderCard({
      mailbox: mailbox({ kind: 'GMAIL', status: 'ERROR', lastErrorCode: 'TOKEN_REVOKED' }),
    });
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText(/Access to your mailbox was revoked/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeEnabled();
  });

  it('confirms a disconnect naming what happens next, then disconnects', async () => {
    api.disconnect.mutateAsync.mockResolvedValue({ disconnected: true });
    const { onChanged } = renderCard({
      mailbox: mailbox(),
      companyFallbackAddress: 'team@mail.example.invalid',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Your email will be sent from the company mailbox (team@mail.example.invalid) instead.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Mailbox' }));
    await waitFor(() => expect(api.disconnect.mutateAsync).toHaveBeenCalledWith({ scope: 'USER' }));
    expect(onChanged).toHaveBeenCalled();
  });

  it('says sending stops when there is no company fallback', async () => {
    renderCard({ mailbox: mailbox() });
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'You will not be able to send email until you connect a mailbox again.'
    );
  });

  it('has no axe violations when connected and when not', async () => {
    for (const m of [null, mailbox()]) {
      const { container, unmount } = renderCard({ mailbox: m });
      const results = await axe.run(container);
      expect(results.violations).toEqual([]);
      unmount();
    }
  });
});
