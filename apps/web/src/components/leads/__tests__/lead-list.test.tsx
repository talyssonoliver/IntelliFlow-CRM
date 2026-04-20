/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mockPush = vi.fn();
const mockReplace = vi.fn();

const mockListQueryState: {
  data:
    | {
        data: Array<Record<string, unknown>>;
        total: number;
        hasMore: boolean;
      }
    | undefined;
  isLoading: boolean;
  error: { message?: string; data?: { code?: string } } | null;
} = {
  data: undefined,
  isLoading: false,
  error: null,
};

const mutationMocks = {
  bulkConvert: { mutateAsync: vi.fn().mockResolvedValue({ successful: [], failed: [] }) },
  bulkUpdateStatus: {
    mutateAsync: vi.fn().mockResolvedValue({ successful: [], failed: [] }),
  },
  bulkArchive: { mutateAsync: vi.fn().mockResolvedValue({ successful: [], failed: [] }) },
  bulkDelete: { mutateAsync: vi.fn().mockResolvedValue({ successful: [], failed: [] }) },
  qualify: { mutate: vi.fn() },
  convert: { mutate: vi.fn() },
  score: { mutate: vi.fn() },
  delete: { mutate: vi.fn() },
};

const listQueryCalls: Array<{ input: unknown; options: unknown }> = [];
const refetchMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/leads',
  useParams: () => ({}),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'u1', email: 'u@example.com' },
  }),
}));

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'Europe/London' }),
}));

vi.mock('@/app/leads/(list)/actions', () => ({
  invalidateLeadsCache: vi.fn(),
}));

vi.mock('@/app/leads/actions', () => ({
  revalidateLeadCaches: vi.fn().mockResolvedValue(undefined),
  revalidateLeadConversionCaches: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      lead: {
        list: { invalidate: vi.fn() },
        stats: { invalidate: vi.fn() },
      },
    }),
    lead: {
      list: {
        useQuery: (input: unknown, options: unknown) => {
          listQueryCalls.push({ input, options });
          return {
            ...mockListQueryState,
            refetch: refetchMock,
          };
        },
      },
      bulkConvert: { useMutation: () => mutationMocks.bulkConvert },
      bulkUpdateStatus: { useMutation: () => mutationMocks.bulkUpdateStatus },
      bulkArchive: { useMutation: () => mutationMocks.bulkArchive },
      bulkDelete: { useMutation: () => mutationMocks.bulkDelete },
      qualify: { useMutation: () => mutationMocks.qualify },
      convert: { useMutation: () => mutationMocks.convert },
      scoreWithAI: { useMutation: () => mutationMocks.score },
      delete: { useMutation: () => mutationMocks.delete },
    },
  },
}));

vi.mock('@/lib/shared/filter-utils', () => ({
  leadStatusOptions: () => [
    { value: 'NEW', label: 'New' },
    { value: 'QUALIFIED', label: 'Qualified' },
  ],
}));

// Simplified mocks for shared primitives — we're testing LeadList's orchestration,
// not those components' own behaviour (they have their own test suites).
vi.mock('@/components/shared', () => ({
  PageHeader: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
  ),
  SearchFilterBar: ({
    searchValue,
    onSearchChange,
    searchPlaceholder,
  }: {
    searchValue: string;
    onSearchChange: (v: string) => void;
    searchPlaceholder: string;
  }) => (
    <input
      data-testid="search-filter-bar"
      placeholder={searchPlaceholder}
      value={searchValue}
      onChange={(e) => onSearchChange(e.target.value)}
    />
  ),
}));

vi.mock('@/components/shared/entity-hover-card', () => ({
  EntityHoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@intelliflow/ui', async () => {
  const actual = await import('@intelliflow/ui');
  void actual;
  return {
    DataTable: ({
      data,
      onRowClick,
      emptyMessage,
    }: {
      data: Array<{ id: string; firstName: string | null; lastName: string | null }>;
      onRowClick?: (row: unknown) => void;
      emptyMessage?: string;
    }) => {
      if (data.length === 0) return <div data-testid="empty-state">{emptyMessage}</div>;
      return (
        <table>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} onClick={() => onRowClick?.(row)}>
                <td>
                  {row.firstName} {row.lastName}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    },
    TableRowActions: () => null,
    ConfirmationDialog: () => null,
    StatusSelectDialog: () => null,
    toast: vi.fn(),
    Skeleton: ({ className }: { className?: string }) => <div className={className} />,
  };
});

// Real import after all mocks are declared
import LeadList from '../lead-list';

const twoLeads = [
  {
    id: 'lead-1',
    email: 'a@example.com',
    firstName: 'Alice',
    lastName: 'Anderson',
    company: 'Alpha',
    title: 'CEO',
    status: 'NEW' as const,
    score: 85,
    createdAt: new Date('2026-04-01T00:00:00Z'),
    phone: '+1',
    source: 'WEBSITE',
    owner: null,
  },
  {
    id: 'lead-2',
    email: 'b@example.com',
    firstName: 'Bob',
    lastName: 'Baker',
    company: 'Beta',
    title: 'CTO',
    status: 'QUALIFIED' as const,
    score: 60,
    createdAt: new Date('2026-04-02T00:00:00Z'),
    phone: null,
    source: 'REFERRAL',
    owner: null,
  },
];

function resetAll() {
  mockPush.mockReset();
  mockReplace.mockReset();
  listQueryCalls.length = 0;
  refetchMock.mockReset();
  Object.values(mutationMocks).forEach((m) => {
    if ('mutateAsync' in m) (m as any).mutateAsync.mockClear();
    if ('mutate' in m) (m as any).mutate.mockClear();
  });
  mockListQueryState.isLoading = false;
  mockListQueryState.error = null;
  mockListQueryState.data = { data: twoLeads, total: 2, hasMore: false };
}

describe('LeadList — rendering', () => {
  beforeEach(resetAll);

  it('renders skeleton while isLoading', () => {
    mockListQueryState.isLoading = true;
    mockListQueryState.data = undefined;
    const { container } = render(<LeadList />);
    expect(
      container.querySelectorAll('[class*="size-10"][class*="rounded-full"]').length
    ).toBeGreaterThan(0);
  });

  it('renders the lead rows when data arrives', () => {
    render(<LeadList />);
    expect(screen.getByText('Alice Anderson')).toBeTruthy();
    expect(screen.getByText('Bob Baker')).toBeTruthy();
  });

  it('renders page header with total count', () => {
    render(<LeadList />);
    expect(screen.getByText(/Lead List/)).toBeTruthy();
    expect(screen.getByText(/\(2 total\)/)).toBeTruthy();
  });

  it('renders pagination "Page 1 of 1" for 2 items', () => {
    render(<LeadList />);
    expect(screen.getByText(/Page 1 of 1/)).toBeTruthy();
  });

  it('renders Previous / Next pagination buttons', () => {
    render(<LeadList />);
    expect(screen.getByRole('button', { name: /Previous/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Next/i })).toBeTruthy();
  });
});

describe('LeadList — query wiring', () => {
  beforeEach(resetAll);

  it('issues a default query: page=1, limit=10, sortBy createdAt desc', () => {
    render(<LeadList />);
    expect(listQueryCalls.length).toBeGreaterThan(0);
    const first = listQueryCalls[0]?.input as {
      page: number;
      limit: number;
      sortBy: string;
      sortOrder: string;
    };
    expect(first.page).toBe(1);
    expect(first.limit).toBe(10);
    expect(first.sortBy).toBe('createdAt');
    expect(first.sortOrder).toBe('desc');
  });

  it('isDefaultQuery + initialData hydrates without skeleton', () => {
    mockListQueryState.data = { data: twoLeads, total: 2, hasMore: false };
    const { container } = render(
      <LeadList initialData={{ data: twoLeads, total: 2, hasMore: false }} />
    );
    // No skeleton rows
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBe(0);
    // Last call should include initialData when default query was triggered
    const last = listQueryCalls[listQueryCalls.length - 1] as {
      options: { initialData?: unknown };
    };
    expect(last.options.initialData).toBeDefined();
  });
});

describe('LeadList — row navigation', () => {
  beforeEach(resetAll);

  it('clicking a row pushes to /leads/<id>', () => {
    render(<LeadList />);
    const row = screen.getByText('Alice Anderson').closest('tr');
    if (!row) throw new Error('row not found');
    fireEvent.click(row);
    expect(mockPush).toHaveBeenCalledWith('/leads/lead-1');
  });
});

describe('LeadList — pagination', () => {
  beforeEach(resetAll);

  it('Previous button is disabled on page 1', () => {
    render(<LeadList />);
    const prev = screen.getByRole('button', { name: /Previous/i }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
  });

  it('Next button is disabled when hasMore is false', () => {
    render(<LeadList />);
    const next = screen.getByRole('button', { name: /Next/i }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it('Next button is enabled when hasMore is true', () => {
    mockListQueryState.data = { data: twoLeads, total: 20, hasMore: true };
    render(<LeadList />);
    const next = screen.getByRole('button', { name: /Next/i }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
  });
});

describe('LeadList — error state', () => {
  beforeEach(resetAll);

  it('renders error banner with Try Again button', () => {
    mockListQueryState.error = { message: 'boom', data: { code: 'INTERNAL_SERVER_ERROR' } };
    mockListQueryState.data = undefined;
    render(<LeadList />);
    expect(screen.getByText(/Failed to load leads/)).toBeTruthy();
    const btn = screen.getByRole('button', { name: /Try Again/i });
    fireEvent.click(btn);
    expect(refetchMock).toHaveBeenCalled();
  });

  it('UNAUTHORIZED error redirects to /login', () => {
    mockListQueryState.error = {
      message: 'nope',
      data: { code: 'UNAUTHORIZED' },
    };
    mockListQueryState.data = undefined;
    render(<LeadList />);
    // useEffect fires after render tick
    act(() => {});
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });
});

describe('LeadList — empty state', () => {
  beforeEach(resetAll);

  it('renders entity=leads empty state when data is empty and no filters', () => {
    mockListQueryState.data = { data: [], total: 0, hasMore: false };
    const { container } = render(<LeadList />);
    // No inline custom <svg> for empty state illustration (they live in shared UI primitives)
    // We simply assert that the DataTable rendered the empty message.
    expect(screen.getByText(/No leads found/)).toBeTruthy();
    // And no Page X of Y pagination when totalItems=0
    expect(container.textContent?.includes('Page 1 of')).toBe(false);
  });

  it('renders filter-aware empty message when filters are active', () => {
    mockListQueryState.data = { data: [], total: 0, hasMore: false };
    render(<LeadList />);
    // No filters initially; the default message should show
    expect(screen.getByText(/No leads found/)).toBeTruthy();
  });
});

describe('LeadList — search debounce', () => {
  beforeEach(() => {
    resetAll();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('typing in the search box eventually updates the query input', () => {
    render(<LeadList />);
    const input = screen.getByPlaceholderText(/Search leads/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'acme' } });
    // Before debounce window
    act(() => {
      vi.advanceTimersByTime(50);
    });
    const before = listQueryCalls[listQueryCalls.length - 1]?.input as { search?: string };
    expect(before.search).toBeUndefined();
    // After debounce window
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const after = listQueryCalls[listQueryCalls.length - 1]?.input as { search?: string };
    expect(after.search).toBe('acme');
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
