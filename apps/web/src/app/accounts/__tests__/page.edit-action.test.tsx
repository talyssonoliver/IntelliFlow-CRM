/**
 * PG-197: the accounts list row Edit action opens /accounts/{id}/edit
 * (previously the dead `/accounts/{id}?edit=true`).
 */
import { describe, it, expect, vi } from 'vitest';

// Mock next/navigation
const { mockPush, captured } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  captured: { handlers: null as null | { onEdit: (id: string) => void } },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
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

// Capture the row handlers the page passes to the column factory.
vi.mock('@/components/accounts/AccountCard', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createAccountColumns: (handlers: { onEdit: (id: string) => void }) => {
    captured.handlers = handlers;
    return [];
  },
}));

describe('AccountsPage row Edit action', () => {
  it('pushes /accounts/{id}/edit', async () => {
    const { render } = await import('@testing-library/react');
    const mod = await import('../(list)/AccountsPageClient');
    render(<mod.default />);
    captured.handlers!.onEdit('acc-1');
    expect(mockPush).toHaveBeenCalledWith('/accounts/acc-1/edit');
  });
});
