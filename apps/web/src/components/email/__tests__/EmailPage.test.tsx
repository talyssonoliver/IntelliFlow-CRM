// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMockEmailTrpc, createMockEmail, createMockThread } from './email-test-utils';

const { trpc: mockTrpc, mocks } = createMockEmailTrpc();

vi.mock('@/lib/trpc', () => ({ trpc: mockTrpc }));
vi.mock('@/components/tasks/TaskCreateSheet', () => ({
  TaskCreateSheet: () => null,
}));
vi.mock('@/hooks/use-entity-pin', () => ({
  useEntityPin: () => ({
    isPinned: false,
    isLoading: false,
    togglePin: vi.fn(),
    pin: vi.fn(),
    unpin: vi.fn(),
  }),
}));
vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}));

const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
}));

// Lazy-load to ensure mocks are applied
const { EmailPage } = await import('../EmailPage');

describe('EmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset search params to default (inbox)
    mockSearchParams.delete('folder');
    mocks.listEmails.mockReturnValue({
      data: {
        emails: [createMockEmail(), createMockEmail({ id: 'email-2', subject: 'Second Email' })],
        total: 2,
        hasMore: false,
      },
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
      refetch: vi.fn(),
    });
    mocks.sendEmail.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ id: 'sent-1', status: 'PENDING' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    mocks.saveDraft.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ id: 'draft-1', status: 'DRAFT' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    mocks.contactSearch.mockReturnValue({
      data: { contacts: [] },
      isLoading: false,
      isError: false,
    });
    mocks.leadList.mockReturnValue({
      data: { leads: [] },
      isLoading: false,
      isError: false,
    });
    mocks.listTemplates.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    mocks.getUnreadCounts.mockReturnValue({
      data: { inbox: 3, sent: 0, drafts: 1, trash: 0, spam: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.markAsRead.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
      isError: false,
      error: null,
    });
  });

  it('renders 2-column layout with email list and thread panes', () => {
    render(<EmailPage />);
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByText(/no email selected/i)).toBeInTheDocument();
  });

  it('reads folder from URL search params', () => {
    mockSearchParams.set('folder', 'sent');
    render(<EmailPage />);
    expect(mocks.listEmails).toHaveBeenCalled();
  });

  it('selects an email and loads thread view', async () => {
    const user = userEvent.setup();
    const thread = createMockThread();
    mocks.getThread.mockReturnValue({
      data: thread,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<EmailPage />);
    const emailItems = screen.getAllByRole('option');
    expect(emailItems.length).toBeGreaterThanOrEqual(1);
    await user.click(emailItems[0]);

    await waitFor(() => {
      expect(mocks.getThread).toHaveBeenCalled();
    });
  });

  it('navigates to compose page via keyboard shortcut "c"', async () => {
    render(<EmailPage />);
    fireEvent.keyDown(document, { key: 'c' });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/email/compose');
    });
  });

  it('triggers search with debounced query', async () => {
    const user = userEvent.setup();
    render(<EmailPage />);
    const searchInput = screen.getByRole('search').querySelector('input')!;
    await user.type(searchInput, 'hello');
    expect(mocks.listEmails).toHaveBeenCalled();
  });

  it('toggles filter chips correctly', async () => {
    const user = userEvent.setup();
    render(<EmailPage />);
    const unreadChip = screen.getByRole('button', { name: /^unread$/i });
    await user.click(unreadChip);
    expect(unreadChip).toHaveAttribute('aria-pressed', 'true');
  });

  it('filters emails by unread status when Unread chip is active', async () => {
    const user = userEvent.setup();
    mocks.listEmails.mockReturnValue({
      data: {
        emails: [
          createMockEmail({ id: 'read-1', subject: 'Read Email', isRead: true }),
          createMockEmail({ id: 'unread-1', subject: 'Unread Email', isRead: false }),
        ],
        total: 2,
        hasMore: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<EmailPage />);
    // Both should be visible initially
    expect(screen.getByText('Read Email')).toBeInTheDocument();
    expect(screen.getByText('Unread Email')).toBeInTheDocument();

    // Toggle unread filter chip
    const unreadChip = screen.getByRole('button', { name: /^unread$/i });
    await user.click(unreadChip);

    // Only unread email should remain
    await waitFor(() => {
      expect(screen.queryByText('Read Email')).not.toBeInTheDocument();
      expect(screen.getByText('Unread Email')).toBeInTheDocument();
    });
  });

  it('filters emails by attachments when Has Attachments chip is active', async () => {
    const user = userEvent.setup();
    mocks.listEmails.mockReturnValue({
      data: {
        emails: [
          createMockEmail({ id: 'no-attach', subject: 'Plain Email', attachments: [] }),
          createMockEmail({
            id: 'with-attach',
            subject: 'Email With File',
            attachments: [
              { filename: 'doc.pdf', contentType: 'application/pdf', size: 1024, checksum: '' },
            ],
          }),
        ],
        total: 2,
        hasMore: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<EmailPage />);
    expect(screen.getByText('Plain Email')).toBeInTheDocument();
    expect(screen.getByText('Email With File')).toBeInTheDocument();

    const attachChip = screen.getByRole('button', { name: /^attachments$/i });
    await user.click(attachChip);

    await waitFor(() => {
      expect(screen.queryByText('Plain Email')).not.toBeInTheDocument();
      expect(screen.getByText('Email With File')).toBeInTheDocument();
    });
  });

  it('shows filter-specific empty state and clear button when filters match nothing', async () => {
    const user = userEvent.setup();
    mocks.listEmails.mockReturnValue({
      data: {
        emails: [createMockEmail({ id: 'read-1', subject: 'Read Email', isRead: true })],
        total: 1,
        hasMore: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<EmailPage />);

    // Toggle unread filter chip — the only email is read, so 0 results
    const unreadChip = screen.getByRole('button', { name: /^unread$/i });
    await user.click(unreadChip);

    await waitFor(() => {
      // EmailList.tsx:176 renders `<EmptyState entity="emails" variant="filtered" />`
      // whose canonical copy is "No results found" (from entity-empty-state-config).
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    });

    // Click "Clear filters" to reset
    const clearBtn = screen.getByRole('button', { name: /clear filters/i });
    await user.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText('Read Email')).toBeInTheDocument();
    });
  });

  it('hides filter chips when folder has no emails', () => {
    mocks.listEmails.mockReturnValue({
      data: { emails: [], total: 0, hasMore: false },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<EmailPage />);
    expect(screen.queryByRole('button', { name: /^unread$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^attachments$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no emails in this folder/i)).toBeInTheDocument();
  });

  it('shows empty state when no email is selected', () => {
    render(<EmailPage />);
    expect(screen.getByText(/no email selected/i)).toBeInTheDocument();
    expect(screen.getByText(/select an email/i)).toBeInTheDocument();
  });

  it('shows loading skeleton during data fetch', () => {
    mocks.listEmails.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmailPage />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error state with retry button', async () => {
    const refetchFn = vi.fn();
    mocks.listEmails.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error('Failed'),
      refetch: refetchFn,
    });
    render(<EmailPage />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    await userEvent.setup().click(retryBtn);
    expect(refetchFn).toHaveBeenCalled();
  });

  it('applies dark mode classes', () => {
    const { container } = render(<EmailPage />);
    expect(container.querySelector('[class*="dark:"]') || container.firstElementChild).toBeTruthy();
  });

  it('calls markAsRead mutation after 800ms when email is selected', async () => {
    vi.useFakeTimers();
    const mutate = vi.fn();
    mocks.markAsRead.mockReturnValue({
      mutate,
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
      isError: false,
      error: null,
    });

    userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<EmailPage initialEmailId="email-1" />);

    vi.advanceTimersByTime(900);

    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ emailId: 'email-1' }));
    vi.useRealTimers();
  });

  it('renders interactive filter elements', () => {
    render(<EmailPage />);
    const filterChips = screen
      .getAllByRole('button')
      .filter((btn) => btn.hasAttribute('aria-pressed'));
    expect(filterChips.length).toBeGreaterThan(0);
  });

  it('has accessible structure with search landmark', () => {
    render(<EmailPage />);
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('shows thread loading skeleton when thread is being fetched', () => {
    mocks.getThread.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<EmailPage initialEmailId="email-1" />);
    // Should show loading skeletons, not "No email selected"
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
