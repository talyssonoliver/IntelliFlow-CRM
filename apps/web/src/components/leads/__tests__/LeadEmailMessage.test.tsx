// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const m = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: { emailLog: { leadEmails: { useQuery: m.query } } },
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
    m.query.mockReturnValue({ isLoading: false, data: { emails: [email] } });
    render(<LeadEmailMessage leadId="lead-1" emailRecordId="rec-1" />);
    expect(m.query).toHaveBeenCalledWith({ leadId: 'lead-1' }, expect.anything());
    expect(screen.getByText(/Robert <robert@lead\.example\.invalid>/)).toBeInTheDocument();
    expect(screen.getByTestId('body')).toHaveTextContent('rec-1|<p>Hi</p>|');
  });

  it('says so while loading and when the mail is not in the lead thread', () => {
    m.query.mockReturnValue({ isLoading: true, data: undefined });
    const { unmount } = render(<LeadEmailMessage leadId="lead-1" emailRecordId="rec-1" />);
    expect(screen.getByText('Loading the message...')).toBeInTheDocument();
    unmount();
    m.query.mockReturnValue({ isLoading: false, data: { emails: [] } });
    render(<LeadEmailMessage leadId="lead-1" emailRecordId="rec-1" />);
    expect(screen.getByText('This message is no longer available.')).toBeInTheDocument();
  });
});
