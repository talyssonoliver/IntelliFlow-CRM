/**
 * @vitest-environment jsdom
 *
 * MVP-012: a reply Aurora drafted waits on the contact for Send, Edit or Dismiss. Only the Send
 * click sends it; Edit opens it in Compose; Dismiss sets it aside.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';

type Draft = { id: string; draftSubject: string; draftBody: string; status: string };

const api = vi.hoisted(() => ({
  drafts: [] as Draft[],
  leadDrafts: [] as Draft[],
  isLoading: false,
  leadQueries: [] as unknown[],
  send: { mutateAsync: vi.fn(), isPending: false },
  openInCompose: { mutateAsync: vi.fn(), isPending: false },
  dismiss: { mutateAsync: vi.fn(), isPending: false },
  invalidate: vi.fn(async () => undefined),
  invalidateLead: vi.fn(async () => undefined),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: api.push }) }));
vi.mock('@intelliflow/api-client', () => ({
  trpc: {
    useUtils: () => ({
      contact: { listReplyDrafts: { invalidate: api.invalidate } },
      replyDraft: { listForLead: { invalidate: api.invalidateLead } },
    }),
    contact: {
      listReplyDrafts: {
        useQuery: (_input: unknown, options?: { enabled?: boolean }) => ({
          data: options?.enabled ? { drafts: api.drafts } : undefined,
          isLoading: api.isLoading,
        }),
      },
    },
    replyDraft: {
      listForLead: {
        useQuery: (input: unknown, options?: { enabled?: boolean }) => {
          if (options?.enabled) api.leadQueries.push(input);
          return {
            data: options?.enabled ? { drafts: api.leadDrafts } : undefined,
            isLoading: false,
          };
        },
      },
      send: { useMutation: () => api.send },
      openInCompose: { useMutation: () => api.openInCompose },
      dismiss: { useMutation: () => api.dismiss },
    },
  },
}));

import { ReplyDraftsPanel, WAITING_TITLE } from '../ReplyDraftsPanel';

const waiting: Draft = {
  id: 'd1',
  draftSubject: 'Re: Gutter repair',
  draftBody: 'Hi Sam,\n\nFriday at 10 works.',
  status: 'DRAFT',
};

beforeEach(() => {
  vi.clearAllMocks();
  api.drafts = [waiting];
  api.leadDrafts = [];
  api.leadQueries = [];
  api.isLoading = false;
  api.send.mutateAsync.mockResolvedValue({ id: 'e1', status: 'SENT', skipped: [] });
  api.openInCompose.mutateAsync.mockResolvedValue({ emailDraftId: 'em/9' });
  api.dismiss.mutateAsync.mockResolvedValue({ dismissed: true });
});

const renderPanel = () => render(<ReplyDraftsPanel contactId="c-1" enabled />);

describe('ReplyDraftsPanel (MVP-012)', () => {
  it('shows a waiting draft in full, with Send, Edit and Dismiss', () => {
    renderPanel();
    const item = screen.getByTestId('reply-draft-item');
    expect(item).toHaveTextContent(WAITING_TITLE);
    expect(item).toHaveTextContent('Reply drafted by Aurora: waiting for you');
    expect(item).toHaveTextContent('Re: Gutter repair');
    expect(item).toHaveTextContent('Friday at 10 works.');
    for (const name of ['Send', 'Edit', 'Dismiss']) {
      expect(within(item).getByRole('button', { name })).toBeEnabled();
    }
  });

  it('sends nothing until Send is clicked', () => {
    renderPanel();
    expect(api.send.mutateAsync).not.toHaveBeenCalled();
    expect(api.openInCompose.mutateAsync).not.toHaveBeenCalled();
    expect(api.dismiss.mutateAsync).not.toHaveBeenCalled();
  });

  it('Send sends that draft, says so and refreshes the list', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByTestId('reply-draft-notice')).toHaveTextContent(
      'Reply sent from your mailbox.'
    );
    expect(api.send.mutateAsync).toHaveBeenCalledWith({ draftId: 'd1' });
    expect(api.invalidate).toHaveBeenCalledWith({ contactId: 'c-1' });
  });

  it('shows why a send failed, as Compose does', async () => {
    api.send.mutateAsync.mockRejectedValue(
      Object.assign(new Error('x'), {
        data: { emailSendError: { code: 'NO_MAILBOX', mailboxErrorCode: null, skipped: [] } },
      })
    );
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/mailbox/i);
  });

  it('Edit opens the draft in Compose and sends nothing', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(api.push).toHaveBeenCalledWith('/email/compose?draftId=em%2F9'));
    expect(api.openInCompose.mutateAsync).toHaveBeenCalledWith({ draftId: 'd1' });
    expect(api.send.mutateAsync).not.toHaveBeenCalled();
  });

  it('Dismiss sets the draft aside and sends nothing', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(api.invalidate).toHaveBeenCalled());
    expect(api.dismiss.mutateAsync).toHaveBeenCalledWith({ draftId: 'd1' });
    expect(api.send.mutateAsync).not.toHaveBeenCalled();
  });

  it('shows a draft already acted on without actions, and hides dismissed ones', () => {
    api.drafts = [
      { ...waiting, id: 'd2', status: 'SENT' },
      { ...waiting, id: 'd3', status: 'EDITED', draftSubject: 'Re: Fence' },
      { ...waiting, id: 'd4', status: 'DISMISSED', draftSubject: 'Re: Gone' },
    ];
    renderPanel();
    expect(screen.getAllByTestId('reply-draft-item')).toHaveLength(2);
    expect(screen.getByText('Sent from your mailbox.')).toBeInTheDocument();
    expect(
      screen.getByText('Opened in Compose. Find it in your email drafts.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Re: Gone')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  });

  it('renders nothing without drafts, and nothing when disabled', () => {
    api.drafts = [];
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
    const off = render(<ReplyDraftsPanel contactId="c-1" enabled={false} />);
    expect(off.container).toBeEmptyDOMElement();
  });

  it('has no axe violations', async () => {
    const { container } = renderPanel();
    expect((await axe.run(container)).violations).toEqual([]);
  });
});

describe('ReplyDraftsPanel on a lead (MVP-012 PR B)', () => {
  it('shows the lead’s drafts, read through listForLead, with the same actions', async () => {
    api.drafts = [];
    api.leadDrafts = [{ ...waiting, id: 'ld1', draftSubject: 'Re: Fence repair quote' }];
    render(<ReplyDraftsPanel leadId="lead-1" enabled />);
    expect(api.leadQueries).toEqual([{ leadId: 'lead-1', limit: 5 }]);
    const item = screen.getByTestId('reply-draft-item');
    expect(item).toHaveTextContent(WAITING_TITLE);
    expect(item).toHaveTextContent('Re: Fence repair quote');
    fireEvent.click(within(item).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(api.send.mutateAsync).toHaveBeenCalledWith({ draftId: 'ld1' }));
    await waitFor(() => expect(api.invalidateLead).toHaveBeenCalledWith({ leadId: 'lead-1' }));
    expect(api.invalidate).not.toHaveBeenCalled();
  });

  it('does not read the lead’s drafts on a contact', () => {
    render(<ReplyDraftsPanel contactId="c-1" enabled />);
    expect(api.leadQueries).toEqual([]);
  });
});
