import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';

// The shared empty state decides its own call to action by phase; this tab only passes it the
// compose link, so a stub that renders what it is given is enough (as the lead page test does).
vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/ui')>()),
  EmptyState: ({
    entity,
    ctaHref,
    ctaLabel,
    showCta,
  }: Readonly<{
    entity?: string;
    ctaHref?: string;
    ctaLabel?: string;
    showCta?: boolean;
    children?: ReactNode;
  }>) => (
    <div data-testid={`empty-state-${entity}`}>
      {`No ${entity} yet`}
      {showCta !== false && ctaHref ? <a href={ctaHref}>{ctaLabel}</a> : null}
    </div>
  ),
}));

// The drafted-replies panel has its own tests; here it only shows which lead it was given.
vi.mock('@/components/contacts/ReplyDraftsPanel', () => ({
  ReplyDraftsPanel: ({ leadId }: Readonly<{ leadId?: string }>) => (
    <div data-testid="reply-drafts-for-lead">{leadId}</div>
  ),
}));

// The opened message has its own tests; here it only shows which mail it was given.
vi.mock('@/components/leads/LeadEmailMessage', () => ({
  LeadEmailMessage: ({
    leadId,
    emailRecordId,
  }: Readonly<{ leadId: string; emailRecordId: string }>) => (
    <div data-testid="opened-message">{`${leadId}/${emailRecordId}`}</div>
  ),
}));

import { LeadEmailsTab } from '../LeadEmailsTab';
import type { LeadEmailRow } from '@/lib/leads/lead-emails';

const row = (overrides: Partial<LeadEmailRow> = {}): LeadEmailRow => ({
  id: 'act-1',
  subject: 'Re: Proposal',
  status: 'sent',
  direction: null,
  sentAt: '2026-11-14T09:00:00.000Z',
  openCount: 0,
  ...overrides,
});

const renderTab = (emails: LeadEmailRow[], onOpenActivity = vi.fn()) =>
  render(
    <LeadEmailsTab
      leadId="lead-1"
      emails={emails}
      timezone="Europe/London"
      leadEmail="ada@example.invalid"
      onOpenActivity={onOpenActivity}
    />
  );

describe('LeadEmailsTab', () => {
  it('labels mail received from the lead "Received", and the mail sent to them "Sent"', () => {
    renderTab([
      row({ id: 'in', subject: 'Re: Proposal', direction: 'inbound' }),
      row({ id: 'out', subject: 'Proposal', direction: 'outbound' }),
    ]);

    const labels = screen.getAllByTestId('email-row-label').map((label) => label.textContent);
    expect(labels).toEqual(['Received', 'Sent']);
  });

  it('keeps "Sent" for mail logged before the direction was recorded, and "Opened" for opened mail', () => {
    renderTab([
      row({ id: 'old', direction: null }),
      row({ id: 'opened', status: 'opened', direction: 'outbound', openCount: 2 }),
    ]);

    const labels = screen.getAllByTestId('email-row-label').map((label) => label.textContent);
    expect(labels).toEqual(['Sent', 'Opened 2x']);
  });

  it('opens a row in the activity timeline', () => {
    const onOpenActivity = vi.fn();
    renderTab([row({ id: 'in', direction: 'inbound' })], onOpenActivity);

    fireEvent.click(screen.getByRole('button', { name: /Open "Re: Proposal"/ }));

    expect(onOpenActivity).toHaveBeenCalledWith('in');
  });

  it('composes to the lead from the header and the empty state', () => {
    const { unmount } = renderTab([row()]);
    expect(screen.getByRole('link', { name: /Compose/ })).toHaveAttribute(
      'href',
      '/email/compose?to=ada%40example.invalid'
    );
    unmount();

    renderTab([]);
    const empty = screen.getByTestId('empty-state-emails');
    expect(within(empty).getByRole('link', { name: 'Compose email' })).toHaveAttribute(
      'href',
      '/email/compose?to=ada%40example.invalid'
    );
  });

  it('offers no Compose when the lead has no address', () => {
    render(
      <LeadEmailsTab
        leadId="lead-1"
        emails={[]}
        timezone="Europe/London"
        leadEmail={null}
        onOpenActivity={vi.fn()}
      />
    );
    expect(screen.queryByRole('link', { name: /Compose/ })).not.toBeInTheDocument();
  });

  it('shows the replies Aurora drafted to this lead above its emails (MVP-012)', () => {
    renderTab([row()]);
    const panel = screen.getByTestId('reply-drafts-for-lead');
    expect(panel).toHaveTextContent('lead-1');
    // Above the list: a waiting reply is the first thing on the tab.
    const first = screen.getAllByTestId(/reply-drafts-for-lead|email-row-label/)[0];
    expect(first).toBe(panel);
  });

  it('opens the body of a mail that has a record in place, and closes it again', () => {
    renderTab([
      row({ id: 'a', subject: 'Quote', emailRecordId: 'rec-9' }),
      row({ id: 'b', subject: 'Old note', emailRecordId: null }),
    ]);
    // A row with no record behind it has nothing to read.
    expect(screen.queryByRole('button', { name: /Read "Old note"/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('opened-message')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Read "Quote"' }));
    expect(screen.getByTestId('opened-message')).toHaveTextContent('lead-1/rec-9');

    fireEvent.click(screen.getByRole('button', { name: 'Hide "Quote"' }));
    expect(screen.queryByTestId('opened-message')).not.toBeInTheDocument();
  });
});
