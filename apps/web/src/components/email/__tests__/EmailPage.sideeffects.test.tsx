// @vitest-environment jsdom
/**
 * EmailPage side effects: mutation callbacks must hand the cache invalidation
 * back to react-query (so the mutation waits for fresh data) and the inline
 * reply refresh must surface a failure instead of floating a rejection.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMockEmailTrpc, createMockEmail } from './email-test-utils';

const { trpc: mockTrpc, mocks } = createMockEmailTrpc();
const mockToast = vi.fn();

vi.mock('@/lib/trpc', () => ({ trpc: mockTrpc }));
vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/ui')>()),
  toast: (...args: unknown[]) => mockToast(...args),
}));
vi.mock('@/components/tasks/TaskCreateSheet', () => ({ TaskCreateSheet: () => null }));
vi.mock('@/hooks/use-entity-pin', () => ({
  useEntityPin: () => ({
    isPinned: false,
    isLoading: false,
    togglePin: vi.fn(),
    pin: vi.fn(),
    unpin: vi.fn(),
  }),
}));
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (value: string) => value }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('../EmailThread', () => ({
  EmailThread: ({ onInlineSent }: { onInlineSent?: () => void }) => (
    <button type="button" onClick={() => onInlineSent?.()}>
      inline sent
    </button>
  ),
}));

const { EmailPage } = await import('../EmailPage');

type Callbacks = { onSuccess: (...args: unknown[]) => unknown };

function mutationOptions(factory: ReturnType<typeof vi.fn>): Callbacks {
  return factory.mock.calls.at(-1)?.[0] as Callbacks;
}

describe('EmailPage side effects', () => {
  const refetchThread = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listEmails.mockReturnValue({
      data: { emails: [createMockEmail()], total: 1, hasMore: false },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.getThread.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchThread,
    });
    mocks.getUnreadCounts.mockReturnValue({
      data: { inbox: 0, sent: 0, drafts: 0, trash: 0, spam: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const mutation = { mutate: vi.fn(), isPending: false, isError: false, error: null };
    mocks.markAsRead.mockReturnValue(mutation);
    mocks.processEmail.mockReturnValue(mutation);
    mocks.markAsUnread.mockReturnValue(mutation);
    mocks.setLabels.mockReturnValue(mutation);
    mocks.useUtils.mockReturnValue({
      email: {
        listEmails: { invalidate: mocks.invalidateListEmails },
        getUnreadCounts: { invalidate: mocks.invalidateUnreadCounts },
      },
    });
    mocks.invalidateListEmails.mockResolvedValue(undefined);
    mocks.invalidateUnreadCounts.mockResolvedValue(undefined);
    refetchThread.mockResolvedValue(undefined);
  });

  it('markAsRead onSuccess returns the list and unread-count invalidations', async () => {
    render(<EmailPage />);
    await mutationOptions(mocks.markAsRead).onSuccess();
    expect(mocks.invalidateListEmails).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateUnreadCounts).toHaveBeenCalledTimes(1);
  });

  it('processEmail onSuccess toasts immediately and returns the invalidations', async () => {
    render(<EmailPage />);
    const result = mutationOptions(mocks.processEmail).onSuccess({}, { action: 'archive' });
    expect(mockToast).toHaveBeenCalledWith({ title: 'Email archived' });
    await result;
    expect(mocks.invalidateListEmails).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateUnreadCounts).toHaveBeenCalledTimes(1);
  });

  it('setLabels onSuccess toasts immediately and returns the list invalidation', async () => {
    render(<EmailPage />);
    const result = mutationOptions(mocks.setLabels).onSuccess();
    expect(mockToast).toHaveBeenCalledWith({ title: 'Labels updated' });
    await result;
    expect(mocks.invalidateListEmails).toHaveBeenCalledTimes(1);
  });

  it('markAsUnread onSuccess toasts immediately and returns the invalidations', async () => {
    render(<EmailPage />);
    const result = mutationOptions(mocks.markAsUnread).onSuccess();
    expect(mockToast).toHaveBeenCalledWith({ title: 'Email marked as unread' });
    await result;
    expect(mocks.invalidateListEmails).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateUnreadCounts).toHaveBeenCalledTimes(1);
  });

  it('inline reply sent toasts and refreshes the list and thread', async () => {
    render(<EmailPage />);
    fireEvent.click(screen.getByText('inline sent'));

    await waitFor(() => expect(refetchThread).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith({ title: 'Reply sent' });
    expect(mocks.invalidateListEmails).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('inline reply sent reports a destructive toast when the refresh fails', async () => {
    refetchThread.mockRejectedValue(new Error('network'));
    render(<EmailPage />);
    fireEvent.click(screen.getByText('inline sent'));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Reply sent, but the conversation could not be refreshed',
        variant: 'destructive',
      })
    );
  });
});
