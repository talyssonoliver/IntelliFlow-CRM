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
const { authState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'user-1', email: 'test@test.com' } as { id: string; email: string } | null,
  },
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: authState.user,
  }),
}));

// Mock api with tRPC-like hooks
vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      account: {
        list: { invalidate: vi.fn() },
        stats: { invalidate: vi.fn() },
      },
    }),
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
      delete: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
          isLoading: false,
        })),
      },
    },
  },
}));

// Mock server actions (cache revalidation)
vi.mock('../(list)/actions', () => ({
  invalidateAccountsCache: vi.fn(async () => undefined),
}));
vi.mock('../actions', () => ({
  revalidateAccountCaches: vi.fn(async () => undefined),
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
  PageHeader: ({ title }: Readonly<{ title: string }>) => (
    <div data-testid="page-header">{title}</div>
  ),
  SearchFilterBar: () => <div data-testid="search-filter-bar" />,
}));

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  DataTable: ({ data }: Readonly<{ data: unknown[] }>) => (
    <div data-testid="data-table">rows: {data.length}</div>
  ),
  Pagination: () => <div data-testid="pagination" />,
  Skeleton: ({ className }: Readonly<{ className: string }>) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

describe('AccountsPage', () => {
  it('should export a default page component', async () => {
    const mod = await import('../(list)/AccountsPageClient');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('should render the page header with correct title', async () => {
    const { render, screen } = await import('@testing-library/react');
    const mod = await import('../(list)/AccountsPageClient');
    const AccountsPage = mod.default;

    render(<AccountsPage />);

    expect(screen.getByTestId('page-header')).toBeDefined();
    expect(screen.getByText('Account List Overview')).toBeDefined();
  });

  it('should render the data table when data is loaded', async () => {
    const { render, screen } = await import('@testing-library/react');
    const mod = await import('../(list)/AccountsPageClient');

    render(<mod.default />);

    expect(screen.getByTestId('data-table')).toBeDefined();
    expect(screen.getByText('rows: 1')).toBeDefined();
  });

  it('should render stat cards', async () => {
    const { render, screen } = await import('@testing-library/react');
    const mod = await import('../(list)/AccountsPageClient');

    render(<mod.default />);

    expect(screen.getByText('Total Accounts')).toBeDefined();
    expect(screen.getByText('Total Revenue')).toBeDefined();
  });

  it('refreshes server caches for the signed-in user after a delete succeeds', async () => {
    const { render } = await import('@testing-library/react');
    const { api } = await import('@/lib/api');
    const actions = await import('../(list)/actions');
    const parentActions = await import('../actions');
    const mod = await import('../(list)/AccountsPageClient');

    render(<mod.default />);

    const useMutation = api.account.delete.useMutation as unknown as {
      mock: { calls: [{ onSuccess: () => void }][] };
    };
    const opts = useMutation.mock.calls.at(-1)![0];
    opts.onSuccess();

    expect(actions.invalidateAccountsCache).toHaveBeenCalled();
    expect(parentActions.revalidateAccountCaches).toHaveBeenCalledWith('user-1');
  });

  async function renderAndGetDeleteOnSuccess() {
    const { render } = await import('@testing-library/react');
    const { api } = await import('@/lib/api');
    const mod = await import('../(list)/AccountsPageClient');
    render(<mod.default />);
    const useMutation = api.account.delete.useMutation as unknown as {
      mock: { calls: [{ onSuccess: () => Promise<unknown> }][] };
    };
    return useMutation.mock.calls.at(-1)![0].onSuccess;
  }

  it('logs a failed server-cache revalidation after delete without failing the mutation', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const actions = await import('../(list)/actions');
    const parentActions = await import('../actions');
    const failure = new Error('revalidate down');
    vi.mocked(actions.invalidateAccountsCache).mockRejectedValueOnce(failure);
    vi.mocked(parentActions.revalidateAccountCaches).mockRejectedValueOnce(failure);

    const onSuccess = await renderAndGetDeleteOnSuccess();
    await expect(onSuccess()).resolves.toBeDefined();

    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to revalidate account caches after delete:',
      failure
    );
    consoleError.mockRestore();
  });

  it('skips the per-user revalidation when no user is signed in', async () => {
    const parentActions = await import('../actions');
    vi.mocked(parentActions.revalidateAccountCaches).mockClear();
    authState.user = null;
    try {
      const onSuccess = await renderAndGetDeleteOnSuccess();
      await onSuccess();
    } finally {
      authState.user = { id: 'user-1', email: 'test@test.com' };
    }
    expect(parentActions.revalidateAccountCaches).not.toHaveBeenCalled();
  });
});
