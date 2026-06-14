/**
 * @vitest-environment jsdom
 *
 * IFC-266 — Contact LIST page tests (T-02) + bulk selection/email/export/delete (T-05).
 *
 * System under test: ContactsPageClient (the interactive client island rendered by
 * the (list)/page.tsx server shell). Covers rendering, auth-error redirect, error
 * state, debounced search, status/company/department filters (incl. UUID validation
 * and auto-clear), sort, pagination + initialData gating, and the bulk + single
 * delete handlers. Mirrors IFC-265 hoisted-mock conventions.
 *
 * No production code is modified by this test.
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

// All shared mock state lives in a hoisted container so vi.mock factories (hoisted to
// the top of the module) can reference it without TDZ errors.
const h = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  refetchMock: vi.fn(),
  listInvalidate: vi.fn(),
  statsInvalidate: vi.fn(),
  toastMock: vi.fn(),
  bulkEmailMutateAsync: vi.fn(),
  bulkExportMutateAsync: vi.fn(),
  bulkDeleteMutateAsync: vi.fn(),
  deleteMutate: vi.fn(),
  invalidateContactsCacheMock: vi.fn(),
  revalidateContactCachesMock: vi.fn(),
  // captured mutation lifecycle callbacks
  bulkDeleteOnSuccess: undefined as undefined | (() => void),
  deleteOnSuccess: undefined as undefined | (() => void),
  deleteOnError: undefined as undefined | ((e: { message: string }) => void),
  // captured list.useQuery inputs/options
  listQueryArgs: [] as Array<Record<string, unknown>>,
  listQueryOpts: [] as Array<Record<string, unknown>>,
  // mutable per-test state
  mockListResult: undefined as unknown as {
    data: { contacts: Array<Record<string, unknown>>; total: number } | undefined;
    isLoading: boolean;
    error: { data?: { code?: string }; message?: string } | null;
    refetch: () => void;
  },
  mockAuthState: undefined as unknown as {
    isLoading: boolean;
    isAuthenticated: boolean;
    user: { id: string; email: string } | null;
  },
  mockFilterOptions: undefined as unknown as {
    statusOptions: Array<{ value: string; label: string }>;
    departmentOptions: Array<{ value: string; label: string }>;
    accountOptions: Array<{ value: string; label: string }>;
  },
  lastContactListProps: undefined as Record<string, any> | undefined,
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: h.mockPush,
    replace: h.mockReplace,
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => h.mockAuthState,
}));

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      contact: {
        list: { invalidate: h.listInvalidate },
        stats: { invalidate: h.statsInvalidate },
      },
    }),
    contact: {
      list: {
        useQuery: (input: Record<string, unknown>, opts: Record<string, unknown>) => {
          h.listQueryArgs.push(input);
          h.listQueryOpts.push(opts);
          return h.mockListResult;
        },
      },
      bulkEmail: { useMutation: () => ({ mutateAsync: h.bulkEmailMutateAsync, isPending: false }) },
      bulkExport: {
        useMutation: () => ({ mutateAsync: h.bulkExportMutateAsync, isPending: false }),
      },
      bulkDelete: {
        useMutation: (opts?: { onSuccess?: () => void }) => {
          h.bulkDeleteOnSuccess = opts?.onSuccess;
          return { mutateAsync: h.bulkDeleteMutateAsync, isPending: false };
        },
      },
      delete: {
        useMutation: (opts?: {
          onSuccess?: () => void;
          onError?: (e: { message: string }) => void;
        }) => {
          h.deleteOnSuccess = opts?.onSuccess;
          h.deleteOnError = opts?.onError;
          return { mutate: h.deleteMutate, isPending: false };
        },
      },
    },
  },
}));

vi.mock('@/hooks/use-dynamic-filters', () => ({
  useContactFilterOptions: () => h.mockFilterOptions,
  isValidUUID: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
}));

// Server actions ('use server' → next/cache); must be mocked or the suite errors at load.
vi.mock('../actions', () => ({ invalidateContactsCache: h.invalidateContactsCacheMock }));
vi.mock('../../actions', () => ({ revalidateContactCaches: h.revalidateContactCachesMock }));

vi.mock('@intelliflow/ui', () => ({
  toast: (...args: unknown[]) => h.toastMock(...args),
  ConfirmationDialog: ({ open, onConfirm, confirmLabel }: any) =>
    open ? (
      <button type="button" onClick={onConfirm}>
        {confirmLabel}-confirm
      </button>
    ) : null,
  Pagination: ({ currentPage, totalPages, onPageChange }: any) =>
    totalPages > 1 ? (
      <div data-testid="pagination">
        <span data-testid="current-page">{currentPage}</span>
        <button type="button" onClick={() => onPageChange(currentPage + 1)}>
          next-page
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/shared', () => ({
  PageHeader: ({ title }: any) => <h1>{title}</h1>,
  SearchFilterBar: ({ searchValue, onSearchChange, filters, sort }: any) => (
    <div>
      <input
        aria-label="Search contacts"
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {filters.map((f: any) => (
        <select
          key={f.id}
          aria-label={f.label}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
        >
          <option value="">All</option>
          {f.options.map((o: any) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      <select aria-label="Sort" value={sort.value} onChange={(e) => sort.onChange(e.target.value)}>
        {sort.options.map((o: any) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  ),
}));

vi.mock('@/components/contacts', () => ({
  ContactList: (props: any) => {
    h.lastContactListProps = props;
    return (
      <div data-testid="contact-list">
        <span data-testid="total">{props.total}</span>
        <span data-testid="loading">{String(props.isLoading)}</span>
        <ul>
          {props.contacts.map((c: any) => (
            <li key={c.id}>
              <button type="button" onClick={() => props.onRowClick(c)}>
                row-{c.id}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => props.onBulkEmail(['id-1', 'id-2'])}>
          bulk-email
        </button>
        <button type="button" onClick={() => props.onBulkExport(['id-1'], 'csv')}>
          bulk-export
        </button>
        <button type="button" onClick={() => props.onBulkDelete(['id-1', 'id-2'])}>
          bulk-delete
        </button>
        <button type="button" onClick={() => props.onDelete(props.contacts[0])}>
          row-delete
        </button>
        <button type="button" onClick={() => props.onEdit(props.contacts[0])}>
          row-edit
        </button>
      </div>
    );
  },
}));

import ContactsPageClient from '../ContactsPageClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function lastArgs() {
  return h.listQueryArgs[h.listQueryArgs.length - 1];
}
function lastOpts() {
  return h.listQueryOpts[h.listQueryOpts.length - 1];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.listQueryArgs = [];
  h.listQueryOpts = [];
  h.bulkDeleteOnSuccess = undefined;
  h.deleteOnSuccess = undefined;
  h.deleteOnError = undefined;
  h.lastContactListProps = undefined;

  h.mockAuthState = {
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'user-1', email: 'user@example.com' },
  };
  h.mockListResult = {
    data: {
      contacts: [
        { id: 'id-1', firstName: 'Jane', lastName: 'Smith' },
        { id: 'id-2', firstName: 'John', lastName: 'Doe' },
      ],
      total: 2,
    },
    isLoading: false,
    error: null,
    refetch: h.refetchMock,
  };
  h.mockFilterOptions = {
    statusOptions: [
      { value: 'ACTIVE', label: 'Active' },
      { value: 'INACTIVE', label: 'Inactive' },
    ],
    departmentOptions: [{ value: 'sales', label: 'Sales' }],
    accountOptions: [
      { value: VALID_UUID, label: 'Acme' },
      { value: 'not-a-uuid', label: 'Bad Co' },
    ],
  };

  h.revalidateContactCachesMock.mockResolvedValue(undefined);

  // jsdom-missing browser APIs used by handleBulkExport / handleBulkEmail
  vi.stubGlobal('open', vi.fn());
  (globalThis.URL as any).createObjectURL = vi.fn(() => 'blob:mock');
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis.URL as any).createObjectURL;
  delete (globalThis.URL as any).revokeObjectURL;
});

// ---------------------------------------------------------------------------
// Rendering & states
// ---------------------------------------------------------------------------
describe('ContactsPageClient — rendering & states (T-02)', () => {
  it('renders the page header and contact list with rows from query data', () => {
    render(<ContactsPageClient />);
    expect(screen.getByRole('heading', { name: 'Contact List' })).toBeInTheDocument();
    expect(screen.getByTestId('contact-list')).toBeInTheDocument();
    expect(screen.getByTestId('total')).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'row-id-1' })).toBeInTheDocument();
  });

  it('passes server initialData to the query for the default query only', () => {
    const serverData = {
      contacts: [{ id: 'srv-1', firstName: 'Srv', lastName: 'User' }],
      total: 1,
    };
    render(<ContactsPageClient initialData={serverData} />);
    expect(lastOpts().initialData).toEqual(serverData);
  });

  it('does NOT pass initialData once a non-default filter is applied', () => {
    const serverData = { contacts: [], total: 0 };
    render(<ContactsPageClient initialData={serverData} />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ACTIVE' } });
    expect(lastOpts().initialData).toBeUndefined();
  });

  it('disables the list query while auth is still loading (enabled wiring)', () => {
    h.mockAuthState = { isLoading: true, isAuthenticated: false, user: null };
    render(<ContactsPageClient />);
    expect(lastOpts().enabled).toBe(false);
  });

  it('enables the list query when authenticated', () => {
    render(<ContactsPageClient />);
    expect(lastOpts().enabled).toBe(true);
  });

  it('forwards the query loading flag to ContactList', () => {
    h.mockListResult = { ...h.mockListResult, isLoading: true };
    render(<ContactsPageClient />);
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });
});

describe('ContactsPageClient — error handling (T-02)', () => {
  it('redirects to /login on an auth (UNAUTHORIZED) error', async () => {
    h.mockListResult = {
      data: undefined,
      isLoading: false,
      error: { data: { code: 'UNAUTHORIZED' }, message: 'Unauthorized' },
      refetch: h.refetchMock,
    };
    render(<ContactsPageClient />);
    await waitFor(() => expect(h.mockReplace).toHaveBeenCalledWith('/login'));
    expect(screen.getByText('Redirecting to login...')).toBeInTheDocument();
  });

  it('renders the error state with a working retry for a non-auth error', () => {
    h.mockListResult = {
      data: undefined,
      isLoading: false,
      error: { data: { code: 'INTERNAL_SERVER_ERROR' }, message: 'Boom' },
      refetch: h.refetchMock,
    };
    render(<ContactsPageClient />);
    expect(screen.getByText('Failed to load contacts')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Try Again/i }));
    expect(h.refetchMock).toHaveBeenCalled();
    expect(h.mockReplace).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Filters / sort / search / pagination
// ---------------------------------------------------------------------------
describe('ContactsPageClient — filters, sort, search, pagination (T-02)', () => {
  it('debounces the search term into the query input (300ms)', () => {
    vi.useFakeTimers();
    try {
      render(<ContactsPageClient />);
      fireEvent.change(screen.getByLabelText('Search contacts'), { target: { value: 'jane' } });
      expect(lastArgs().search).toBeUndefined();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(lastArgs().search).toBe('jane');
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies the status filter to the query input', () => {
    render(<ContactsPageClient />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ACTIVE' } });
    expect(lastArgs().status).toBe('ACTIVE');
  });

  it('applies the department filter to the query input', () => {
    render(<ContactsPageClient />);
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'sales' } });
    expect(lastArgs().department).toBe('sales');
  });

  it('sends accountId only when the company filter is a valid UUID', () => {
    render(<ContactsPageClient />);
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: VALID_UUID } });
    expect(lastArgs().accountId).toBe(VALID_UUID);
  });

  it('omits accountId when the company filter is not a valid UUID', () => {
    render(<ContactsPageClient />);
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'not-a-uuid' } });
    expect(lastArgs().accountId).toBeUndefined();
  });

  it('auto-clears the status filter when it disappears from the options', () => {
    const { rerender } = render(<ContactsPageClient />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ACTIVE' } });
    expect(lastArgs().status).toBe('ACTIVE');
    h.mockFilterOptions = {
      ...h.mockFilterOptions,
      statusOptions: [{ value: 'INACTIVE', label: 'Inactive' }],
    };
    rerender(<ContactsPageClient />);
    expect(lastArgs().status).toBeUndefined();
  });

  it('maps the sort selection to sortBy/sortOrder', () => {
    render(<ContactsPageClient />);
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'name' } });
    expect(lastArgs().sortBy).toBe('lastName');
    expect(lastArgs().sortOrder).toBe('asc');
  });

  it('renders pagination and advances the page (resetting initialData)', () => {
    h.mockListResult = {
      ...h.mockListResult,
      data: { contacts: h.mockListResult.data!.contacts, total: 25 },
    };
    render(<ContactsPageClient initialData={{ contacts: [], total: 25 }} />);
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
    expect(screen.getByTestId('current-page')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: 'next-page' }));
    expect(lastArgs().page).toBe(2);
    expect(lastOpts().initialData).toBeUndefined();
  });

  it('resets to page 1 when a filter changes after paging', () => {
    h.mockListResult = {
      ...h.mockListResult,
      data: { contacts: h.mockListResult.data!.contacts, total: 25 },
    };
    render(<ContactsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'next-page' }));
    expect(lastArgs().page).toBe(2);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ACTIVE' } });
    expect(lastArgs().page).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Bulk + single delete (T-05)
// ---------------------------------------------------------------------------
describe('ContactsPageClient — bulk actions & delete (T-05)', () => {
  it('bulk email opens the mail client and toasts on success', async () => {
    h.bulkEmailMutateAsync.mockResolvedValue({
      mailtoUrl: 'mailto:a@b.com,c@d.com',
      emails: ['a@b.com', 'c@d.com'],
    });
    render(<ContactsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'bulk-email' }));
    await waitFor(() =>
      expect(globalThis.open).toHaveBeenCalledWith('mailto:a@b.com,c@d.com', '_blank')
    );
    expect(h.bulkEmailMutateAsync).toHaveBeenCalledWith({ ids: ['id-1', 'id-2'] });
    expect(h.toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Email Client Opened' })
    );
  });

  it('bulk email shows a destructive toast when no mailto URL is returned', async () => {
    h.bulkEmailMutateAsync.mockResolvedValue({ mailtoUrl: '', emails: [] });
    render(<ContactsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'bulk-email' }));
    await waitFor(() =>
      expect(h.toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'No emails found', variant: 'destructive' })
      )
    );
    expect(globalThis.open).not.toHaveBeenCalled();
  });

  it('bulk email shows a destructive toast when the mutation rejects', async () => {
    h.bulkEmailMutateAsync.mockRejectedValue(new Error('network down'));
    render(<ContactsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'bulk-email' }));
    await waitFor(() =>
      expect(h.toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Email Failed', description: 'network down' })
      )
    );
  });

  it('bulk export downloads a CSV and toasts on success', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    h.bulkExportMutateAsync.mockResolvedValue({
      data: 'Email,First Name\n"a@b.com","Jane"',
      count: 1,
    });
    render(<ContactsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'bulk-export' }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(h.bulkExportMutateAsync).toHaveBeenCalledWith({ ids: ['id-1'], format: 'csv' });
    expect((globalThis.URL as any).createObjectURL).toHaveBeenCalled();
    expect(h.toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Export Complete' }));
  });

  it('bulk export shows a destructive toast when the mutation rejects', async () => {
    h.bulkExportMutateAsync.mockRejectedValue(new Error('export boom'));
    render(<ContactsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'bulk-export' }));
    await waitFor(() =>
      expect(h.toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Export Failed', description: 'export boom' })
      )
    );
  });

  it('bulk delete opens the confirmation dialog, then deletes on confirm (all success)', async () => {
    h.bulkDeleteMutateAsync.mockResolvedValue({ successful: ['id-1', 'id-2'], failed: [] });
    render(<ContactsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'bulk-delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete-confirm' }));
    await waitFor(() =>
      expect(h.bulkDeleteMutateAsync).toHaveBeenCalledWith({ ids: ['id-1', 'id-2'] })
    );
    expect(h.toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Contacts Deleted' })
    );
  });

  it('bulk delete shows both toasts on a partial success', async () => {
    h.bulkDeleteMutateAsync.mockResolvedValue({
      successful: ['id-1'],
      failed: [{ id: 'id-2', error: 'has 2 opportunities' }],
    });
    render(<ContactsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'bulk-delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete-confirm' }));
    await waitFor(() =>
      expect(h.toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Contacts Deleted' })
      )
    );
    expect(h.toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Some contacts could not be deleted',
        variant: 'destructive',
      })
    );
  });

  it('bulk delete onSuccess invalidates the list + stats caches', () => {
    render(<ContactsPageClient />);
    expect(h.bulkDeleteOnSuccess).toBeTypeOf('function');
    act(() => h.bulkDeleteOnSuccess!());
    expect(h.listInvalidate).toHaveBeenCalled();
    expect(h.statsInvalidate).toHaveBeenCalled();
    expect(h.invalidateContactsCacheMock).toHaveBeenCalled();
    expect(h.revalidateContactCachesMock).toHaveBeenCalledWith('user-1');
  });

  it('single delete calls the delete mutation with the contact id', () => {
    render(<ContactsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'row-delete' }));
    expect(h.deleteMutate).toHaveBeenCalledWith({ id: 'id-1' });
  });

  it('single delete onSuccess invalidates caches and toasts', () => {
    render(<ContactsPageClient />);
    expect(h.deleteOnSuccess).toBeTypeOf('function');
    act(() => h.deleteOnSuccess!());
    expect(h.listInvalidate).toHaveBeenCalled();
    expect(h.statsInvalidate).toHaveBeenCalled();
    expect(h.toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Contact Deleted' }));
  });

  it('single delete onError shows a destructive toast', () => {
    render(<ContactsPageClient />);
    expect(h.deleteOnError).toBeTypeOf('function');
    act(() => h.deleteOnError!({ message: 'cannot delete' }));
    expect(h.toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delete Failed',
        description: 'cannot delete',
        variant: 'destructive',
      })
    );
  });

  it('navigates to the contact detail on row click', () => {
    render(<ContactsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'row-id-1' }));
    expect(h.mockPush).toHaveBeenCalledWith('/contacts/id-1');
  });
});
