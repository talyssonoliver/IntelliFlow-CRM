// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { armComposeMocks, createMockEmailTrpc } from './email-test-utils';

const { trpc: mockTrpc, mocks } = createMockEmailTrpc();

vi.mock('@/lib/trpc', () => ({ trpc: mockTrpc }));
// A debounce that has not fired yet: the moment someone leaves within the two seconds.
vi.mock('@/hooks/useDebounce', async () => {
  const { useRef } = await import('react');
  return {
    useDebounce: <T,>(value: T) => useRef(value).current,
  };
});

const { EmailCompose } = await import('../EmailCompose');

const DRAFT = {
  id: 'draft-9',
  to: ['sam@client.example.invalid'],
  cc: [],
  bcc: [],
  subject: 'Draft to finish',
  htmlBody: '<p>Saved</p>',
};

let saveDraft: ReturnType<typeof vi.fn>;
let send: ReturnType<typeof vi.fn>;

const props = () => ({ mode: 'new' as const, onDiscard: vi.fn(), onSent: vi.fn() });

beforeEach(() => {
  armComposeMocks(mocks);
  saveDraft = vi.fn().mockResolvedValue({ id: 'draft-9', status: 'DRAFT' });
  send = vi.fn().mockResolvedValue({ id: 'sent-1', status: 'SENT', skipped: [] });
  mocks.saveDraft.mockReturnValue({ mutateAsync: saveDraft, isPending: false });
  mocks.sendEmail.mockReturnValue({ mutateAsync: send, isPending: false });
  mocks.processEmail.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
    isPending: false,
  });
});

function typeBody(html: string) {
  const body = screen.getByLabelText('Message body');
  body.innerHTML = html;
  fireEvent.input(body);
}

describe('leaving Compose before the autosave', () => {
  it('saves the latest text', async () => {
    const { unmount } = render(<EmailCompose {...props()} initialDraft={DRAFT} />);
    typeBody('<p>Edited</p>');
    expect(saveDraft).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    expect(saveDraft.mock.calls[0][0]).toMatchObject({ id: 'draft-9', htmlBody: '<p>Edited</p>' });
  });

  it('saves a changed subject', async () => {
    const { unmount } = render(<EmailCompose {...props()} initialDraft={DRAFT} />);
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'New subject' } });
    unmount();
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    expect(saveDraft.mock.calls[0][0]).toMatchObject({ subject: 'New subject' });
  });

  it('tries again if the last save failed', async () => {
    saveDraft.mockRejectedValueOnce(new Error('offline'));
    const { unmount } = render(<EmailCompose {...props()} initialDraft={DRAFT} />);
    typeBody('<p>Edited</p>');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    await act(async () => {});
    unmount();
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(2));
    expect(saveDraft.mock.calls[1][0]).toMatchObject({ htmlBody: '<p>Edited</p>' });
  });

  it('says when the save has landed, even after leaving', async () => {
    const onDraftChanged = vi.fn();
    const { unmount } = render(
      <EmailCompose {...props()} initialDraft={DRAFT} onDraftChanged={onDraftChanged} />
    );
    typeBody('<p>Edited</p>');
    unmount();
    await waitFor(() => expect(onDraftChanged).toHaveBeenCalledTimes(1));
  });

  it('saves nothing when there was no change', async () => {
    const { unmount } = render(<EmailCompose {...props()} initialDraft={DRAFT} />);
    unmount();
    await act(async () => {});
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('creates nothing for an untouched new message', async () => {
    const { unmount } = render(<EmailCompose {...props()} />);
    unmount();
    await act(async () => {});
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('saves only once after a manual save', async () => {
    const { unmount } = render(<EmailCompose {...props()} initialDraft={DRAFT} />);
    typeBody('<p>Edited</p>');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {});
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('does not bring the draft back after sending', async () => {
    const props_ = props();
    const { unmount } = render(<EmailCompose {...props_} initialDraft={DRAFT} />);
    typeBody('<p>Edited</p>');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(props_.onSent).toHaveBeenCalled());
    unmount();
    await act(async () => {});
    expect(saveDraft).not.toHaveBeenCalled();
  });
});
