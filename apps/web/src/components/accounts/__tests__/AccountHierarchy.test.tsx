// @vitest-environment jsdom
/**
 * AccountHierarchy Tests (PG-134)
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountHierarchy } from '../AccountHierarchy';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
const invalidateMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      account: {
        getHierarchy: { invalidate: invalidateMock },
      },
    }),
    account: {
      getHierarchy: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
      setParent: {
        useMutation: (opts: Readonly<Record<string, unknown>>) => {
          useMutationMock(opts);
          return {
            mutate: vi.fn(),
            isPending: false,
          };
        },
      },
      list: {
        useQuery: () => ({ data: null, isLoading: false }),
      },
    },
  },
}));

vi.mock('@/lib/pricing/calculator', () => ({
  formatCurrency: (v: number) => `$${v.toLocaleString()}`,
}));

vi.mock('../AccountCard', () => ({
  getAccountTier: () => 'SMB',
  TIER_CONFIG: {
    ENTERPRISE: { label: 'Enterprise', color: 'bg-purple-100', dot: 'bg-purple-500' },
    MID_MARKET: { label: 'Mid-Market', color: 'bg-blue-100', dot: 'bg-blue-500' },
    SMB: { label: 'SMB', color: 'bg-green-100', dot: 'bg-green-500' },
    STARTUP: { label: 'Startup', color: 'bg-yellow-100', dot: 'bg-yellow-500' },
    UNKNOWN: { label: 'Unknown', color: 'bg-slate-100', dot: 'bg-slate-400' },
  },
}));

vi.mock('@intelliflow/ui', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: Readonly<{
    children?: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Skeleton: ({ className }: Readonly<{ className?: string }>) => (
    <div className={`animate-pulse ${className ?? ''}`} />
  ),
  Badge: ({ children }: Readonly<{ children: React.ReactNode }>) => <span>{children}</span>,
  Card: ({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) => (
    <div className={className}>{children}</div>
  ),
}));

describe('AccountHierarchy', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    mockPush.mockReset();
    invalidateMock.mockReset();
  });

  it('shows loading skeleton while fetching', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, error: null });
    const { container } = render(
      <AccountHierarchy accountId="00000000-0000-4000-8000-000000000001" />
    );
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows error state on failure', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error('fail') });
    render(<AccountHierarchy accountId="00000000-0000-4000-8000-000000000001" />);
    expect(screen.getByText('Failed to load hierarchy')).toBeInTheDocument();
  });

  it('returns null when no data and not loading', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, error: null });
    const { container } = render(
      <AccountHierarchy accountId="00000000-0000-4000-8000-000000000001" />
    );
    // Should render the wrapper div but no tree
    expect(container.querySelector('[role="tree"]')).toBeNull();
  });

  it('shows empty state when no hierarchy exists', () => {
    useQueryMock.mockReturnValue({
      data: {
        ancestors: [],
        current: {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Solo Account',
          _count: { contacts: 0, opportunities: 0 },
          children: [],
        },
        rootAccount: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountHierarchy accountId="00000000-0000-4000-8000-000000000001" />);
    expect(screen.getByText(/no parent or child accounts/i)).toBeInTheDocument();
  });

  it('renders tree with children', () => {
    useQueryMock.mockReturnValue({
      data: {
        ancestors: [],
        current: {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Parent Corp',
          revenue: 5000000,
          _count: { contacts: 5, opportunities: 3 },
          children: [
            {
              id: 'child-1',
              name: 'Child Division',
              _count: { contacts: 2, opportunities: 1 },
              children: [],
            },
          ],
        },
        rootAccount: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountHierarchy accountId="00000000-0000-4000-8000-000000000001" />);

    expect(screen.getByText('Parent Corp')).toBeInTheDocument();
    expect(screen.getByText('Child Division')).toBeInTheDocument();
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });

  it('shows ancestor breadcrumbs', () => {
    useQueryMock.mockReturnValue({
      data: {
        ancestors: [
          { id: 'anc-1', name: 'Grandparent Corp' },
          { id: 'anc-2', name: 'Parent Corp' },
        ],
        current: {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Current Account',
          _count: { contacts: 0, opportunities: 0 },
          children: [],
        },
        rootAccount: { id: 'anc-1', name: 'Grandparent Corp' },
      },
      isLoading: false,
      error: null,
    });
    render(<AccountHierarchy accountId="00000000-0000-4000-8000-000000000001" />);

    expect(screen.getByText('Grandparent Corp')).toBeInTheDocument();
    expect(screen.getByText('Parent Corp')).toBeInTheDocument();
    // "Current Account" appears in both breadcrumb trail and tree node
    expect(screen.getAllByText('Current Account').length).toBeGreaterThanOrEqual(1);
  });

  it('navigates to ancestor on breadcrumb click', () => {
    useQueryMock.mockReturnValue({
      data: {
        ancestors: [{ id: 'anc-1', name: 'Parent Corp' }],
        current: {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Current Account',
          _count: { contacts: 0, opportunities: 0 },
          children: [],
        },
        rootAccount: { id: 'anc-1', name: 'Parent Corp' },
      },
      isLoading: false,
      error: null,
    });
    render(<AccountHierarchy accountId="00000000-0000-4000-8000-000000000001" />);

    fireEvent.click(screen.getByText('Parent Corp'));
    expect(mockPush).toHaveBeenCalledWith('/accounts/anc-1');
  });

  it('shows Set Parent Account button', () => {
    useQueryMock.mockReturnValue({
      data: {
        ancestors: [],
        current: {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Solo Account',
          _count: { contacts: 0, opportunities: 0 },
          children: [],
        },
        rootAccount: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountHierarchy accountId="00000000-0000-4000-8000-000000000001" />);

    expect(screen.getByText('Set Parent Account')).toBeInTheDocument();
  });

  it('shows Remove Parent button when ancestors exist', () => {
    useQueryMock.mockReturnValue({
      data: {
        ancestors: [{ id: 'anc-1', name: 'Parent' }],
        current: {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Child',
          _count: { contacts: 0, opportunities: 0 },
          children: [],
        },
        rootAccount: { id: 'anc-1', name: 'Parent' },
      },
      isLoading: false,
      error: null,
    });
    render(<AccountHierarchy accountId="00000000-0000-4000-8000-000000000001" />);

    expect(screen.getByText('Remove Parent')).toBeInTheDocument();
  });

  it('marks current account in the tree', () => {
    useQueryMock.mockReturnValue({
      data: {
        ancestors: [],
        current: {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Root',
          _count: { contacts: 0, opportunities: 0 },
          children: [
            { id: 'c1', name: 'Child', _count: { contacts: 0, opportunities: 0 }, children: [] },
          ],
        },
        rootAccount: null,
      },
      isLoading: false,
      error: null,
    });
    render(<AccountHierarchy accountId="00000000-0000-4000-8000-000000000001" />);

    expect(screen.getByText('(current)')).toBeInTheDocument();
  });
});
