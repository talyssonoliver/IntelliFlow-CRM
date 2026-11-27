// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const m = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: { emailLog: { leadEmail: { useQuery: m.query } } },
}));
vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'America/New_York' }),
}));
vi.mock('@/components/email/EmailBody', () => ({
  EmailBody: (props: { emailId: string; htmlBody?: string; textBody?: string }) => (
    <div data-testid="body">{`${props.emailId}|${props.htmlBody ?? ''}|${props.textBody ?? ''}`}</div>
  ),
}));

import { LeadEmailMessage } from '../LeadEmailMessage';

const email = {
  id: 'rec-1',
  from: { address: 'robert@lead.example.invalid', name: 'Robert' },
  to: [{ address: 'me@example.invalid' }],
  receivedAt: '2026-11-14T09:00:00.000Z',
  htmlBody: '<p>Hi</p>',
  textBody: undefined,
  attachments: [],
};

describe('LeadEmailMessage', () => {
  it("shows the mail's header and hands its body to the shared renderer", () => {
    m.query.mockReturnValue({ isLoading: false, data: email });
    render(<LeadEmailMessage leadId="lead-1" emailRecordId="rec-1" />);
    expect(m.query).toHaveBeenCalledWith(
      { leadId: 'lead-1', emailRecordId: 'rec-1' },
      expect.anything()
    );
    expect(screen.getByText(/Robert <robert@lead\.example\.invalid>/)).toBeInTheDocument();
    expect(screen.getByTestId('body')).toHaveTextContent('rec-1|<p>Hi</p>|');
  });

  it('says so while loading and when the mail is not in the lead thread', () => {
    m.query.mockReturnValue({ isLoading: true, data: undefined });
    const { unmount } = render(<LeadEmailMessage leadId="lead-1" emailRecordId="rec-1" />);
    expect(screen.getByText('Loading the message...')).toBeInTheDocument();
    unmount();
    m.query.mockReturnValue({
      isLoading: false,
      isError: true,
      error: { data: { code: 'NOT_FOUND' } },
      data: undefined,
    });
    render(<LeadEmailMessage leadId="lead-1" emailRecordId="rec-1" />);
    expect(screen.getByText('This message is no longer available.')).toBeInTheDocument();
  });

  it("shows the mail's time in the user's timezone, not the browser's", () => {
    m.query.mockReturnValue({
      isLoading: false,
      data: { ...email, receivedAt: '2026-11-14T01:00:00.000Z' },
    });
    render(<LeadEmailMessage leadId="lead-1" emailRecordId="rec-1" />);
    // 01:00 UTC on the 14th is 20:00 on the 13th in New York.
    expect(screen.getByText(/13\/11\/2026, 20:00/)).toBeInTheDocument();
  });

  it('trims the card padding below sm so the mail keeps its width on a phone', () => {
    m.query.mockReturnValue({ isLoading: false, data: email });
    const { container } = render(<LeadEmailMessage leadId="lead-1" emailRecordId="rec-1" />);
    const card = (container.firstElementChild?.getAttribute('class') ?? '').split(/\s+/);
    expect(card).toEqual(expect.arrayContaining(['max-sm:px-1.5', 'p-3']));
  });

  it('clears a cached mail when a refetch says it is gone', () => {
    m.query.mockReturnValue({
      isLoading: false,
      isError: true,
      error: { data: { code: 'NOT_FOUND' } },
      data: email,
    });
    render(<LeadEmailMessage leadId="lead-1" emailRecordId="rec-1" />);
    expect(screen.getByText('This message is no longer available.')).toBeInTheDocument();
    expect(screen.queryByTestId('body')).toBeNull();
  });

  it('says it could not load, rather than that the mail is gone, when the query fails', () => {
    m.query.mockReturnValue({
      isLoading: false,
      isError: true,
      error: { data: { code: 'INTERNAL_SERVER_ERROR' } },
      data: undefined,
    });
    render(<LeadEmailMessage leadId="lead-1" emailRecordId="rec-1" />);
    expect(screen.getByText('Could not load the message. Try again.')).toBeInTheDocument();
  });
});
