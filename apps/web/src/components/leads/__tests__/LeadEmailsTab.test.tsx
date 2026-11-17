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
        emails={[]}
        timezone="Europe/London"
        leadEmail={null}
        onOpenActivity={vi.fn()}
      />
    );
    expect(screen.queryByRole('link', { name: /Compose/ })).not.toBeInTheDocument();
  });
});
