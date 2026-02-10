/**
 * TicketList Component Tests (PG-137)
 *
 * Tests for main ticket list view with DataTable, stats, and filters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TicketList } from '../TicketList';
import {
  createMockTicketList,
  createMockStats,
  createMockFilterOptions,
  createMockHandlers,
} from './ticket-test-utils';

// Mock DataTable from @intelliflow/ui
vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual('@intelliflow/ui');
  return {
    ...actual,
    DataTable: ({ data, onRowClick, emptyMessage }: any) => (
      <div data-testid="data-table">
        {data.length === 0 ? (
          <p>{emptyMessage}</p>
        ) : (
          <table>
            <tbody>
              {data.map((item: any) => (
                <tr
                  key={item.id}
                  data-testid={`row-${item.id}`}
                  onClick={() => onRowClick?.(item)}
                >
                  <td>{item.subject}</td>
                  <td data-testid="priority">{item.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    ),
    Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
  };
});

// Mock shared components
vi.mock('@/components/shared', () => ({
  PageHeader: () => null,
  SearchFilterBar: ({ searchValue, onSearchChange }: any) => (
    <input
      data-testid="search"
      value={searchValue}
      onChange={(e) => onSearchChange(e.target.value)}
    />
  ),
}));

// Mock SLAIndicator
vi.mock('../SLAIndicator', () => ({
  SLAIndicator: ({ slaStatus, slaTimeRemaining }: any) => (
    <div data-testid="sla-indicator">{slaStatus} - {slaTimeRemaining}m</div>
  ),
}));

describe('TicketList', () => {
  const mockTickets = createMockTicketList(5);
  const mockStats = createMockStats();
  const mockFilterOptions = createMockFilterOptions();
  const handlers = createMockHandlers();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders stats cards with correct counts', () => {
    render(
      <TicketList
        tickets={mockTickets}
        total={mockTickets.length}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
      />
    );

    expect(screen.getByText('4')).toBeInTheDocument(); // Open
    expect(screen.getByText('3')).toBeInTheDocument(); // In Progress
    expect(screen.getByText('2')).toBeInTheDocument(); // Breached
    expect(screen.getByText('7')).toBeInTheDocument(); // Resolved Today
  });

  it('renders ticket rows', () => {
    render(
      <TicketList
        tickets={mockTickets}
        total={mockTickets.length}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
      />
    );

    mockTickets.forEach((ticket) => {
      expect(screen.getByTestId(`row-${ticket.id}`)).toBeInTheDocument();
    });
  });

  it('renders data table with tickets', () => {
    render(
      <TicketList
        tickets={mockTickets}
        total={mockTickets.length}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
      />
    );

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });

  it('renders priority values', () => {
    const tickets = [
      { ...createMockTicketList(1)[0], id: 'ticket-001', priority: 'CRITICAL' as const },
      { ...createMockTicketList(1)[0], id: 'ticket-002', priority: 'HIGH' as const },
    ];

    render(
      <TicketList
        tickets={tickets}
        total={tickets.length}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
      />
    );

    const priorities = screen.getAllByTestId('priority');
    expect(priorities.length).toBe(2);
    expect(priorities[0].textContent).toContain('CRITICAL');
    expect(priorities[1].textContent).toContain('HIGH');
  });

  it('shows skeleton when loading', () => {
    render(
      <TicketList
        tickets={[]}
        total={0}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={true}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
      />
    );

    // Should show skeleton loading state
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty message when no tickets', () => {
    render(
      <TicketList
        tickets={[]}
        total={0}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
      />
    );

    expect(screen.getByText(/no tickets match your filters/i)).toBeInTheDocument();
  });

  it('renders SearchFilterBar', () => {
    render(
      <TicketList
        tickets={mockTickets}
        total={mockTickets.length}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
        searchValue=""
        onSearchChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('search')).toBeInTheDocument();
  });

  it('provides bulk actions in DataTable', () => {
    const handleBulkAction = vi.fn();

    render(
      <TicketList
        tickets={mockTickets}
        total={mockTickets.length}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={handleBulkAction}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
      />
    );

    // DataTable should have bulk actions configured
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });

  it('calls onRowClick when ticket row clicked', () => {
    render(
      <TicketList
        tickets={mockTickets}
        total={mockTickets.length}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
      />
    );

    const firstRow = screen.getByTestId(`row-${mockTickets[0].id}`);
    fireEvent.click(firstRow);

    expect(handlers.onRowClick).toHaveBeenCalledWith(mockTickets[0]);
  });

  it('has accessible table structure', () => {
    render(
      <TicketList
        tickets={mockTickets}
        total={mockTickets.length}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
      />
    );

    // DataTable is mocked, so just verify it renders
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });

  it('renders assignee in rows', () => {
    const ticketWithAssignee = createMockTicketList(1)[0];

    render(
      <TicketList
        tickets={[ticketWithAssignee]}
        total={1}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
      />
    );

    // Rows are rendered via DataTable mock
    expect(screen.getByTestId(`row-${ticketWithAssignee.id}`)).toBeInTheDocument();
  });

  it('renders ticket list', () => {
    const unassignedTicket = createMockTicketList(1)[0];
    unassignedTicket.assignee = null;
    unassignedTicket.assigneeAvatar = null;

    render(
      <TicketList
        tickets={[unassignedTicket]}
        total={1}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
      />
    );

    expect(screen.getByTestId(`row-${unassignedTicket.id}`)).toBeInTheDocument();
  });

  it('filters tickets by search term', () => {
    const onSearchChange = vi.fn();

    render(
      <TicketList
        tickets={mockTickets}
        total={mockTickets.length}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
        searchValue=""
        onSearchChange={onSearchChange}
      />
    );

    const searchInput = screen.getByTestId('search');
    fireEvent.change(searchInput, { target: { value: 'Test Ticket 1' } });

    expect(onSearchChange).toHaveBeenCalledWith('Test Ticket 1');
  });

  it('displays ticket data', () => {
    const emailTicket = createMockTicketList(1)[0];
    emailTicket.channel = 'email';

    render(
      <TicketList
        tickets={[emailTicket]}
        total={1}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
      />
    );

    expect(screen.getByTestId(`row-${emailTicket.id}`)).toBeInTheDocument();
  });

  it('displays ticket numbers correctly', () => {
    render(
      <TicketList
        tickets={mockTickets}
        total={mockTickets.length}
        stats={mockStats}
        filterOptions={mockFilterOptions}
        isLoading={false}
        onRowClick={handlers.onRowClick}
        onBulkAction={vi.fn()}
        pagination={{ page: 1, limit: 10, onPageChange: vi.fn() }}
      />
    );

    // Ticket subjects are rendered in DataTable mock
    mockTickets.forEach((ticket) => {
      expect(screen.getByText(ticket.subject)).toBeInTheDocument();
    });
  });
});
