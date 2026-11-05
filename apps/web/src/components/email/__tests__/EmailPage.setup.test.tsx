// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockEmail, createMockEmailTrpc, createMockThread } from './email-test-utils';

const { trpc: mockTrpc, mocks } = createMockEmailTrpc();

vi.mock('@/lib/trpc', () => ({ trpc: mockTrpc }));
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

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: nav.push }),
  usePathname: () => '/email',
}));

const { EmailPage } = await import('../EmailPage');

const refusal = (value: string | null) =>
  mocks.sendingIdentity.mockReturnValue({
    data: { address: null, name: null, scope: null, refusal: value },
    isLoading: false,
    isError: false,
  });

function listEmails(emails: unknown[]) {
  mocks.listEmails.mockReturnValue({
    data: { emails, total: emails.length, hasMore: false },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  listEmails([]);
  refusal(null);
  mocks.getThread.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  mocks.markAsRead.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mocks.getUnreadCounts.mockReturnValue({ data: { inbox: 0 }, isLoading: false, isError: false });
});

describe('EmailPage mailbox prompt', () => {
  it('asks to connect a mailbox when the inbox is empty and none is connected', () => {
    refusal('NO_MAILBOX');
    render(<EmailPage />);
    expect(screen.getByRole('link', { name: 'Connect your mailbox' })).toHaveAttribute(
      'href',
      '/email/email-settings'
    );
  });

  it('points to Email Settings when the mailbox is broken', () => {
    refusal('MAILBOX_ERROR');
    render(<EmailPage />);
    expect(screen.getByText('Your mailbox needs attention')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Email Settings' })).toBeInTheDocument();
  });

  it('asks nothing once a mailbox can send', () => {
    render(<EmailPage />);
    expect(screen.queryByRole('link', { name: 'Connect your mailbox' })).not.toBeInTheDocument();
  });

  it('asks only in the inbox, not in other folders', () => {
    nav.params = new URLSearchParams('folder=trash');
    refusal('NO_MAILBOX');
    render(<EmailPage />);
    expect(screen.queryByRole('link', { name: 'Connect your mailbox' })).not.toBeInTheDocument();
  });

  it('leaves a list with email in it alone', () => {
    refusal('NO_MAILBOX');
    listEmails([createMockEmail()]);
    render(<EmailPage />);
    expect(screen.queryByRole('link', { name: 'Connect your mailbox' })).not.toBeInTheDocument();
  });
});

describe('EmailPage opening an email', () => {
  const email = createMockEmail({ id: 'draft-9', subject: 'Draft to finish' });

  it('opens a draft in Compose', () => {
    nav.params = new URLSearchParams('folder=drafts');
    listEmails([email]);
    render(<EmailPage />);
    fireEvent.click(screen.getByText('Draft to finish'));
    expect(nav.push).toHaveBeenCalledWith('/email/compose?draftId=draft-9');
  });

  it('opens anything else in the reading pane, with a way back on a phone', () => {
    listEmails([email]);
    mocks.getThread.mockReturnValue({
      data: createMockThread(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmailPage />);
    fireEvent.click(screen.getByText('Draft to finish'));
    expect(nav.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    expect(screen.getByRole('list', { name: 'Email list' }).closest('.flex')).toBeTruthy();
  });
});
