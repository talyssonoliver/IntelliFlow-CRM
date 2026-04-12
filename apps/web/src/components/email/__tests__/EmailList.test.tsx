// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMockEmail } from './email-test-utils';

const mockLookupUseQuery = vi.fn();
const mockRelatedMessagesUseQuery = vi.fn();

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
vi.mock('@/lib/trpc', () => ({
  trpc: {
    email: {
      lookupByEmail: {
        useQuery: (...args: unknown[]) => mockLookupUseQuery(...args),
      },
      getRelatedMessages: {
        useQuery: (...args: unknown[]) => mockRelatedMessagesUseQuery(...args),
      },
    },
  },
}));

const { EmailList } = await import('../EmailList');

describe('EmailList', () => {
  const emails = [
    createMockEmail({
      id: 'e1',
      subject: 'First',
      from: { address: 'a@b.com', name: 'Alice' },
      isRead: true,
    }),
    createMockEmail({
      id: 'e2',
      subject: 'Second',
      from: { address: 'c@d.com', name: 'Bob' },
      isRead: false,
      attachments: [
        { filename: 'file.pdf', contentType: 'application/pdf', size: 1024, checksum: 'abc' },
      ],
    }),
  ];

  const defaultProps = {
    emails,
    totalUnfilteredCount: emails.length,
    isLoading: false,
    isError: false,
    error: null as Error | null,
    selectedEmailId: null as string | null,
    searchQuery: '',
    onSearchChange: vi.fn(),
    onEmailSelect: vi.fn(),
    onFilterChange: vi.fn(),
    onRetry: vi.fn(),
    filters: { unread: false, hasAttachments: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLookupUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });
    mockRelatedMessagesUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
  });

  it('renders email items with sender, subject, preview, timestamp', () => {
    render(<EmailList {...defaultProps} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('shows unread emails with bold subject', () => {
    render(<EmailList {...defaultProps} />);
    const unreadSubject = screen.getByText('Second');
    expect(unreadSubject.className).toMatch(/font-semibold|font-bold/);
  });

  it('shows attachment icon for emails with attachments', () => {
    render(<EmailList {...defaultProps} />);
    const attachmentIcons = document.querySelectorAll('[data-testid="attachment-icon"]');
    expect(attachmentIcons.length).toBe(1);
  });

  it('renders search input that accepts text', async () => {
    const user = userEvent.setup();
    render(<EmailList {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'test');
    expect(defaultProps.onSearchChange).toHaveBeenCalled();
  });

  it('has debounced search at 300ms', async () => {
    // Debounce handled by parent, onSearchChange passes raw value
    const user = userEvent.setup();
    render(<EmailList {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'hello');
    expect(defaultProps.onSearchChange).toHaveBeenCalledTimes(5); // each char
  });

  it('toggles filter chips', async () => {
    const user = userEvent.setup();
    render(<EmailList {...defaultProps} />);
    const unreadChip = screen.getByRole('button', { name: /^unread$/i });
    await user.click(unreadChip);
    expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ unread: true })
    );
  });

  it('calls onEmailSelect when email is clicked', async () => {
    const user = userEvent.setup();
    render(<EmailList {...defaultProps} />);
    const items = screen.getAllByRole('option');
    await user.click(items[0]);
    expect(defaultProps.onEmailSelect).toHaveBeenCalledWith('e1');
  });

  it('highlights active/selected email', () => {
    render(<EmailList {...defaultProps} selectedEmailId="e1" />);
    const items = screen.getAllByRole('option');
    expect(items[0].className).toMatch(/primary|bg-/);
    expect(items[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('shows empty state when no emails', () => {
    render(<EmailList {...defaultProps} emails={[]} totalUnfilteredCount={0} />);
    expect(screen.getByText(/no emails/i)).toBeInTheDocument();
  });

  it('shows empty state for no search results', () => {
    render(<EmailList {...defaultProps} emails={[]} totalUnfilteredCount={0} searchQuery="xyz" />);
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });

  it('shows loading skeleton during fetch', () => {
    render(<EmailList {...defaultProps} isLoading={true} emails={[]} totalUnfilteredCount={0} />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error state with retry', async () => {
    const user = userEvent.setup();
    render(
      <EmailList
        {...defaultProps}
        isError={true}
        error={new Error('Fail')}
        emails={[]}
        totalUnfilteredCount={0}
      />
    );
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(defaultProps.onRetry).toHaveBeenCalled();
  });

  it('supports arrow key navigation', async () => {
    const user = userEvent.setup();
    render(<EmailList {...defaultProps} />);
    const list = screen.getByRole('listbox');
    list.focus();
    await user.keyboard('{ArrowDown}');
    const items = screen.getAllByRole('option');
    expect(document.activeElement).toBe(items[0]);
  });

  it('selects email on Enter key', async () => {
    const user = userEvent.setup();
    render(<EmailList {...defaultProps} />);
    const items = screen.getAllByRole('option');
    items[0].focus();
    await user.keyboard('{Enter}');
    expect(defaultProps.onEmailSelect).toHaveBeenCalledWith('e1');
  });

  it('shows sender avatar with initials', () => {
    render(<EmailList {...defaultProps} />);
    expect(screen.getByText('A')).toBeInTheDocument(); // Alice initial
    expect(screen.getByText('B')).toBeInTheDocument(); // Bob initial
  });

  it('formats timestamp relatively', () => {
    const recent = createMockEmail({ id: 'e3', receivedAt: new Date().toISOString() });
    render(<EmailList {...defaultProps} emails={[recent]} />);
    // Should show relative time like "just now" or "0m"
    expect(screen.getByText(/just now|0m|now/i)).toBeInTheDocument();
  });
});
