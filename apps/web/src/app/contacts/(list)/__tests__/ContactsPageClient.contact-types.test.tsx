/**
 * @vitest-environment jsdom
 *
 * PG-205: the contacts list Type filter and the sidebar segments
 * (`?segment=partners|vendors` → type filter, `?segment=vip` → the vip tag).
 */
import * as React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  segment: null as string | null,
  listQueryArgs: [] as Array<Record<string, unknown>>,
  listQueryOpts: [] as Array<Record<string, unknown>>,
  typesQueryArgs: [] as unknown[],
  lastContactListProps: undefined as Record<string, any> | undefined,
  types: [] as Array<Record<string, unknown>>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: h.push,
    replace: h.replace,
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({ get: (key: string) => (key === 'segment' ? h.segment : null) }),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'u1', email: 'u@example.invalid' },
  }),
}));
vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      contact: { list: { invalidate: vi.fn() }, stats: { invalidate: vi.fn() } },
    }),
    contactTypes: {
      listActive: {
        useQuery: (input: unknown) => {
          h.typesQueryArgs.push(input);
          return { data: h.types };
        },
      },
    },
    contact: {
      list: {
        useQuery: (input: Record<string, unknown>, opts: Record<string, unknown>) => {
          h.listQueryArgs.push(input);
          h.listQueryOpts.push(opts);
          return {
            data: { contacts: [], total: 0 },
            isLoading: false,
            error: null,
            refetch: vi.fn(),
          };
        },
      },
      bulkEmail: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      bulkExport: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      bulkDelete: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      delete: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));
vi.mock('@/hooks/use-dynamic-filters', () => ({
  useContactFilterOptions: () => ({ statusOptions: [], departmentOptions: [], accountOptions: [] }),
  isValidUUID: () => false,
}));
vi.mock('../actions', () => ({ invalidateContactsCache: vi.fn() }));
vi.mock('../../actions', () => ({ revalidateContactCaches: vi.fn() }));
vi.mock('@intelliflow/ui', () => ({
  toast: vi.fn(),
  ConfirmationDialog: () => null,
  Pagination: () => null,
}));
vi.mock('@/components/shared', () => ({
  PageHeader: ({ title }: any) => <h1>{title}</h1>,
  SearchFilterBar: ({ filters }: any) => (
    <div>
      {/* Same DOM shape as the real FilterDropdown: an sr-only <label for> + native <select>. */}
      {filters.map((f: any) => (
        <div key={f.id}>
          <label htmlFor={`filter-${f.id}`}>{f.label}</label>
          <select
            id={`filter-${f.id}`}
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
        </div>
      ))}
    </div>
  ),
}));
vi.mock('@/components/contacts', () => ({
  ContactList: (props: any) => {
    h.lastContactListProps = props;
    return <div data-testid="contact-list" />;
  },
}));

import ContactsPageClient from '../ContactsPageClient';

const lastQuery = () => h.listQueryArgs[h.listQueryArgs.length - 1];

beforeEach(() => {
  vi.clearAllMocks();
  h.segment = null;
  h.listQueryArgs = [];
  h.listQueryOpts = [];
  h.typesQueryArgs = [];
  h.types = [
    { id: 't1', key: 'partner', name: 'Partner', colorToken: 'violet', isActive: true },
    { id: 't2', key: 'vendor', name: 'Vendor', colorToken: 'amber', isActive: true },
    { id: 't3', key: 'investor', name: 'Investor', colorToken: 'teal', isActive: false },
  ];
});

describe('contacts list Type filter (PG-205)', () => {
  it('builds the Type filter from the tenant types, inactive ones labelled', () => {
    render(<ContactsPageClient />);
    expect(h.typesQueryArgs[0]).toEqual({ includeInactive: true });
    const select = screen.getByLabelText('Type') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'All',
      'Partner',
      'Vendor',
      'Investor (inactive)',
    ]);
  });

  it('filters the query by the chosen type and passes the types to the list badges', () => {
    render(<ContactsPageClient />);
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'vendor' } });
    expect(lastQuery()).toMatchObject({ contactType: 'vendor' });
    expect(h.lastContactListProps?.contactTypes).toEqual(h.types);
  });

  it('?segment=partners seeds the Type filter; changing it clears the segment from the URL', () => {
    h.segment = 'partners';
    render(<ContactsPageClient />);
    expect(lastQuery()).toMatchObject({ contactType: 'partner' });
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('partner');
    expect(h.listQueryOpts[h.listQueryOpts.length - 1].initialData).toBeUndefined();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: '' } });
    expect(h.replace).toHaveBeenCalledWith('/contacts');
    expect(lastQuery().contactType).toBeUndefined();
  });

  it('?segment=vendors filters by the vendor type', () => {
    h.segment = 'vendors';
    render(<ContactsPageClient />);
    expect(lastQuery()).toMatchObject({ contactType: 'vendor' });
  });

  it('keeps a type filter whose type is not active (not reset when its option is missing)', () => {
    h.segment = 'partners';
    h.types = [];
    render(<ContactsPageClient />);
    expect(lastQuery()).toMatchObject({ contactType: 'partner' });
  });

  it('?segment=vip shows a removable chip; removing it clears the filter, the URL, moves focus and announces (A11Y-8)', () => {
    h.segment = 'vip';
    render(<ContactsPageClient />);
    expect(lastQuery()).toMatchObject({ segment: 'vip' });
    const remove = screen.getByRole('button', { name: 'Remove filter: VIP' });
    act(() => {
      fireEvent.click(remove);
    });
    expect(lastQuery().segment).toBeUndefined();
    expect(h.replace).toHaveBeenCalledWith('/contacts');
    expect(screen.queryByRole('button', { name: 'Remove filter: VIP' })).toBeNull();
    expect(screen.getByLabelText('Type')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Filter removed: VIP');
  });

  it('reads useSearchParams under the route Suspense boundary: (list)/loading.tsx exists (CA-2)', async () => {
    // Next wraps a route segment's page in <Suspense fallback={<Loading />}> when loading.tsx exists,
    // which is what lets this client island call useSearchParams without a page-level boundary.
    const loading = await import('../loading');
    expect(typeof loading.default).toBe('function');
  });

  it('navigating from a segment link to plain /contacts drops the segment filter (codex 0dc7d185)', () => {
    h.segment = 'vendors';
    const { rerender } = render(<ContactsPageClient />);
    expect(lastQuery()).toMatchObject({ contactType: 'vendor' });
    h.segment = null;
    rerender(<ContactsPageClient />);
    expect(lastQuery().contactType).toBeUndefined();
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('');
  });

  it('leaving the VIP link by navigation drops the VIP segment', () => {
    h.segment = 'vip';
    const { rerender } = render(<ContactsPageClient />);
    h.segment = null;
    rerender(<ContactsPageClient />);
    expect(lastQuery().segment).toBeUndefined();
  });

  it('keeps the filter the user chose when the page clears the segment from the URL itself', () => {
    h.segment = 'partners';
    const { rerender } = render(<ContactsPageClient />);
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'vendor' } });
    expect(h.replace).toHaveBeenCalledWith('/contacts');
    h.segment = null;
    rerender(<ContactsPageClient />);
    expect(lastQuery()).toMatchObject({ contactType: 'vendor' });
  });

  it('ignores an unknown segment', () => {
    h.segment = 'everyone';
    render(<ContactsPageClient />);
    expect(lastQuery().contactType).toBeUndefined();
    expect(lastQuery().segment).toBeUndefined();
  });
});
