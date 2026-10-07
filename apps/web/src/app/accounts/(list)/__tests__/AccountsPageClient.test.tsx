/**
 * PG-196 — `/accounts?tier=<slug>` (the sidebar tier links) filters the list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => '/accounts',
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true, user: { id: 'user-1' } }),
}));

const listQuery = vi.fn();
let listData: { accounts: unknown[]; total: number } = { accounts: [], total: 0 };
vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      account: { list: { invalidate: vi.fn() }, stats: { invalidate: vi.fn() } },
    }),
    account: {
      list: {
        useQuery: (input: unknown, opts: unknown) => {
          listQuery(input, opts);
          return {
            data: { ...listData, page: 1, limit: 20, hasMore: false },
            isLoading: false,
            error: null,
            refetch: vi.fn(),
          };
        },
      },
      stats: { useQuery: () => ({ data: undefined, isLoading: false }) },
      delete: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));

let tiersLoaded = true;
vi.mock('@/hooks/useAccountTiers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAccountTiers')>();
  const { DEFAULT_TIER_CONFIG } = await import('@intelliflow/domain');
  return {
    ...actual,
    useAccountTiers: () =>
      actual.buildAccountTiersResult(
        tiersLoaded
          ? { tiers: DEFAULT_TIER_CONFIG.tiers, defaultTierKey: null, canManage: false }
          : undefined,
        { isLoading: !tiersLoaded, isError: false }
      ),
  };
});

vi.mock('@/hooks/use-dynamic-filters', () => ({
  useAccountFilterOptions: () => ({ industryOptions: [], ownerOptions: [] }),
}));
vi.mock('@/components/shared', () => ({
  PageHeader: ({ title }: Readonly<{ title: string }>) => <h1>{title}</h1>,
  SearchFilterBar: () => <div data-testid="search-filter-bar" />,
}));
vi.mock('@intelliflow/ui', () => ({
  DataTable: ({ data }: Readonly<{ data: unknown[] }>) => (
    <div data-testid="table">{data.length}</div>
  ),
  Pagination: () => null,
  Skeleton: () => <div />,
  EmptyState: ({ variant }: Readonly<{ variant: string }>) => (
    <div data-testid="empty-state" data-variant={variant} />
  ),
}));
vi.mock('../actions', () => ({ invalidateAccountsCache: vi.fn() }));
vi.mock('../../actions', () => ({ revalidateAccountCaches: vi.fn().mockResolvedValue(undefined) }));

import AccountsPageClient from '../AccountsPageClient';

const lastInput = () => listQuery.mock.calls.at(-1)?.[0] as Record<string, unknown>;
const lastOpts = () => listQuery.mock.calls.at(-1)?.[1] as { enabled: boolean };

describe('AccountsPageClient tier filter (PG-196)', () => {
  beforeEach(() => {
    search = new URLSearchParams();
    tiersLoaded = true;
    listData = { accounts: [], total: 0 };
    listQuery.mockReset();
    replace.mockReset();
  });

  it('sends no tier and shows no chip without ?tier=', () => {
    render(<AccountsPageClient />);
    expect(lastInput().tier).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Clear tier filter' })).not.toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toHaveAttribute('data-variant', 'empty');
  });

  it('turns the slug into the tier key, shows a chip and treats the list as filtered', () => {
    search = new URLSearchParams('tier=mid-market');
    render(<AccountsPageClient />);
    expect(lastInput().tier).toBe('MID_MARKET');
    expect(screen.getByText('Tier: Mid-Market')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toHaveAttribute('data-variant', 'filtered');
  });

  it('clears the filter from the chip', () => {
    search = new URLSearchParams('tier=enterprise');
    render(<AccountsPageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear tier filter' }));
    expect(replace).toHaveBeenCalledWith('/accounts');
  });

  it('shows "Unknown tier" for a slug the tenant does not have and does not filter', () => {
    search = new URLSearchParams('tier=platinum');
    render(<AccountsPageClient />);
    expect(screen.getByText('Unknown tier')).toBeInTheDocument();
    expect(lastInput().tier).toBeUndefined();
  });

  it('waits for the tenant tiers before loading a tier-filtered list', () => {
    search = new URLSearchParams('tier=smb');
    tiersLoaded = false;
    render(<AccountsPageClient />);
    expect(lastOpts().enabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Clear tier filter' })).not.toBeInTheDocument();
  });

  it('loads immediately when there is no tier in the URL', () => {
    tiersLoaded = false;
    render(<AccountsPageClient />);
    expect(lastOpts().enabled).toBe(true);
  });
});
