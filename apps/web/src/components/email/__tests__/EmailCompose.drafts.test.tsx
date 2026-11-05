// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { armComposeMocks, createMockEmailTrpc } from './email-test-utils';

const { trpc: mockTrpc, mocks } = createMockEmailTrpc();

vi.mock('@/lib/trpc', () => ({ trpc: mockTrpc }));
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (value: string) => value }));

const { EmailCompose } = await import('../EmailCompose');

const ADDRESS = 'pat@northwind.example.invalid';
const DRAFT = {
  id: 'draft-9',
  to: ['sam@client.example.invalid'],
  cc: ['cc@client.example.invalid'],
  bcc: ['bcc@client.example.invalid'],
  subject: 'Draft to finish',
  htmlBody: '<p>Half written</p><img src="x" onerror="alert(1)">',
  threadId: 'thread-3',
};

let saveDraft: ReturnType<typeof vi.fn>;
let send: ReturnType<typeof vi.fn>;
let processEmail: ReturnType<typeof vi.fn>;

const props = () => ({ mode: 'new' as const, onDiscard: vi.fn(), onSent: vi.fn() });

function identity(data: Record<string, unknown> | undefined) {
  mocks.sendingIdentity.mockReturnValue({ data, isLoading: false, isError: false });
}

function typeBody(html: string) {
  const body = screen.getByLabelText('Message body');
  body.innerHTML = html;
  fireEvent.input(body);
}

beforeEach(() => {
  vi.clearAllMocks();
  armComposeMocks(mocks);
  saveDraft = vi.fn().mockResolvedValue({ id: 'draft-1', status: 'DRAFT' });
  send = vi.fn().mockResolvedValue({ id: 'sent-1', status: 'SENT', skipped: [] });
  processEmail = vi.fn().mockResolvedValue({ success: true });
  mocks.saveDraft.mockReturnValue({ mutateAsync: saveDraft, isPending: false });
  mocks.sendEmail.mockReturnValue({ mutateAsync: send, isPending: false });
  mocks.processEmail.mockReturnValue({ mutateAsync: processEmail, isPending: false });
  identity(undefined);
});

describe('From', () => {
  it('shows who the message will be sent from', () => {
    identity({ address: ADDRESS, name: 'Pat', scope: 'USER', refusal: null });
    render(<EmailCompose {...props()} />);
    expect(screen.getByText(`Pat <${ADDRESS}>`)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /connect your mailbox/i })).not.toBeInTheDocument();
  });

  it('says when it is the company mailbox', () => {
    identity({ address: ADDRESS, name: null, scope: 'TENANT', refusal: null });
    render(<EmailCompose {...props()} />);
    expect(screen.getByText(ADDRESS)).toBeInTheDocument();
    expect(screen.getByText('(company mailbox)')).toBeInTheDocument();
  });

  it('offers to connect a mailbox up front, saving the draft before leaving', async () => {
    identity({ address: null, name: null, scope: null, refusal: 'NO_MAILBOX' });
    const onLeave = vi.fn();
    render(<EmailCompose {...props()} onLeave={onLeave} />);
    typeBody('<p>Keep this</p>');
    await act(async () => {});
    saveDraft.mockClear();
    fireEvent.click(screen.getByRole('link', { name: 'Connect your mailbox' }));
    await waitFor(() => expect(onLeave).toHaveBeenCalledWith('/email/email-settings'));
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ htmlBody: '<p>Keep this</p>' })
    );
  });

  it('points to Email Settings when the mailbox is broken', () => {
    identity({ address: null, name: null, scope: null, refusal: 'MAILBOX_ERROR' });
    render(<EmailCompose {...props()} />);
    expect(screen.getByText('Your mailbox needs attention.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Email Settings' })).toBeInTheDocument();
  });

  it('checks the sender again each time Compose opens', () => {
    render(<EmailCompose {...props()} />);
    expect(mocks.sendingIdentity).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ staleTime: 0, refetchOnMount: 'always' })
    );
  });

  it('says nothing until the server has answered', () => {
    render(<EmailCompose {...props()} />);
    expect(screen.queryByText('From')).not.toBeInTheDocument();
  });
});

describe('body', () => {
  it('focuses the end of the message when the blank space is pressed', () => {
    render(<EmailCompose {...props()} />);
    const body = screen.getByLabelText('Message body');
    body.innerHTML = '<p>Hello</p>';
    fireEvent.mouseDown(body.parentElement as HTMLElement);
    expect(document.activeElement).toBe(body);
    const selection = window.getSelection();
    expect(selection?.isCollapsed).toBe(true);
    expect(body.contains(selection?.anchorNode ?? null)).toBe(true);
  });

  it('leaves a press on the text itself alone', () => {
    render(<EmailCompose {...props()} />);
    const event = fireEvent.mouseDown(screen.getByLabelText('Message body'));
    expect(event).toBe(true);
    expect(document.activeElement).not.toBe(screen.getByLabelText('Message body'));
  });
});

describe('a saved draft', () => {
  it('opens with what was saved, and the body sanitised', () => {
    render(<EmailCompose {...props()} initialDraft={DRAFT} />);
    expect(screen.getByLabelText('Subject')).toHaveValue('Draft to finish');
    expect(screen.getByText('sam@client.example.invalid')).toBeInTheDocument();
    expect(screen.getByText('cc@client.example.invalid')).toBeInTheDocument();
    expect(screen.getByText('bcc@client.example.invalid')).toBeInTheDocument();
    const body = screen.getByLabelText('Message body');
    expect(body).toHaveTextContent('Half written');
    expect(body.innerHTML).not.toContain('onerror');
  });

  it('is not saved again just for being opened', async () => {
    render(<EmailCompose {...props()} initialDraft={DRAFT} />);
    await act(async () => {});
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('saves over itself, with its cc, bcc and thread', async () => {
    render(<EmailCompose {...props()} initialDraft={DRAFT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    expect(saveDraft.mock.calls[0][0]).toMatchObject({
      id: 'draft-9',
      to: DRAFT.to,
      cc: DRAFT.cc,
      bcc: DRAFT.bcc,
      subject: 'Draft to finish',
      threadId: 'thread-3',
    });
  });

  it('records being cleared, so reopening it does not bring the old text back', async () => {
    saveDraft.mockResolvedValue({ id: 'draft-9', status: 'DRAFT' });
    render(<EmailCompose {...props()} initialDraft={{ ...DRAFT, to: [], cc: [], bcc: [] }} />);
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: '' } });
    typeBody('');
    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    expect(saveDraft.mock.lastCall?.[0]).toMatchObject({
      id: 'draft-9',
      subject: '',
      htmlBody: '',
    });
  });

  it('is removed once sent, and the send stays on its thread', async () => {
    const props_ = props();
    render(<EmailCompose {...props_} initialDraft={DRAFT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(props_.onSent).toHaveBeenCalled());
    expect(send.mock.calls[0][0]).toMatchObject({ threadId: 'thread-3' });
    expect(processEmail).toHaveBeenCalledWith({ emailId: 'draft-9', action: 'permanentDelete' });
  });

  it('cannot be changed while it is being sent, and can again if the send fails', async () => {
    let failSend = (_reason: Error) => {};
    send.mockReturnValue(
      new Promise((_resolve, reject) => {
        failSend = reject;
      })
    );
    render(<EmailCompose {...props()} initialDraft={DRAFT} />);
    const subject = screen.getByLabelText('Subject');
    const body = screen.getByLabelText('Message body');
    const discard = screen.getByRole('button', { name: 'Discard' });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(subject.closest('[inert]')).not.toBeNull();
    expect(body.closest('[inert]')).not.toBeNull();
    expect(discard.closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Save draft', hidden: true })).toBeDisabled();
    await act(async () => failSend(new Error('refused')));
    await waitFor(() => expect(subject.closest('[inert]')).toBeNull());
    expect(body.closest('[inert]')).toBeNull();
  });

  it('still counts as sent if removing the draft fails', async () => {
    processEmail.mockRejectedValue(new Error('gone'));
    const props_ = props();
    render(<EmailCompose {...props_} initialDraft={DRAFT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(props_.onSent).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('saving a new draft', () => {
  it('reports the id once, for the page to come back to', async () => {
    const onDraftSaved = vi.fn();
    render(<EmailCompose {...props()} onDraftSaved={onDraftSaved} />);
    typeBody('<p>One</p>');
    await waitFor(() => expect(onDraftSaved).toHaveBeenCalledWith('draft-1'));
    typeBody('<p>Two</p>');
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(2));
    expect(saveDraft.mock.calls[1][0]).toMatchObject({ id: 'draft-1', htmlBody: '<p>Two</p>' });
    expect(onDraftSaved).toHaveBeenCalledTimes(1);
  });

  it('saves nothing for an untouched new message', async () => {
    const onLeave = vi.fn();
    render(<EmailCompose {...props()} onLeave={onLeave} initialDraft={undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(props().onDiscard).toBeDefined());
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('does not report a save that finishes after leaving', async () => {
    let finish: (value: { id: string; status: string }) => void = () => {};
    saveDraft.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const onDraftSaved = vi.fn();
    const { unmount } = render(<EmailCompose {...props()} onDraftSaved={onDraftSaved} />);
    typeBody('<p>One</p>');
    await act(async () => {});
    unmount();
    await act(async () => finish({ id: 'draft-1', status: 'DRAFT' }));
    expect(onDraftSaved).not.toHaveBeenCalled();
  });

  it('autosaves when only the subject changes', async () => {
    render(<EmailCompose {...props()} />);
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Only a subject' } });
    await waitFor(() =>
      expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Only a subject' }))
    );
  });

  it('never writes older text over newer when a save was waiting', async () => {
    let finish: (value: { id: string; status: string }) => void = () => {};
    saveDraft.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    render(<EmailCompose {...props()} />);
    typeBody('<p>Old</p>');
    await act(async () => {});
    expect(saveDraft).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    screen.getByLabelText('Message body').innerHTML = '<p>Newer</p>';
    await act(async () => finish({ id: 'draft-1', status: 'DRAFT' }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(2));
    expect(saveDraft.mock.calls[1][0]).toMatchObject({ htmlBody: '<p>Newer</p>' });
  });

  it('saves the latest text even if the page has gone when the save runs', async () => {
    let finish: (value: { id: string; status: string }) => void = () => {};
    saveDraft.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { unmount } = render(<EmailCompose {...props()} />);
    typeBody('<p>Old</p>');
    await act(async () => {});
    typeBody('<p>Latest</p>');
    unmount();
    await act(async () => finish({ id: 'draft-1', status: 'DRAFT' }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(2));
    expect(saveDraft.mock.calls[1][0]).toMatchObject({ htmlBody: '<p>Latest</p>' });
  });

  it('never creates two drafts when saves overlap', async () => {
    let finish: (value: { id: string; status: string }) => void = () => {};
    saveDraft.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    render(<EmailCompose {...props()} />);
    typeBody('<p>One</p>');
    typeBody('<p>Two</p>');
    await act(async () => {});
    expect(saveDraft).toHaveBeenCalledTimes(1);
    await act(async () => finish({ id: 'draft-1', status: 'DRAFT' }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(2));
    expect(saveDraft.mock.calls[1][0]).toMatchObject({ id: 'draft-1', htmlBody: '<p>Two</p>' });
  });

  it('does not bring a draft back after the message is sent', async () => {
    const props_ = props();
    render(
      <EmailCompose
        {...props_}
        initialTo={[{ name: 'Sam', email: 'sam@client.example.invalid' }]}
      />
    );
    typeBody('<p>Hello</p>');
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(props_.onSent).toHaveBeenCalled());
    expect(processEmail).toHaveBeenCalledWith({ emailId: 'draft-1', action: 'permanentDelete' });
    typeBody('<p>Too late</p>');
    await act(async () => {});
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft and restores nothing lost when the send is refused', async () => {
    send.mockRejectedValue(
      Object.assign(new Error('refused'), {
        data: {
          code: 'PRECONDITION_FAILED',
          emailSendError: { code: 'NO_MAILBOX', mailboxErrorCode: null },
        },
      })
    );
    const onLeave = vi.fn();
    render(
      <EmailCompose
        {...props()}
        onLeave={onLeave}
        initialTo={[{ name: 'Sam', email: 'sam@client.example.invalid' }]}
      />
    );
    typeBody('<p>Hello</p>');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const alert = await screen.findByRole('alert');
    expect(processEmail).not.toHaveBeenCalled();
    const link = alert.querySelector('a') as HTMLAnchorElement;
    fireEvent.click(link);
    await waitFor(() => expect(onLeave).toHaveBeenCalledWith(link.getAttribute('href')));
    expect(saveDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ htmlBody: '<p>Hello</p>' })
    );
  });
});
