// @vitest-environment jsdom
/**
 * AccountContactsList Tests (PG-134)
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CONTACT_STATUSES } from '@intelliflow/domain';
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

vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  Button: ({
    children,
    ...props
  }: Readonly<{ children?: React.ReactNode; [key: string]: unknown }>) => (
    <button {...props}>{children}</button>
  ),
  Skeleton: ({ className }: Readonly<{ className?: string }>) => (
    <div className={`animate-pulse ${className ?? ''}`} />
  ),
  Badge: ({
    children,
    ...props
  }: Readonly<{ children?: React.ReactNode; [key: string]: unknown }>) => (
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
    // EmptyState entity="contacts" → canonical 'No contacts yet'.
    expect(screen.getByText('No contacts yet')).toBeInTheDocument();
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

  // IFC-267: onAddContact callback wiring
  it('empty-state "Add Contact" button calls onAddContact', () => {
    const onAddContact = vi.fn();
    useQueryMock.mockReturnValue({
      data: { contacts: [], nextCursor: null },
      isLoading: false,
      error: null,
    });
    render(
      <AccountContactsList
        accountId="00000000-0000-4000-8000-000000000001"
        onAddContact={onAddContact}
      />
    );

    fireEvent.click(screen.getByText('Add Contact'));
    expect(onAddContact).toHaveBeenCalledTimes(1);
  });

  it('header "Add Contact" button calls onAddContact', () => {
    const onAddContact = vi.fn();
    useQueryMock.mockReturnValue({
      data: {
        contacts: [{ id: 'c1', firstName: 'A', lastName: 'B', email: 'a@b.com', status: 'ACTIVE' }],
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(
      <AccountContactsList
        accountId="00000000-0000-4000-8000-000000000001"
        onAddContact={onAddContact}
      />
    );

    // In the non-empty state, the "Add Contact" button is in the header row
    const addBtns = screen.getAllByText('Add Contact');
    fireEvent.click(addBtns[0]);
    expect(onAddContact).toHaveBeenCalledTimes(1);
  });

  // IFC-273 (F-09): status filter options derived from the ContactStatus domain enum
  it('renders a status filter option for every CONTACT_STATUS (no invalid LEAD)', () => {
    useQueryMock.mockReturnValue({
      data: {
        contacts: [{ id: 'c1', firstName: 'A', lastName: 'B', email: 'a@b.com', status: 'ACTIVE' }],
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountContactsList accountId="00000000-0000-4000-8000-000000000001" />);

    const options = screen.getAllByRole('option');
    // "All Statuses" + one option per CONTACT_STATUS
    expect(options).toHaveLength(CONTACT_STATUSES.length + 1);
    // every valid domain status is offered by value
    for (const status of CONTACT_STATUSES) {
      expect(screen.getByRole('option', { name: formatStatusLabel(status) })).toBeInTheDocument();
    }
    // the formerly-hardcoded invalid 'LEAD' option is gone
    expect(screen.queryByRole('option', { name: 'Lead' })).not.toBeInTheDocument();
    // newly-available statuses that the hardcoded list omitted
    expect(screen.getByRole('option', { name: 'Former Customer' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Customer' })).toBeInTheDocument();
  });

  it('applies the selected status to the contacts query', () => {
    useQueryMock.mockReturnValue({
      data: {
        contacts: [{ id: 'c1', firstName: 'A', lastName: 'B', email: 'a@b.com', status: 'ACTIVE' }],
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountContactsList accountId="00000000-0000-4000-8000-000000000001" />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'PROSPECT' } });

    const lastCall = useQueryMock.mock.calls.at(-1)?.[0] as { status?: string[] };
    expect(lastCall.status).toEqual(['PROSPECT']);
  });

  it('clears the status filter when All Statuses is selected', () => {
    useQueryMock.mockReturnValue({
      data: {
        contacts: [{ id: 'c1', firstName: 'A', lastName: 'B', email: 'a@b.com', status: 'ACTIVE' }],
        nextCursor: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountContactsList accountId="00000000-0000-4000-8000-000000000001" />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'PROSPECT' } });
    fireEvent.change(select, { target: { value: '' } });

    const lastCall = useQueryMock.mock.calls.at(-1)?.[0] as { status?: string[] };
    expect(lastCall.status).toBeUndefined();
  });
});

// Mirror of the shared formatLabel used by the component (SNAKE_CASE → Title Case)
function formatStatusLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
