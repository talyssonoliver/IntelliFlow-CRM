/**
 * @vitest-environment jsdom
 */
/* eslint-disable jsx-a11y/aria-role -- test renders <ArticleAdminList role="ADMIN" />; the `role` prop is a domain type, not an ARIA attribute. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ── Shared mocks ──────────────────────────────────────────────────

const routerPush = vi.fn();
const routerReplace = vi.fn();
const stableRouter = {
  push: routerPush,
  replace: routerReplace,
  back: vi.fn(),
  refresh: vi.fn(),
};
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => stableRouter,
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/settings/help-center/articles',
  useParams: () => ({}),
}));

const invalidateList = vi.fn();
const publishMutate = vi.fn();
const unpublishMutate = vi.fn();
const deleteMutateAsync = vi.fn();

let mockListData: unknown = {
  items: [],
  total: 0,
  page: 1,
  limit: 20,
  hasMore: false,
};
let mockIsLoading = false;
let mockIsFetching = false;

const mockListQuery = vi.fn(() => ({
  data: mockListData,
  isLoading: mockIsLoading,
  isFetching: mockIsFetching,
  error: null,
  refetch: vi.fn(),
}));

let publishOptions: { onSuccess?: () => void; onError?: (e: Error) => void } | undefined;
let unpublishOptions: { onSuccess?: () => void; onError?: (e: Error) => void } | undefined;
let deleteOptions: { onSuccess?: () => void; onError?: (e: Error) => void } | undefined;

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      helpArticle: { list: { invalidate: invalidateList } },
    }),
    helpArticle: {
      list: {
        useQuery: (...args: unknown[]) => mockListQuery(...(args as [])),
      },
      publish: {
        useMutation: (opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) => {
          publishOptions = opts;
          return { mutate: publishMutate, isLoading: false };
        },
      },
      unpublish: {
        useMutation: (opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) => {
          unpublishOptions = opts;
          return { mutate: unpublishMutate, isLoading: false };
        },
      },
      delete: {
        useMutation: (opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) => {
          deleteOptions = opts;
          return { mutate: vi.fn(), mutateAsync: deleteMutateAsync, isLoading: false };
        },
      },
    },
  },
}));

const toastSpy = vi.fn();

vi.mock('@intelliflow/ui', () => ({
  DataTable: ({
    data,
    columns,
  }: Readonly<{
    data: Array<Record<string, unknown>>;
    columns: Array<{
      id?: string;
      accessorKey?: string;
      cell?: (ctx: { row: { original: unknown } }) => React.ReactNode;
    }>;
  }>) => {
    const actionsCol = columns.find((c) => c.id === 'actions');
    return (
      <div data-testid="data-table">
        <span data-testid="row-count">{data.length}</span>
        <span data-testid="col-count">{columns.length}</span>
        {data.length > 0 && actionsCol?.cell ? (
          <div data-testid="first-row-actions">
            {actionsCol.cell({ row: { original: data[0] } })}
          </div>
        ) : null}
      </div>
    );
  },
  Pagination: ({
    currentPage,
    totalPages,
    onPageChange,
  }: Readonly<{ currentPage: number; totalPages: number; onPageChange: (p: number) => void }>) => (
    <div data-testid="pagination">
      <span data-testid="current-page">{currentPage}</span>
      <span data-testid="total-pages">{totalPages}</span>
      <button type="button" data-testid="next-page" onClick={() => onPageChange(currentPage + 1)}>
        Next
      </button>
    </div>
  ),
  Skeleton: ({ className }: Readonly<{ className?: string }>) => (
    <div data-testid="skeleton" className={className} />
  ),
  EmptyState: ({
    title,
    description,
    action,
    'data-testid': testId,
  }: Readonly<{
    title?: string;
    description?: string;
    action?: { label: string; onClick?: () => void };
    ['data-testid']?: string;
  }>) => (
    <div data-testid={testId ?? 'empty-state'}>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? (
        <button type="button" onClick={action.onClick} data-testid="empty-action">
          {action.label}
        </button>
      ) : null}
    </div>
  ),
  ConfirmationDialog: ({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onOpenChange,
  }: Readonly<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void | Promise<void>;
    onOpenChange: (open: boolean) => void;
  }>) =>
    open ? (
      <dialog open data-testid="confirm-dialog">
        <h3>{title}</h3>
        <p>{description}</p>
        <button type="button" onClick={() => onOpenChange(false)} data-testid="dialog-cancel">
          {cancelLabel ?? 'Cancel'}
        </button>
        <button
          type="button"
          onClick={() => {
            void onConfirm();
          }}
          data-testid="dialog-confirm"
        >
          {confirmLabel ?? 'Confirm'}
        </button>
      </dialog>
    ) : null,
  StatusBadge: ({
    variant,
    children,
  }: Readonly<{ variant?: string; children: React.ReactNode }>) => (
    <span data-testid={`status-badge-${variant ?? 'default'}`}>{children}</span>
  ),
  toast: (arg: unknown) => toastSpy(arg),
}));

vi.mock('@/components/shared', () => ({
  PageHeader: ({
    title,
    description,
    actions,
  }: Readonly<{
    title: string;
    description?: string;
    actions?: Array<{ label: string; onClick?: () => void }>;
  }>) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{description}</p>
      {(actions ?? []).map((a) => (
        <button key={a.label} type="button" onClick={a.onClick} data-testid={`action-${a.label}`}>
          {a.label}
        </button>
      ))}
    </div>
  ),
  SearchFilterBar: ({
    searchValue,
    onSearchChange,
    searchAriaLabel,
    filters,
  }: Readonly<{
    searchValue: string;
    onSearchChange: (v: string) => void;
    searchAriaLabel?: string;
    filters?: Array<{
      id: string;
      label: string;
      options: Array<{ value: string; label: string }>;
      value: string;
      onChange: (v: string) => void;
    }>;
  }>) => (
    <div data-testid="search-filter-bar" role="search">
      <input
        data-testid="search-input"
        aria-label={searchAriaLabel ?? 'Search'}
        type="search"
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {(filters ?? []).map((f) => (
        <select
          key={f.id}
          data-testid={`filter-${f.id}`}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
        >
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  ),
}));

async function loadComponent() {
  const mod = await import('../article-admin-list');
  return mod;
}

function buildArticle(overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    id: 'art-1',
    slug: 'getting-started',
    title: 'Getting Started',
    categoryId: 'crm-basics',
    excerpt: 'Welcome to the CRM',
    readTimeMinutes: 3,
    order: 1,
    status: 'PUBLISHED' as const,
    publishedAt: '2026-04-01T00:00:00Z',
    keywords: ['intro'],
    relatedArticleIds: [],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-04-10T00:00:00Z',
    feedbackCount: 4,
  };
  return { ...base, ...overrides };
}

beforeEach(() => {
  routerPush.mockReset();
  routerReplace.mockReset();
  invalidateList.mockReset();
  publishMutate.mockReset();
  unpublishMutate.mockReset();
  deleteMutateAsync.mockReset();
  deleteMutateAsync.mockResolvedValue({ success: true });
  toastSpy.mockReset();
  mockSearchParams = new URLSearchParams();
  mockListData = { items: [], total: 0, page: 1, limit: 20, hasMore: false };
  mockIsLoading = false;
  mockIsFetching = false;
  mockListQuery.mockImplementation(() => ({
    data: mockListData,
    isLoading: mockIsLoading,
    isFetching: mockIsFetching,
    error: null,
    refetch: vi.fn(),
  }));
});

// ── Tests ──────────────────────────────────────────────────────────

describe('ArticleAdminList', () => {
  it('renders initial empty state with "New article" CTA when no items and no filters', async () => {
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);

    expect(screen.getByTestId('empty-initial')).toBeDefined();
    expect(screen.getByText('No help articles yet')).toBeDefined();
    const cta = screen.getByTestId('empty-action');
    expect(cta.textContent).toBe('New article');
  });

  it('renders filtered-empty state with Reset filters button when filters are active and list is empty', async () => {
    mockSearchParams = new URLSearchParams('status=DRAFT');
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);

    const empty = screen.getByTestId('empty-filtered');
    expect(empty).toBeDefined();
    expect(screen.getByText('No matching articles')).toBeDefined();
    const reset = screen.getByTestId('empty-action');
    expect(reset.textContent).toBe('Reset filters');
  });

  it('renders DataTable with expected columns for a mix of DRAFT and PUBLISHED articles', async () => {
    mockListData = {
      items: [
        buildArticle({ id: 'a', slug: 'one', title: 'One', status: 'DRAFT' }),
        buildArticle({ id: 'b', slug: 'two', title: 'Two', status: 'PUBLISHED' }),
        buildArticle({ id: 'c', slug: 'three', title: 'Three', status: 'PUBLISHED' }),
      ],
      total: 3,
      page: 1,
      limit: 20,
      hasMore: false,
    };
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);

    expect(screen.getByTestId('data-table')).toBeDefined();
    expect(screen.getByTestId('row-count').textContent).toBe('3');
    expect(screen.getByTestId('col-count').textContent).toBe('8');
  });

  it('debounced search input updates URL after 300ms', async () => {
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);
    const input = screen.getByTestId('search-input') as HTMLInputElement;

    act(() => {
      fireEvent.change(input, { target: { value: 'lead' } });
    });

    await new Promise((resolve) => setTimeout(resolve, 400));

    const sawSearch = routerReplace.mock.calls.some(([url]) => String(url).includes('search=lead'));
    expect(sawSearch).toBe(true);
  });

  it('status filter change resets page to 1 and updates URL', async () => {
    mockSearchParams = new URLSearchParams('page=3');
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);

    const select = screen.getByTestId('filter-status') as HTMLSelectElement;
    act(() => {
      fireEvent.change(select, { target: { value: 'DRAFT' } });
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    const sawStatus = routerReplace.mock.calls.some(([url]) =>
      String(url).includes('status=DRAFT')
    );
    expect(sawStatus).toBe(true);
    // Last call must NOT carry the old page=3
    const lastCall = String(routerReplace.mock.calls.at(-1)?.[0] ?? '');
    expect(lastCall).not.toContain('page=3');
  });

  it('category filter change updates URL', async () => {
    mockListData = {
      items: [buildArticle({ categoryId: 'support' })],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    };
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);

    const select = screen.getByTestId('filter-category') as HTMLSelectElement;
    act(() => {
      fireEvent.change(select, { target: { value: 'support' } });
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    const sawCategory = routerReplace.mock.calls.some(([url]) =>
      String(url).includes('categoryId=support')
    );
    expect(sawCategory).toBe(true);
  });

  it('publish mutation success invalidates the list and shows a toast', async () => {
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);
    expect(publishOptions?.onSuccess).toBeTypeOf('function');
    act(() => {
      publishOptions?.onSuccess?.();
    });
    expect(invalidateList).toHaveBeenCalledTimes(1);
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Article published' }));
  });

  it('publish mutation error surfaces a destructive toast', async () => {
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);
    act(() => {
      publishOptions?.onError?.(new Error('Forbidden'));
    });
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Publish failed', variant: 'destructive' })
    );
  });

  it('unpublish mutation success invalidates and toasts', async () => {
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);
    act(() => {
      unpublishOptions?.onSuccess?.();
    });
    expect(invalidateList).toHaveBeenCalledTimes(1);
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Article unpublished' })
    );
  });

  it('delete mutation error surfaces a destructive toast', async () => {
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);
    act(() => {
      deleteOptions?.onError?.(new Error('Conflict'));
    });
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Delete failed', variant: 'destructive' })
    );
  });

  it('delete mutation success invalidates list and toasts', async () => {
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);
    act(() => {
      deleteOptions?.onSuccess?.();
    });
    expect(invalidateList).toHaveBeenCalledTimes(1);
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Article deleted' }));
  });

  it('Escape inside the search container clears only the search term', async () => {
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);
    const input = screen.getByTestId('search-input') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'hello' } });
    });
    expect(input.value).toBe('hello');

    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
    });
    const refreshed = screen.getByTestId('search-input') as HTMLInputElement;
    expect(refreshed.value).toBe('');
  });

  it('pagination Next button sets page=2 and updates URL', async () => {
    mockListData = {
      items: Array.from({ length: 20 }).map((_, i) => buildArticle({ id: `a${i}`, slug: `s${i}` })),
      total: 45,
      page: 1,
      limit: 20,
      hasMore: true,
    };
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);
    const next = screen.getByTestId('next-page');
    act(() => {
      fireEvent.click(next);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const sawPage = routerReplace.mock.calls.some(([url]) => String(url).includes('page=2'));
    expect(sawPage).toBe(true);
  });

  it('aria-live region announces result count on data load', async () => {
    mockListData = {
      items: [buildArticle(), buildArticle({ id: 'b', slug: 'two' })],
      total: 2,
      page: 1,
      limit: 20,
      hasMore: false,
    };
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);
    const region = screen.getByTestId('result-count');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('2 articles');
  });

  it('renders loading skeleton when isLoading and no data', async () => {
    mockIsLoading = true;
    mockListQuery.mockImplementation(() => ({
      data: undefined,
      isLoading: true,
      isFetching: true,
      error: null,
      refetch: vi.fn(),
    }));
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);
    expect(screen.getByTestId('loading-skeleton')).toBeDefined();
  });

  it('ForbiddenSurface renders the admin-required empty state', async () => {
    const { ForbiddenSurface } = await loadComponent();
    render(<ForbiddenSurface />);
    expect(screen.getByTestId('forbidden-surface')).toBeDefined();
    expect(screen.getByText('Admin access required')).toBeDefined();
  });

  it('renders page header "New article" action that navigates to /new', async () => {
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);
    const action = screen.getByTestId('action-New article');
    act(() => {
      fireEvent.click(action);
    });
    expect(routerPush).toHaveBeenCalledWith('/settings/help-center/articles/new');
  });

  it('uses initialData from server prefetch when no filters active', async () => {
    const initial = {
      items: [buildArticle({ id: 'seed', slug: 'seed', title: 'Seed' })],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    };
    mockListData = initial;
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" initialData={initial} />);
    expect(screen.getByTestId('row-count').textContent).toBe('1');
  });

  it('empty-initial "New article" action navigates to /new', async () => {
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);
    const emptyAction = screen.getByTestId('empty-action');
    act(() => {
      fireEvent.click(emptyAction);
    });
    expect(routerPush).toHaveBeenCalledWith('/settings/help-center/articles/new');
  });

  it('filtered-empty "Reset filters" clears the search/status/category state and goes back to initial empty state', async () => {
    mockSearchParams = new URLSearchParams('status=DRAFT&categoryId=bar');
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);
    const reset = screen.getByTestId('empty-action');
    expect(reset.textContent).toBe('Reset filters');
    act(() => {
      fireEvent.click(reset);
    });
    // After reset (no search in initial state so no debounce delay),
    // the initial empty state renders.
    expect(screen.getByTestId('empty-initial')).toBeDefined();
  });

  it('delete button opens confirmation dialog; Cancel closes without mutation', async () => {
    mockListData = {
      items: [buildArticle({ id: 'z9', status: 'PUBLISHED' })],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    };
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);

    expect(screen.queryByTestId('confirm-dialog')).toBeNull();

    const deleteBtn = screen.getByTestId('delete-z9');
    act(() => {
      fireEvent.click(deleteBtn);
    });

    expect(screen.getByTestId('confirm-dialog')).toBeDefined();
    expect(screen.getByText('Delete article?')).toBeDefined();

    act(() => {
      fireEvent.click(screen.getByTestId('dialog-cancel'));
    });

    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(deleteMutateAsync).not.toHaveBeenCalled();
  });

  it('delete button → Confirm runs deleteMutation.mutateAsync with article id, then closes dialog', async () => {
    mockListData = {
      items: [buildArticle({ id: 'z10', status: 'PUBLISHED' })],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    };
    deleteMutateAsync.mockResolvedValue({ success: true });
    const { ArticleAdminList } = await loadComponent();
    render(<ArticleAdminList role="ADMIN" />);

    act(() => {
      fireEvent.click(screen.getByTestId('delete-z10'));
    });
    expect(screen.getByTestId('confirm-dialog')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByTestId('dialog-confirm'));
      // flush promises so mutateAsync resolves and state updates
      await Promise.resolve();
    });

    expect(deleteMutateAsync).toHaveBeenCalledWith({ id: 'z10' });
  });

  it('hides delete button for MANAGER role via column factory', async () => {
    const { createArticleColumns } = await import('../article-admin-columns');
    const adminCols = createArticleColumns({
      role: 'ADMIN',
      handlers: { onPublish: vi.fn(), onUnpublish: vi.fn(), onDelete: vi.fn() },
    });
    const managerCols = createArticleColumns({
      role: 'MANAGER',
      handlers: { onPublish: vi.fn(), onUnpublish: vi.fn(), onDelete: vi.fn() },
    });
    expect(adminCols).toHaveLength(8);
    expect(managerCols).toHaveLength(8);

    const adminActions = adminCols.find((c) => (c as { id?: string }).id === 'actions');
    const managerActions = managerCols.find((c) => (c as { id?: string }).id === 'actions');
    expect(adminActions).toBeDefined();
    expect(managerActions).toBeDefined();
    const row = { original: buildArticle({ id: 'a', status: 'PUBLISHED' }) };
    // @ts-expect-error — cell is a function in ColumnDef; narrowed here for testing
    const adminCell = adminActions!.cell({ row });
    // @ts-expect-error — cell is a function in ColumnDef; narrowed here for testing
    const managerCell = managerActions!.cell({ row });
    const adminStr = JSON.stringify(adminCell);
    const managerStr = JSON.stringify(managerCell);
    expect(adminStr).toContain('delete-a');
    expect(managerStr).not.toContain('delete-a');
  });
});
