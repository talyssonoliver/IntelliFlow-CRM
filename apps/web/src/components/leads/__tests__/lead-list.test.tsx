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
  setStarred: { mutate: vi.fn() },
  delete: { mutate: vi.fn() },
};

const listQueryCalls: Array<{ input: unknown; options: unknown }> = [];
const refetchMock = vi.fn();

// IFC-248: state referenced INSIDE vi.mock factories must be vi.hoisted() so it
// is initialized before the (hoisted) factories run.
//  - mockToast: shared toast spy used by the @intelliflow/ui mock.
//  - mockMutationCallbacks: captures each mutation's onSuccess/onError so tests
//    can invoke them and assert toasts + cache invalidations.
//  - useLeadRecentViewsMock/pushRecentViewMock: deterministic recent-views hook
//    (replaces real localStorage so the suite never depends on jsdom state).
const {
  mockToast,
  mockMutationCallbacks,
  pushRecentViewMock,
  useLeadRecentViewsMock,
  useRequireAuthMock,
  invalidateLeadsCacheMock,
  revalidateLeadCachesMock,
  revalidateLeadConversionCachesMock,
} = vi.hoisted(() => {
  const pushRecentViewMock = vi.fn();
  return {
    mockToast: vi.fn(),
    mockMutationCallbacks: {} as Record<
      string,
      { onSuccess?: (result?: unknown) => void; onError?: (err: { message: string }) => void }
    >,
    pushRecentViewMock,
    useLeadRecentViewsMock: vi.fn(() => ({
      recentIds: [] as string[],
      push: pushRecentViewMock,
    })),
    // IFC-248: overridable so a test can drive user=null (pendingNotice branch).
    useRequireAuthMock: vi.fn(() => ({
      isLoading: false,
      isAuthenticated: true,
      user: { id: 'u1', email: 'u@example.com' } as { id: string; email: string } | null,
    })),
    // IFC-248: cache-revalidation mocks must return a Promise (the component
    // does `revalidateLeadCaches(...).catch(...)`); hoisted so resetAll can
    // re-establish the resolved value after vitest mockReset wipes impls.
    invalidateLeadsCacheMock: vi.fn(),
    revalidateLeadCachesMock: vi.fn().mockResolvedValue(undefined),
    revalidateLeadConversionCachesMock: vi.fn().mockResolvedValue(undefined),
  };
});

// Mutable so individual tests can drive view/segment params.
let currentSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => currentSearchParams,
  usePathname: () => '/leads',
  useParams: () => ({}),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: useRequireAuthMock,
}));

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'Europe/London' }),
}));

vi.mock('@/app/leads/(list)/actions', () => ({
  invalidateLeadsCache: invalidateLeadsCacheMock,
}));

vi.mock('@/app/leads/actions', () => ({
  revalidateLeadCaches: revalidateLeadCachesMock,
  revalidateLeadConversionCaches: revalidateLeadConversionCachesMock,
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
      // IFC-248: useMutation captures { onSuccess, onError } into
      // mockMutationCallbacks[name] so tests can drive the callbacks.
      bulkConvert: {
        useMutation: (opts?: (typeof mockMutationCallbacks)[string]) => {
          mockMutationCallbacks.bulkConvert = opts ?? {};
          return mutationMocks.bulkConvert;
        },
      },
      bulkUpdateStatus: {
        useMutation: (opts?: (typeof mockMutationCallbacks)[string]) => {
          mockMutationCallbacks.bulkUpdateStatus = opts ?? {};
          return mutationMocks.bulkUpdateStatus;
        },
      },
      bulkArchive: {
        useMutation: (opts?: (typeof mockMutationCallbacks)[string]) => {
          mockMutationCallbacks.bulkArchive = opts ?? {};
          return mutationMocks.bulkArchive;
        },
      },
      bulkDelete: {
        useMutation: (opts?: (typeof mockMutationCallbacks)[string]) => {
          mockMutationCallbacks.bulkDelete = opts ?? {};
          return mutationMocks.bulkDelete;
        },
      },
      qualify: {
        useMutation: (opts?: (typeof mockMutationCallbacks)[string]) => {
          mockMutationCallbacks.qualify = opts ?? {};
          return mutationMocks.qualify;
        },
      },
      convert: {
        useMutation: (opts?: (typeof mockMutationCallbacks)[string]) => {
          mockMutationCallbacks.convert = opts ?? {};
          return mutationMocks.convert;
        },
      },
      scoreWithAI: {
        useMutation: (opts?: (typeof mockMutationCallbacks)[string]) => {
          mockMutationCallbacks.scoreWithAI = opts ?? {};
          return mutationMocks.score;
        },
      },
      setStarred: {
        useMutation: (opts?: (typeof mockMutationCallbacks)[string]) => {
          mockMutationCallbacks.setStarred = opts ?? {};
          return mutationMocks.setStarred;
        },
      },
      delete: {
        useMutation: (opts?: (typeof mockMutationCallbacks)[string]) => {
          mockMutationCallbacks.delete = opts ?? {};
          return mutationMocks.delete;
        },
      },
    },
  },
}));

vi.mock('@/lib/shared/filter-utils', () => ({
  leadStatusOptions: () => [
    { value: 'NEW', label: 'New' },
    { value: 'QUALIFIED', label: 'Qualified' },
  ],
}));

// IFC-248: deterministic recent-views hook (per-test overridable).
vi.mock('@/lib/leads/use-lead-recent-views', () => ({
  useLeadRecentViews: useLeadRecentViewsMock,
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
  // IFC-248: widened to also render the status/score filter <select>s and the
  // sort <select> so tests can drive setStatusFilter / setScoreFilter /
  // setSortOrder (previously the filters/sort props were silently dropped).
  SearchFilterBar: ({
    searchValue,
    onSearchChange,
    searchPlaceholder,
    filters = [],
    sort,
  }: {
    searchValue: string;
    onSearchChange: (v: string) => void;
    searchPlaceholder: string;
    filters?: Array<{
      id: string;
      value: string;
      onChange: (v: string) => void;
      options: Array<{ value: string; label: string }>;
    }>;
    sort?: {
      value: string;
      onChange: (v: string) => void;
      options: Array<{ value: string; label: string }>;
    };
  }) => (
    <div>
      <input
        data-testid="search-filter-bar"
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {filters.map((f) => (
        <select
          key={f.id}
          data-testid={`filter-${f.id}`}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
        >
          <option value="">All</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {sort ? (
        <select
          data-testid="sort-select"
          value={sort.value}
          onChange={(e) => sort.onChange(e.target.value)}
        >
          {sort.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  ),
}));

vi.mock('@/components/shared/entity-hover-card', () => ({
  EntityHoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@intelliflow/ui', async () => {
  const actual = await import('@intelliflow/ui');
  void actual;
  return {
    // IFC-248: widened to render (a) a button per bulkAction (calls onClick with
    // all current rows = "selected"), and (b) the real column cells per row so
    // StatusBadge / ScoreBadge / formatDate / row-action dropdown render and are
    // reachable to tests. `columns` is typed `any[]` (real ColumnDef<Lead>[] is
    // deep → TS2589 risk in the mock).
    DataTable: ({
      data,
      columns,
      onRowClick,
      emptyMessage,
      bulkActions,
    }: {
      data: Array<Record<string, unknown>>;
      columns?: any[];
      onRowClick?: (row: unknown) => void;
      emptyMessage?: string;
      bulkActions?: Array<{ label: string; onClick: (rows: unknown[]) => void }>;
    }) => {
      if (data.length === 0) return <div data-testid="empty-state">{emptyMessage}</div>;
      return (
        <div>
          {(bulkActions ?? []).map((a) => (
            <button
              key={a.label}
              type="button"
              data-testid={`bulk-${a.label}`}
              onClick={() => a.onClick(data)}
            >
              {a.label}
            </button>
          ))}
          <table>
            <thead>
              <tr>
                {(columns ?? []).map((c: any, i: number) => (
                  <th key={c.id ?? c.accessorKey ?? i}>
                    {typeof c.header === 'function' ? c.header() : c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={String(row.id)} onClick={() => onRowClick?.(row)}>
                  {(columns ?? []).map((c: any, i: number) => (
                    <td key={c.id ?? c.accessorKey ?? i}>
                      {c.cell ? c.cell({ row: { original: row } }) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    },
    // IFC-248: render quick + dropdown actions as buttons (skip separators) so
    // row-action gating (canQualify/canConvert) is queryable + clickable.
    TableRowActions: ({
      quickActions = [],
      dropdownActions = [],
    }: {
      quickActions?: Array<{ label: string; onClick: () => void; separator?: boolean }>;
      dropdownActions?: Array<{ label: string; onClick: () => void; separator?: boolean }>;
    }) => (
      <>
        {[...quickActions, ...dropdownActions]
          .filter((a) => !a.separator && a.label)
          .map((a, i) => (
            <button
              key={`${a.label}-${i}`}
              type="button"
              data-testid={`rowaction-${a.label}`}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
      </>
    ),
    // IFC-248: render a confirm button keyed by confirmLabel when open.
    ConfirmationDialog: ({
      open,
      title,
      description,
      confirmLabel,
      onConfirm,
      variant,
    }: {
      open?: boolean;
      title?: string;
      description?: string;
      confirmLabel?: string;
      onConfirm?: () => void;
      variant?: string;
    }) =>
      open ? (
        <div data-testid={`dialog-${confirmLabel}`} data-variant={variant ?? 'default'}>
          <span>{title}</span>
          <span>{description}</span>
          <button
            type="button"
            data-testid={`confirm-${confirmLabel}`}
            onClick={() => onConfirm?.()}
          >
            {confirmLabel}
          </button>
        </div>
      ) : null,
    // IFC-248: render a confirm button that submits a chosen status when open.
    StatusSelectDialog: ({
      open,
      description,
      options = [],
      onConfirm,
    }: {
      open?: boolean;
      description?: string;
      options?: Array<{ value: string; label: string }>;
      onConfirm?: (status: string) => void;
    }) =>
      open ? (
        <div data-testid="dialog-status" data-option-count={options.length}>
          <span>{description}</span>
          {options.map((o) => (
            <span key={o.value} data-testid={`status-option-${o.value}`}>
              {o.label}
            </span>
          ))}
          <button
            type="button"
            data-testid="status-confirm"
            onClick={() => onConfirm?.('CONTACTED')}
          >
            Apply
          </button>
        </div>
      ) : null,
    toast: mockToast,
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
  currentSearchParams = new URLSearchParams();
  // IFC-248 additions
  mockToast.mockReset();
  pushRecentViewMock.mockReset();
  useLeadRecentViewsMock.mockReturnValue({ recentIds: [], push: pushRecentViewMock });
  useRequireAuthMock.mockReturnValue({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'u1', email: 'u@example.com' },
  });
  invalidateLeadsCacheMock.mockReset();
  revalidateLeadCachesMock.mockReset().mockResolvedValue(undefined);
  revalidateLeadConversionCachesMock.mockReset().mockResolvedValue(undefined);
  for (const k of Object.keys(mockMutationCallbacks)) delete mockMutationCallbacks[k];
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

describe('LeadList — sidebar view + segment wiring', () => {
  beforeEach(resetAll);

  it('view=my → query includes ownerId of current user + page title "My Leads"', () => {
    currentSearchParams = new URLSearchParams('view=my');
    render(<LeadList />);
    expect(screen.getByText(/My Leads/)).toBeTruthy();
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as { ownerId?: string };
    expect(last.ownerId).toBe('u1');
  });

  it('view=starred → query includes isStarred:true, no pending notice', () => {
    currentSearchParams = new URLSearchParams('view=starred');
    render(<LeadList />);
    expect(screen.queryByTestId('lead-scope-pending-notice')).toBeNull();
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as { isStarred?: boolean };
    expect(last.isStarred).toBe(true);
  });

  it('view=recent → query includes ids from the recent-views hook', () => {
    // IFC-248: the useLeadRecentViews hook is mocked; drive recentIds directly.
    useLeadRecentViewsMock.mockReturnValue({
      recentIds: ['lead-1', 'lead-42'],
      push: pushRecentViewMock,
    });
    currentSearchParams = new URLSearchParams('view=recent');
    render(<LeadList />);
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as { ids?: string[] };
    expect(last.ids).toEqual(['lead-1', 'lead-42']);
  });

  it('segment=hot → query includes minScore 80 + title "Hot Leads"', () => {
    currentSearchParams = new URLSearchParams('segment=hot');
    render(<LeadList />);
    expect(screen.getByText(/Hot Leads/)).toBeTruthy();
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as { minScore?: number };
    expect(last.minScore).toBe(80);
  });

  it('segment=new-week → query includes dateFrom ~7 days ago + title "New This Week"', () => {
    currentSearchParams = new URLSearchParams('segment=new-week');
    render(<LeadList />);
    expect(screen.getByText(/New This Week/)).toBeTruthy();
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as { dateFrom?: Date };
    expect(last.dateFrom).toBeInstanceOf(Date);
    const diffDays = (Date.now() - (last.dateFrom as Date).getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThanOrEqual(6.9);
    expect(diffDays).toBeLessThanOrEqual(7.1);
  });

  it('segment=followup → query includes lastContactedBefore ~7 days ago; no pending notice', () => {
    currentSearchParams = new URLSearchParams('segment=followup');
    render(<LeadList />);
    expect(screen.getByText(/Needs Follow-up/)).toBeTruthy();
    expect(screen.queryByTestId('lead-scope-pending-notice')).toBeNull();
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as {
      lastContactedBefore?: Date;
    };
    expect(last.lastContactedBefore).toBeInstanceOf(Date);
    const diffDays =
      (Date.now() - (last.lastContactedBefore as Date).getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThanOrEqual(6.9);
    expect(diffDays).toBeLessThanOrEqual(7.1);
  });
});

// ---------------------------------------------------------------------------
// IFC-248: filtering & sorting (AC-01..AC-10) + pendingNotice branch
// ---------------------------------------------------------------------------
describe('LeadList — filtering & sorting (IFC-248)', () => {
  beforeEach(resetAll);

  it('status filter feeds the query status array (AC-01)', () => {
    render(<LeadList />);
    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'QUALIFIED' } });
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as { status?: string[] };
    expect(last.status).toEqual(['QUALIFIED']);
  });

  it('score filter "high" sets minScore 80 only (AC-02)', () => {
    render(<LeadList />);
    fireEvent.change(screen.getByTestId('filter-score'), { target: { value: 'high' } });
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as {
      minScore?: number;
      maxScore?: number;
    };
    expect(last.minScore).toBe(80);
    expect(last.maxScore).toBeUndefined();
  });

  it('score filter "medium" sets minScore 50 / maxScore 79 (AC-02)', () => {
    render(<LeadList />);
    fireEvent.change(screen.getByTestId('filter-score'), { target: { value: 'medium' } });
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as {
      minScore?: number;
      maxScore?: number;
    };
    expect(last.minScore).toBe(50);
    expect(last.maxScore).toBe(79);
  });

  it('score filter "low" sets maxScore 49 only (AC-02)', () => {
    render(<LeadList />);
    fireEvent.change(screen.getByTestId('filter-score'), { target: { value: 'low' } });
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as {
      minScore?: number;
      maxScore?: number;
    };
    expect(last.maxScore).toBe(49);
    expect(last.minScore).toBeUndefined();
  });

  it('sort "score-high" maps to sortBy score / desc (AC-03)', () => {
    render(<LeadList />);
    fireEvent.change(screen.getByTestId('sort-select'), { target: { value: 'score-high' } });
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as {
      sortBy?: string;
      sortOrder?: string;
    };
    expect(last.sortBy).toBe('score');
    expect(last.sortOrder).toBe('desc');
  });

  it('sort "oldest" maps to createdAt / asc (AC-03)', () => {
    render(<LeadList />);
    fireEvent.change(screen.getByTestId('sort-select'), { target: { value: 'oldest' } });
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as {
      sortBy?: string;
      sortOrder?: string;
    };
    expect(last.sortBy).toBe('createdAt');
    expect(last.sortOrder).toBe('asc');
  });

  it('in-page score filter overrides segment=hot scope minScore via ?? (AC-04)', () => {
    currentSearchParams = new URLSearchParams('segment=hot');
    render(<LeadList />);
    fireEvent.change(screen.getByTestId('filter-score'), { target: { value: 'medium' } });
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as {
      minScore?: number;
      maxScore?: number;
    };
    expect(last.minScore).toBe(50);
    expect(last.maxScore).toBe(79);
  });

  it('status filter coexists with view=starred scope (AC-05)', () => {
    currentSearchParams = new URLSearchParams('view=starred');
    render(<LeadList />);
    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'QUALIFIED' } });
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as {
      status?: string[];
      isStarred?: boolean;
    };
    expect(last.status).toEqual(['QUALIFIED']);
    expect(last.isStarred).toBe(true);
  });

  it('an active filter stops initialData being passed to useQuery (AC-06)', () => {
    render(<LeadList initialData={{ data: twoLeads, total: 2, hasMore: false }} />);
    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'QUALIFIED' } });
    const last = listQueryCalls[listQueryCalls.length - 1] as {
      options: { initialData?: unknown };
    };
    expect(last.options.initialData).toBeUndefined();
  });

  it('active filter + empty data shows the filter-aware empty message (AC-07)', () => {
    mockListQueryState.data = { data: [], total: 0, hasMore: false };
    render(<LeadList />);
    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'QUALIFIED' } });
    expect(screen.getByText(/No leads match your search criteria/)).toBeTruthy();
  });

  it('view=all forwards no ownerId (AC-08)', () => {
    render(<LeadList />);
    const last = listQueryCalls[listQueryCalls.length - 1]?.input as { ownerId?: string };
    expect(last.ownerId).toBeUndefined();
  });

  it('Next advances page then changing a filter resets to page 1 (AC-09 / AC-10)', () => {
    mockListQueryState.data = { data: twoLeads, total: 20, hasMore: true };
    render(<LeadList />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    let last = listQueryCalls[listQueryCalls.length - 1]?.input as { page?: number };
    expect(last.page).toBe(2);
    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'QUALIFIED' } });
    last = listQueryCalls[listQueryCalls.length - 1]?.input as { page?: number };
    expect(last.page).toBe(1);
  });

  it('renders the pendingNotice banner for view=my when the user is null (branch cover)', () => {
    useRequireAuthMock.mockReturnValue({ isLoading: false, isAuthenticated: true, user: null });
    currentSearchParams = new URLSearchParams('view=my');
    render(<LeadList />);
    expect(screen.getByTestId('lead-scope-pending-notice')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// IFC-248: bulk operations (AC-11..AC-16)
// ---------------------------------------------------------------------------
describe('LeadList — bulk operations (IFC-248)', () => {
  beforeEach(() => {
    resetAll();
    // vitest mockReset:true wipes impls between tests — re-establish resolved values.
    mutationMocks.bulkConvert.mutateAsync.mockResolvedValue({ successful: [], failed: [] });
    mutationMocks.bulkUpdateStatus.mutateAsync.mockResolvedValue({ successful: [], failed: [] });
    mutationMocks.bulkArchive.mutateAsync.mockResolvedValue({ successful: [], failed: [] });
    mutationMocks.bulkDelete.mutateAsync.mockResolvedValue({ successful: [], failed: [] });
  });

  it('bulk convert → confirm → bulkConvert.mutateAsync with selected ids (AC-11)', async () => {
    render(<LeadList />);
    fireEvent.click(screen.getByTestId('bulk-Convert to Contacts'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-Convert'));
    });
    expect(mutationMocks.bulkConvert.mutateAsync).toHaveBeenCalledWith({
      ids: ['lead-1', 'lead-2'],
      createAccounts: false,
    });
  });

  it('bulk update status → status dialog confirm → bulkUpdateStatus.mutateAsync (AC-12)', async () => {
    render(<LeadList />);
    fireEvent.click(screen.getByTestId('bulk-Update Status'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('status-confirm'));
    });
    expect(mutationMocks.bulkUpdateStatus.mutateAsync).toHaveBeenCalledWith({
      ids: ['lead-1', 'lead-2'],
      status: 'CONTACTED',
    });
  });

  it('bulk archive dialog states it sets status to Lost → bulkArchive.mutateAsync (AC-13)', async () => {
    render(<LeadList />);
    fireEvent.click(screen.getByTestId('bulk-Archive'));
    expect(screen.getByText(/set their status to Lost/i)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-Archive'));
    });
    expect(mutationMocks.bulkArchive.mutateAsync).toHaveBeenCalledWith({
      ids: ['lead-1', 'lead-2'],
    });
  });

  it('bulk delete dialog is destructive + warns about converted leads → bulkDelete.mutateAsync (AC-14)', async () => {
    render(<LeadList />);
    fireEvent.click(screen.getByTestId('bulk-Delete'));
    expect(screen.getByTestId('dialog-Delete').getAttribute('data-variant')).toBe('destructive');
    expect(screen.getByText(/Converted leads cannot be deleted/i)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-Delete'));
    });
    expect(mutationMocks.bulkDelete.mutateAsync).toHaveBeenCalledWith({
      ids: ['lead-1', 'lead-2'],
    });
  });

  it('bulk convert success toasts a success message (AC-15)', async () => {
    mutationMocks.bulkConvert.mutateAsync.mockResolvedValueOnce({
      successful: ['lead-1', 'lead-2'],
      failed: [],
    });
    render(<LeadList />);
    fireEvent.click(screen.getByTestId('bulk-Convert to Contacts'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-Convert'));
    });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Leads Converted' }));
  });

  it('bulk convert partial failure toasts a destructive message (AC-15)', async () => {
    mutationMocks.bulkConvert.mutateAsync.mockResolvedValueOnce({
      successful: [],
      failed: [{ id: 'lead-2', error: 'boom' }],
    });
    render(<LeadList />);
    fireEvent.click(screen.getByTestId('bulk-Convert to Contacts'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-Convert'));
    });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('status dialog offers exactly the 6 non-CONVERTED statuses (AC-16)', () => {
    render(<LeadList />);
    fireEvent.click(screen.getByTestId('bulk-Update Status'));
    expect(screen.getByTestId('dialog-status').getAttribute('data-option-count')).toBe('6');
    expect(screen.queryByTestId('status-option-CONVERTED')).toBeNull();
  });

  it('bulk mutation onSuccess handlers run their cache-invalidation wiring', () => {
    render(<LeadList />);
    act(() => {
      mockMutationCallbacks.bulkConvert?.onSuccess?.();
      mockMutationCallbacks.bulkUpdateStatus?.onSuccess?.();
      mockMutationCallbacks.bulkArchive?.onSuccess?.();
      mockMutationCallbacks.bulkDelete?.onSuccess?.();
    });
    expect(mockMutationCallbacks.bulkConvert).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// IFC-248: row actions, status gating & cell rendering (AC-17..AC-24)
// ---------------------------------------------------------------------------
describe('LeadList — row actions, status gating & cell rendering (IFC-248)', () => {
  beforeEach(resetAll);

  const baseLead = {
    id: 'lead-1',
    email: 'a@example.com',
    firstName: 'Alice',
    lastName: 'Anderson',
    company: 'Alpha',
    title: 'CEO',
    score: 85,
    phone: '+1',
    source: 'WEBSITE',
    isStarred: false,
    owner: null,
  };
  const oneLead = (over: Record<string, unknown>) => ({
    data: { data: [{ ...baseLead, createdAt: new Date(), ...over }], total: 1, hasMore: false },
  });

  it('NEW lead exposes Qualify but not Convert (AC-17)', () => {
    mockListQueryState.data = oneLead({ status: 'NEW' }).data;
    render(<LeadList />);
    expect(screen.getByTestId('rowaction-Qualify Lead')).toBeTruthy();
    expect(screen.queryByTestId('rowaction-Convert to Contact')).toBeNull();
  });

  it('QUALIFIED lead exposes Convert but not Qualify (AC-18)', () => {
    mockListQueryState.data = oneLead({ status: 'QUALIFIED' }).data;
    render(<LeadList />);
    expect(screen.getByTestId('rowaction-Convert to Contact')).toBeTruthy();
    expect(screen.queryByTestId('rowaction-Qualify Lead')).toBeNull();
  });

  it('CONVERTED lead exposes neither Qualify nor Convert (AC-19)', () => {
    mockListQueryState.data = oneLead({ status: 'CONVERTED' }).data;
    render(<LeadList />);
    expect(screen.queryByTestId('rowaction-Qualify Lead')).toBeNull();
    expect(screen.queryByTestId('rowaction-Convert to Contact')).toBeNull();
  });

  it('row Convert calls convert.mutate with createAccount true (AC-20)', () => {
    mockListQueryState.data = oneLead({ status: 'QUALIFIED' }).data;
    render(<LeadList />);
    fireEvent.click(screen.getByTestId('rowaction-Convert to Contact'));
    expect(mutationMocks.convert.mutate).toHaveBeenCalledWith({
      leadId: 'lead-1',
      createAccount: true,
    });
  });

  it('row Qualify / Score / Star / Delete fire mutations; delete opens no dialog (AC-21)', () => {
    mockListQueryState.data = oneLead({ status: 'NEW' }).data;
    render(<LeadList />);
    fireEvent.click(screen.getByTestId('rowaction-Qualify Lead'));
    expect(mutationMocks.qualify.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-1' })
    );
    fireEvent.click(screen.getByTestId('rowaction-Score with AI'));
    expect(mutationMocks.score.mutate).toHaveBeenCalledWith({ leadId: 'lead-1' });
    fireEvent.click(screen.getByTestId('rowaction-Star'));
    expect(mutationMocks.setStarred.mutate).toHaveBeenCalledWith({ id: 'lead-1', starred: true });
    fireEvent.click(screen.getByTestId('rowaction-Delete'));
    expect(mutationMocks.delete.mutate).toHaveBeenCalledWith({ id: 'lead-1' });
    expect(screen.queryByTestId('dialog-Delete')).toBeNull();
  });

  it('row Edit navigates to the edit page (AC-21)', () => {
    mockListQueryState.data = oneLead({ status: 'NEW' }).data;
    render(<LeadList />);
    fireEvent.click(screen.getByTestId('rowaction-Edit Lead'));
    expect(mockPush).toHaveBeenCalledWith('/leads/lead-1/edit');
  });

  it('individual mutation onSuccess/onError handlers fire the right toasts (AC-22)', () => {
    render(<LeadList />);
    act(() => mockMutationCallbacks.delete?.onSuccess?.());
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lead Deleted' }));
    act(() => mockMutationCallbacks.delete?.onError?.({ message: 'nope' }));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Delete Failed', variant: 'destructive' })
    );
    act(() => mockMutationCallbacks.convert?.onSuccess?.());
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lead Converted' }));
    act(() => mockMutationCallbacks.convert?.onError?.({ message: 'x' }));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Conversion Failed' }));
    act(() => mockMutationCallbacks.qualify?.onSuccess?.());
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lead Qualified' }));
    act(() => mockMutationCallbacks.qualify?.onError?.({ message: 'x' }));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Qualification Failed' })
    );
    act(() => mockMutationCallbacks.scoreWithAI?.onSuccess?.({ score: 90, confidence: 0.8 }));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lead Scored' }));
    act(() => mockMutationCallbacks.scoreWithAI?.onError?.({ message: 'x' }));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Scoring Failed' }));
    act(() => mockMutationCallbacks.setStarred?.onSuccess?.({ isStarred: true }));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lead Starred' }));
    act(() => mockMutationCallbacks.setStarred?.onError?.({ message: 'x' }));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Update Failed' }));
  });

  it('row click records a recent view and navigates (AC-23)', () => {
    mockListQueryState.data = oneLead({ status: 'NEW' }).data;
    render(<LeadList />);
    const row = screen.getByText('Alice Anderson').closest('tr');
    if (!row) throw new Error('row not found');
    fireEvent.click(row);
    expect(pushRecentViewMock).toHaveBeenCalledWith('lead-1');
    expect(mockPush).toHaveBeenCalledWith('/leads/lead-1');
  });

  it('renders a status badge for every lead status (AC-24)', () => {
    const statuses = [
      'NEW',
      'CONTACTED',
      'QUALIFIED',
      'NEGOTIATING',
      'UNQUALIFIED',
      'CONVERTED',
      'LOST',
    ];
    mockListQueryState.data = {
      data: statuses.map((s, i) => ({
        ...baseLead,
        id: `lead-${i}`,
        firstName: `L${i}`,
        status: s,
        score: 50,
        createdAt: new Date(),
      })),
      total: statuses.length,
      hasMore: false,
    };
    render(<LeadList />);
    ['New', 'Contacted', 'Qualified', 'Negotiating', 'Unqualified', 'Converted', 'Lost'].forEach(
      (label) => {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      }
    );
  });

  it('renders score badges across high/medium/low thresholds (AC-24)', () => {
    mockListQueryState.data = {
      data: [
        {
          ...baseLead,
          id: 'l-hi',
          firstName: 'Hi',
          score: 85,
          status: 'NEW',
          createdAt: new Date(),
        },
        {
          ...baseLead,
          id: 'l-mid',
          firstName: 'Mid',
          score: 60,
          status: 'NEW',
          createdAt: new Date(),
        },
        {
          ...baseLead,
          id: 'l-lo',
          firstName: 'Lo',
          score: 30,
          status: 'NEW',
          createdAt: new Date(),
        },
      ],
      total: 3,
      hasMore: false,
    };
    render(<LeadList />);
    expect(screen.getByText('85')).toBeTruthy();
    expect(screen.getByText('60')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
  });

  it('formats created dates across all relative branches (AC-24)', () => {
    const now = Date.now();
    mockListQueryState.data = {
      data: [
        {
          ...baseLead,
          id: 'd1',
          firstName: 'Recent',
          score: 50,
          status: 'NEW',
          createdAt: new Date(now - 30 * 60 * 1000),
        },
        {
          ...baseLead,
          id: 'd2',
          firstName: 'Hours',
          score: 50,
          status: 'NEW',
          createdAt: new Date(now - 3 * 60 * 60 * 1000),
        },
        {
          ...baseLead,
          id: 'd3',
          firstName: 'Days',
          score: 50,
          status: 'NEW',
          createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
        },
        {
          ...baseLead,
          id: 'd4',
          firstName: 'Old',
          score: 50,
          status: 'NEW',
          createdAt: new Date('2025-01-15T00:00:00Z'),
        },
        {
          ...baseLead,
          id: 'd5',
          firstName: 'Bad',
          score: 50,
          status: 'NEW',
          createdAt: 'not-a-date',
        },
      ],
      total: 5,
      hasMore: false,
    };
    render(<LeadList />);
    expect(screen.getByText('Just now')).toBeTruthy();
    expect(screen.getByText(/hours? ago/)).toBeTruthy();
    expect(screen.getByText(/days? ago/)).toBeTruthy();
    expect(screen.getByText(/2025/)).toBeTruthy();
    expect(screen.getByText('Invalid date')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// IFC-248: misc interaction handlers (pagination Previous, email link, quick
// actions) — closes the remaining row-cell callback coverage.
// ---------------------------------------------------------------------------
describe('LeadList — misc interaction handlers (IFC-248)', () => {
  beforeEach(resetAll);

  const rowLead = {
    id: 'lead-1',
    email: 'a@example.com',
    firstName: 'Alice',
    lastName: 'Anderson',
    company: 'Alpha',
    title: 'CEO',
    score: 85,
    status: 'NEW',
    phone: '+15550000',
    source: 'WEBSITE',
    isStarred: false,
    owner: null,
    createdAt: new Date(),
  };

  it('Previous button returns from page 2 to page 1 (covers Previous handler)', () => {
    mockListQueryState.data = { data: twoLeads, total: 20, hasMore: true };
    render(<LeadList />);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect((listQueryCalls[listQueryCalls.length - 1]?.input as { page?: number }).page).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: /Previous/i }));
    expect((listQueryCalls[listQueryCalls.length - 1]?.input as { page?: number }).page).toBe(1);
  });

  it('clicking the email link stops row-click propagation (covers email cell handler)', () => {
    mockListQueryState.data = { data: [rowLead], total: 1, hasMore: false };
    render(<LeadList />);
    const link = screen.getByText('a@example.com');
    fireEvent.click(link);
    // stopPropagation prevents the row onRowClick navigation from firing
    expect(mockPush).not.toHaveBeenCalledWith('/leads/lead-1');
  });

  it('quick Call action opens a tel: link when the lead has a phone (covers Call handler)', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    mockListQueryState.data = { data: [rowLead], total: 1, hasMore: false };
    render(<LeadList />);
    fireEvent.click(screen.getByTestId('rowaction-Call'));
    expect(openSpy).toHaveBeenCalledWith('tel:+15550000');
    openSpy.mockRestore();
  });

  it('mutation onSuccess handlers swallow a failing cache revalidation (covers .catch handlers)', async () => {
    revalidateLeadCachesMock.mockRejectedValue(new Error('revalidate failed'));
    revalidateLeadConversionCachesMock.mockRejectedValue(new Error('revalidate failed'));
    render(<LeadList />);
    await act(async () => {
      mockMutationCallbacks.delete?.onSuccess?.();
      mockMutationCallbacks.convert?.onSuccess?.();
      mockMutationCallbacks.qualify?.onSuccess?.();
      mockMutationCallbacks.scoreWithAI?.onSuccess?.({ score: 90, confidence: 0.8 });
      mockMutationCallbacks.setStarred?.onSuccess?.({ isStarred: true });
      mockMutationCallbacks.bulkConvert?.onSuccess?.();
      mockMutationCallbacks.bulkUpdateStatus?.onSuccess?.();
      mockMutationCallbacks.bulkArchive?.onSuccess?.();
      mockMutationCallbacks.bulkDelete?.onSuccess?.();
      // let the rejected revalidation promises settle so the .catch() arms run
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(revalidateLeadCachesMock).toHaveBeenCalled();
  });

  it('quick Send Email action targets the compose route (covers Send Email handler)', () => {
    const original = window.location;
    // jsdom does not implement navigation; stub location so the href setter is a no-op.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...original, href: '' },
    });
    mockListQueryState.data = { data: [rowLead], total: 1, hasMore: false };
    render(<LeadList />);
    fireEvent.click(screen.getByTestId('rowaction-Send Email'));
    expect(window.location.href).toContain('/email/compose?to=');
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: original,
    });
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
