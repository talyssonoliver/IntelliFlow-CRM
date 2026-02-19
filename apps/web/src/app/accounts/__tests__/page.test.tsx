import { describe, it, expect, vi } from 'vitest';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/accounts',
}));

// Mock auth
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'user-1', email: 'test@test.com' },
  }),
}));

// Mock api with tRPC-like hooks
vi.mock('@/lib/api', () => ({
  api: {
    account: {
      list: {
        useQuery: vi.fn(() => ({
          data: {
            accounts: [
              {
                id: 'acc-1',
                name: 'Acme Corp',
                industry: 'Tech',
                revenue: '5000000',
                employees: 100,
                website: 'https://acme.com',
                description: null,
                createdAt: '2026-01-01T00:00:00Z',
                owner: { id: 'user-1', name: 'John Doe', email: 'john@test.com' },
                _count: { contacts: 5, opportunities: 3 },
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
            hasMore: false,
          },
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        })),
      },
      stats: {
        useQuery: vi.fn(() => ({
          data: {
            total: 10,
            byIndustry: { Tech: 5, Finance: 3 },
            withContacts: 8,
            withOpportunities: 6,
            totalRevenue: '50000000',
          },
          isLoading: false,
        })),
      },
    },
  },
}));

// Mock dynamic filter hooks
vi.mock('@/hooks/use-dynamic-filters', () => ({
  useAccountFilterOptions: () => ({
    industryOptions: [{ value: 'Tech', label: 'Tech (5)' }],
    ownerOptions: [{ value: 'user-1', label: 'John Doe (3)' }],
  }),
}));

// Mock shared components
vi.mock('@/components/shared', () => ({
  PageHeader: ({ title }: { title: string }) => <div data-testid="page-header">{title}</div>,
  SearchFilterBar: () => <div data-testid="search-filter-bar" />,
}));

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  DataTable: ({ data }: { data: unknown[] }) => (
    <div data-testid="data-table">rows: {data.length}</div>
  ),
  Pagination: () => <div data-testid="pagination" />,
  Skeleton: ({ className }: { className: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

describe('AccountsPage', () => {
  it('should export a default page component', async () => {
    const mod = await import('../(list)/page');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('should render the page header with correct title', async () => {
    const { render, screen } = await import('@testing-library/react');
    const mod = await import('../(list)/page');
    const AccountsPage = mod.default;

    render(<AccountsPage />);

    expect(screen.getByTestId('page-header')).toBeDefined();
    expect(screen.getByText('Account List Overview')).toBeDefined();
  });

  it('should render the data table when data is loaded', async () => {
    const { render, screen } = await import('@testing-library/react');
    const mod = await import('../(list)/page');

    render(<mod.default />);

    expect(screen.getByTestId('data-table')).toBeDefined();
    expect(screen.getByText('rows: 1')).toBeDefined();
  });

  it('should render stat cards', async () => {
    const { render, screen } = await import('@testing-library/react');
    const mod = await import('../(list)/page');

    render(<mod.default />);

    expect(screen.getByText('Total Accounts')).toBeDefined();
    expect(screen.getByText('Total Revenue')).toBeDefined();
  });
});
