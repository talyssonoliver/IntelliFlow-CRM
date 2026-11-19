/**
 * @vitest-environment jsdom
 *
 * MVP-013: the Google sign-in also asks to use the calendar. When the user left that unticked (or
 * connected before it was asked for), a plain card says the calendar is not connected and offers the
 * sign-in again; the mailbox keeps working. A domain that blocks reading is covered by the
 * admin-trust card instead, so the two never show together.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { GoogleCalendarAccess } from '../GoogleCalendarAccess';

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
    inboxSyncedAt: null,
    replySync: 'ON',
    calendarAccess: 'NOT_GRANTED',
    updatedAt: '2026-11-19T00:00:00.000Z',
    ...over,
  }) as MailboxDto;

function renderCard(props: Partial<Parameters<typeof MyMailboxCard>[0]> = {}) {
  return render(
    <MyMailboxCard
      mailbox={gmailMailbox()}
      providersAvailable={{ GMAIL: true, MICROSOFT: false, ZOHO: false }}
      companyFallbackAddress={null}
      onChanged={vi.fn()}
      announce={vi.fn()}
      googleClientId={null}
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

describe('a Google mailbox without the calendar permission (MVP-013)', () => {
  it('says the calendar is not connected, and that the mailbox keeps working', () => {
    renderCard();
    const card = screen.getByRole('region', { name: 'Google Calendar is not connected' });
    expect(card).toHaveTextContent('your appointments in Google Calendar');
    expect(card).toHaveTextContent('Your mailbox keeps working without it.');
  });

  it('signs in with Google again, which asks for the calendar too', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Google Calendar' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(api.oauthStart.mutateAsync).toHaveBeenCalledWith({ provider: 'GMAIL', scope: 'USER' });
    expect(sessionStorage.getItem('email-oauth-provider:g1')).toBe('GMAIL');
  });

  it('is not shown once the calendar is granted', () => {
    renderCard({ mailbox: gmailMailbox({ calendarAccess: 'GRANTED' }) });
    expect(screen.queryByTestId('google-calendar-access')).not.toBeInTheDocument();
  });

  it('is not shown for a mailbox with no calendar (null)', () => {
    renderCard({ mailbox: gmailMailbox({ calendarAccess: null }) });
    expect(screen.queryByTestId('google-calendar-access')).not.toBeInTheDocument();
  });

  it('gives way to the admin-trust card, which already covers a blocked domain', () => {
    renderCard({ mailbox: gmailMailbox({ replySync: 'NEEDS_ADMIN_TRUST' }) });
    expect(screen.queryByTestId('google-calendar-access')).not.toBeInTheDocument();
    expect(screen.getByTestId('google-admin-trust')).toHaveTextContent(
      'syncs your Google Calendar'
    );
  });

  it('is not shown on a broken mailbox, which asks to be reconnected first', () => {
    renderCard({ mailbox: gmailMailbox({ status: 'ERROR', lastErrorCode: 'TOKEN_REVOKED' }) });
    expect(screen.queryByTestId('google-calendar-access')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderCard();
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});

describe('GoogleCalendarAccess on its own', () => {
  it('offers no button when Google is not set up on this server', () => {
    render(<GoogleCalendarAccess idPrefix="x" pending={false} />);
    expect(screen.getByTestId('google-calendar-access')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('disables the button while a sign-in is starting', () => {
    render(<GoogleCalendarAccess idPrefix="x" pending onConnect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeDisabled();
  });
});
