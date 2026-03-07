// @vitest-environment jsdom
/**
 * AccountContactsList Tests (PG-134)
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountContactsList } from '../AccountContactsList';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const useQueryMock = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    account: {
      getContacts: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({
  Button: ({ children, ...props }: Readonly<{ children?: React.ReactNode; [key: string]: unknown }>) => (
    <button {...props}>{children}</button>
  ),
  Skeleton: ({ className }: Readonly<{ className?: string }>) => (
    <div className={`animate-pulse ${className ?? ''}`} />
  ),
  Badge: ({ children, ...props }: Readonly<{ children?: React.ReactNode; [key: string]: unknown }>) => (
    <span {...props}>{children}</span>
  ),
}));

describe('AccountContactsList', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    mockPush.mockReset();
  });

  it('shows loading skeletons while fetching', () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: true, error: null });
    const { container } = render(
      <AccountContactsList accountId="00000000-0000-4000-8000-000000000001" />
    );
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows error message on failure', () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: false, error: new Error('fail') });
    render(<AccountContactsList accountId="00000000-0000-4000-8000-000000000001" />);
    expect(screen.getByText('Failed to load contacts')).toBeInTheDocument();
  });

  it('shows empty state when no contacts and no filter', () => {
    useQueryMock.mockReturnValue({
      data: { contacts: [], nextCursor: null },
      isLoading: false,
      error: null,
    });
    render(<AccountContactsList accountId="00000000-0000-4000-8000-000000000001" />);
    expect(screen.getByText('No contacts linked to this account')).toBeInTheDocument();
  });

  it('renders contacts list with names and emails', () => {
    useQueryMock.mockReturnValue({
      data: {
        contacts: [
          {
            id: 'c1',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@test.com',
            status: 'ACTIVE',
          },
          {
            id: 'c2',
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane@test.com',
            status: 'LEAD',
          },
        ],
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountContactsList accountId="00000000-0000-4000-8000-000000000001" />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@test.com')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('navigates to contact detail when clicked', () => {
    useQueryMock.mockReturnValue({
      data: {
        contacts: [
          {
            id: 'c1',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@test.com',
            status: 'ACTIVE',
          },
        ],
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountContactsList accountId="00000000-0000-4000-8000-000000000001" />);

    fireEvent.click(screen.getByText('John Doe'));
    expect(mockPush).toHaveBeenCalledWith('/contacts/c1');
  });

  it('shows Load More button when nextCursor exists', () => {
    useQueryMock.mockReturnValue({
      data: {
        contacts: [
          { id: 'c1', firstName: 'A', lastName: 'B', email: 'a@test.com', status: 'ACTIVE' },
        ],
        nextCursor: 'cursor-123',
      },
      isLoading: false,
      error: null,
    });
    render(<AccountContactsList accountId="00000000-0000-4000-8000-000000000001" />);

    expect(screen.getByText('Load More')).toBeInTheDocument();
  });

  it('does not show Load More when no nextCursor', () => {
    useQueryMock.mockReturnValue({
      data: {
        contacts: [
          { id: 'c1', firstName: 'A', lastName: 'B', email: 'a@test.com', status: 'ACTIVE' },
        ],
        nextCursor: undefined,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountContactsList accountId="00000000-0000-4000-8000-000000000001" />);

    expect(screen.queryByText('Load More')).not.toBeInTheDocument();
  });

  it('displays initials avatar for each contact', () => {
    useQueryMock.mockReturnValue({
      data: {
        contacts: [
          { id: 'c1', firstName: 'John', lastName: 'Doe', email: 'jd@test.com', status: 'ACTIVE' },
        ],
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountContactsList accountId="00000000-0000-4000-8000-000000000001" />);

    expect(screen.getByText('JD')).toBeInTheDocument();
  });
});
