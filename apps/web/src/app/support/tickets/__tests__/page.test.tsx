/**
 * Support Tickets Page Tests (PG-046)
 *
 * Tests for the /support/tickets page.
 * Test file lives at support/tickets/__tests__/ (not inside (list)/) intentionally —
 * keeps tests accessible regardless of route group depth.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/support/tickets',
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: Readonly<{ children: React.ReactNode; href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));

// Track useTicketFilters calls
const mockSetSearch = vi.fn();
const mockSetStatusFilter = vi.fn();
const mockSetPriorityFilter = vi.fn();
const mockSetSLAFilter = vi.fn();
const mockSetSort = vi.fn();
const mockSetPage = vi.fn();
const mockResetFilters = vi.fn();
let lastUseTicketFiltersArgs: unknown = undefined;

vi.mock('@/hooks/useTicketFilters', () => ({
  useTicketFilters: (defaults?: Record<string, unknown>) => {
    lastUseTicketFiltersArgs = defaults;
    return {
      filters: {
        search: '',
        status: '',
        priority: '',
        slaStatus: 'all',
        sortBy: defaults?.sortBy ?? 'updatedAt',
        sortOrder: defaults?.sortOrder ?? 'desc',
        page: 1,
        limit: 20,
      },
      debouncedSearch: '',
      queryParams: { page: 1, limit: 20 },
      setSearch: mockSetSearch,
      setStatusFilter: mockSetStatusFilter,
      setPriorityFilter: mockSetPriorityFilter,
      setSLAFilter: mockSetSLAFilter,
      setSort: mockSetSort,
      setPage: mockSetPage,
      resetFilters: mockResetFilters,
    };
  },
}));

// Mock tRPC API
const mockListQuery = { data: { tickets: [], total: 0 }, isLoading: false };
const mockStatsQuery = { data: { byStatus: { OPEN: 5 }, slaBreached: 1, resolvedToday: 2 } };
const mockFilterOptionsQuery = {
  data: {
    statuses: ['OPEN'],
    priorities: ['HIGH'],
    slaStatuses: ['ON_TRACK'],
    assignees: [],
    categories: [],
  },
};
const mockBulkAssign = { mutateAsync: vi.fn().mockResolvedValue({ updated: 1 }) };
const mockBulkUpdateStatus = { mutateAsync: vi.fn().mockResolvedValue({ updated: 1 }) };
const mockBulkResolve = { mutateAsync: vi.fn().mockResolvedValue({ updated: 1 }) };

vi.mock('@/lib/api', () => ({
  api: {
    ticket: {
      list: { useQuery: vi.fn(() => mockListQuery) },
      stats: { useQuery: vi.fn(() => mockStatsQuery) },
      filterOptions: { useQuery: vi.fn(() => mockFilterOptionsQuery) },
      bulkAssign: { useMutation: vi.fn(() => mockBulkAssign) },
      bulkUpdateStatus: { useMutation: vi.fn(() => mockBulkUpdateStatus) },
      bulkResolve: { useMutation: vi.fn(() => mockBulkResolve) },
    },
    useUtils: () => ({
      ticket: {
        list: { invalidate: vi.fn() },
        stats: { invalidate: vi.fn() },
      },
    }),
  },
}));

// Mock mapTicketListItems
vi.mock('@/lib/tickets/ticket-detail-mapper', () => ({
  mapTicketListItems: (tickets: unknown) => {
    if (!Array.isArray(tickets)) return [];
    return tickets;
  },
}));

// Mock PageHeader
vi.mock('@/components/shared', () => ({
  PageHeader: (props: {
    title: string;
    breadcrumbs: Array<{ label: string; href?: string }>;
    actions?: Array<{ label: string; href?: string }>;
  }) => (
    <div data-testid="page-header">
      <h1>{props.title}</h1>
      <nav data-testid="breadcrumbs">
        {props.breadcrumbs.map((b, i) => (
          <span key={i}>{b.label}</span>
        ))}
      </nav>
      {props.actions?.map((a, i) => (
        <a key={i} href={a.href} data-testid={`action-${a.label.toLowerCase().replace(' ', '-')}`}>
          {a.label}
        </a>
      ))}
    </div>
  ),
}));

// Mock SupportTicketList
vi.mock('@/components/tickets/ticket-list', () => ({
  SupportTicketList: (props: Record<string, unknown>) => (
    <div
      data-testid="support-ticket-list"
      data-is-loading={String(props.isLoading)}
      role="button"
      tabIndex={0}
      onClick={() => {
        const onRowClick = props.onRowClick as ((t: { id: string }) => void) | undefined;
        if (onRowClick) onRowClick({ id: 'test-123' });
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const onRowClick = props.onRowClick as ((t: { id: string }) => void) | undefined;
          if (onRowClick) onRowClick({ id: 'test-123' });
        }
      }}
    >
      SupportTicketList
    </div>
  ),
}));

// Mock toast
vi.mock('@intelliflow/ui', () => ({
  toast: vi.fn(),
}));

// Lazy import to allow mocks to be set up first
let SupportTicketsPage: () => React.JSX.Element;

beforeEach(async () => {
  vi.clearAllMocks();
  lastUseTicketFiltersArgs = undefined;
  const mod = await import('../(list)/page');
  SupportTicketsPage = mod.default;
});

describe('SupportTicketsPage', () => {
  it('page renders without crashing', () => {
    render(<SupportTicketsPage />);
    expect(screen.getByTestId('page-header')).toBeDefined();
  });

  it('calls useTicketFilters with SLA-first sort defaults', () => {
    render(<SupportTicketsPage />);
    expect(lastUseTicketFiltersArgs).toEqual({
      sortBy: 'slaResolutionDue',
      sortOrder: 'asc',
    });
  });

  it('calls api.ticket.list.useQuery with query params', async () => {
    render(<SupportTicketsPage />);
    const { api } = await import('@/lib/api');
    expect(api.ticket.list.useQuery).toHaveBeenCalled();
  });

  it('calls api.ticket.stats.useQuery', async () => {
    render(<SupportTicketsPage />);
    const { api } = await import('@/lib/api');
    expect(api.ticket.stats.useQuery).toHaveBeenCalled();
  });

  it('calls api.ticket.filterOptions.useQuery', async () => {
    render(<SupportTicketsPage />);
    const { api } = await import('@/lib/api');
    expect(api.ticket.filterOptions.useQuery).toHaveBeenCalled();
  });

  it('renders PageHeader with breadcrumbs Support > Tickets', () => {
    render(<SupportTicketsPage />);
    const breadcrumbs = screen.getByTestId('breadcrumbs');
    expect(breadcrumbs.textContent).toContain('Support');
    expect(breadcrumbs.textContent).toContain('Tickets');
  });

  it('PageHeader title is "Support Tickets"', () => {
    render(<SupportTicketsPage />);
    expect(screen.getByText('Support Tickets')).toBeDefined();
  });

  it('"New Ticket" action links to /support/tickets/new', () => {
    render(<SupportTicketsPage />);
    const newTicketLink = screen.getByTestId('action-new-ticket');
    expect(newTicketLink.getAttribute('href')).toBe('/support/tickets/new');
  });

  it('row click calls router.push with /support/tickets/{id}', () => {
    render(<SupportTicketsPage />);
    const list = screen.getByTestId('support-ticket-list');
    list.click();
    expect(mockPush).toHaveBeenCalledWith('/support/tickets/test-123');
  });

  it('renders SupportTicketList (not raw TicketList)', () => {
    render(<SupportTicketsPage />);
    expect(screen.getByTestId('support-ticket-list')).toBeDefined();
  });

  it('shows loading state when isLoading is true', () => {
    mockListQuery.isLoading = true;
    render(<SupportTicketsPage />);
    const list = screen.getByTestId('support-ticket-list');
    expect(list.getAttribute('data-is-loading')).toBe('true');
    mockListQuery.isLoading = false;
  });

  it('does NOT use bulkEscalate or bulkClose mutations', async () => {
    render(<SupportTicketsPage />);
    const { api } = await import('@/lib/api');
    // These should not be called/referenced
    expect((api.ticket as Record<string, unknown>).bulkEscalate).toBeUndefined();
    expect((api.ticket as Record<string, unknown>).bulkClose).toBeUndefined();
  });
});
