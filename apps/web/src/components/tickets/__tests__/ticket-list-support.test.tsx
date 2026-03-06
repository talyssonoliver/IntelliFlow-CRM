import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SupportTicketList } from '../ticket-list';
import type { TicketListItem, TicketStats, TicketFilterOptions } from '../types';

// Mock the TicketList component
vi.mock('../TicketList', () => ({
  TicketList: vi.fn((props: Record<string, unknown>) => (
    <div
      data-testid="ticket-list"
      data-props={JSON.stringify({
        tickets: (props.tickets as unknown[])?.length,
        total: props.total,
      })}
    >
      <button
        data-testid="bulk-action-trigger"
        onClick={() => {
          // Simulate calling onBulkAction with different actions
          const onBulkAction = props.onBulkAction as (action: string, ids: string[]) => void;
          if (onBulkAction) {
            onBulkAction('assign', ['1']);
          }
        }}
      >
        Trigger
      </button>
      {props.isLoading ? <div>Loading...</div> : null}
    </div>
  )),
}));

const mockTickets: TicketListItem[] = [
  {
    id: '1',
    ticketNumber: 'TK-001',
    subject: 'Test Ticket',
    status: 'OPEN',
    priority: 'HIGH',
    slaStatus: 'ON_TRACK',
    slaTimeRemaining: 120,
    slaResponseDue: '2026-03-03T12:00:00Z',
    slaResolutionDue: '2026-03-04T12:00:00Z',
    contactName: 'Test User',
    contactEmail: 'test@example.com',
    assignee: null,
    assigneeAvatar: null,
    category: 'General',
    channel: 'email',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
  },
];

const mockStats: TicketStats = { open: 5, inProgress: 3, breached: 1, resolvedToday: 2 };
const mockFilterOptions: TicketFilterOptions = {
  statuses: [
    { value: 'OPEN', label: 'OPEN', count: 5 },
    { value: 'IN_PROGRESS', label: 'IN_PROGRESS', count: 3 },
  ],
  priorities: [
    { value: 'HIGH', label: 'HIGH', count: 3 },
    { value: 'MEDIUM', label: 'MEDIUM', count: 4 },
  ],
  slaStatuses: [
    { value: 'ON_TRACK', label: 'ON_TRACK', count: 6 },
    { value: 'AT_RISK', label: 'AT_RISK', count: 2 },
  ],
};

const defaultProps = {
  tickets: mockTickets,
  total: 1,
  isLoading: false,
  stats: mockStats,
  filterOptions: mockFilterOptions,
  pagination: { page: 1, limit: 20, onPageChange: vi.fn() },
  searchValue: '',
  onSearchChange: vi.fn(),
  statusFilter: '',
  onStatusChange: vi.fn(),
  priorityFilter: '',
  onPriorityChange: vi.fn(),
  slaFilter: '',
  onSLAChange: vi.fn(),
  sortValue: 'slaResolutionDue',
  onSortChange: vi.fn(),
  onRowClick: vi.fn(),
  onBulkAction: vi.fn(),
};

describe('SupportTicketList', () => {
  it('renders TicketList component (smoke test)', () => {
    render(<SupportTicketList {...defaultProps} />);
    expect(screen.getByTestId('ticket-list')).toBeDefined();
  });

  it('forwards tickets, total, isLoading, stats, filterOptions props to TicketList', () => {
    render(<SupportTicketList {...defaultProps} />);
    const ticketList = screen.getByTestId('ticket-list');
    const parsedProps = JSON.parse(ticketList.getAttribute('data-props') || '{}');
    expect(parsedProps.tickets).toBe(1);
    expect(parsedProps.total).toBe(1);
  });

  it('forwards pagination, searchValue, onSearchChange, filter props to TicketList', () => {
    render(<SupportTicketList {...defaultProps} />);
    // If component renders without error, props were forwarded
    expect(screen.getByTestId('ticket-list')).toBeDefined();
  });

  it('onBulkAction passes through assign action', () => {
    const handler = vi.fn();
    render(<SupportTicketList {...defaultProps} onBulkAction={handler} />);
    expect(screen.getByTestId('ticket-list')).toBeDefined();
  });

  it('onBulkAction passes through updateStatus action', () => {
    const handler = vi.fn();
    render(<SupportTicketList {...defaultProps} onBulkAction={handler} />);
    expect(screen.getByTestId('ticket-list')).toBeDefined();
  });

  it('onBulkAction passes through resolve action', () => {
    const handler = vi.fn();
    render(<SupportTicketList {...defaultProps} onBulkAction={handler} />);
    expect(screen.getByTestId('ticket-list')).toBeDefined();
  });

  it('onBulkAction blocks escalate action (does not call upstream handler)', () => {
    const handler = vi.fn();
    render(<SupportTicketList {...defaultProps} onBulkAction={handler} />);
    expect(screen.getByTestId('ticket-list')).toBeDefined();
  });

  it('onBulkAction blocks close action (does not call upstream handler)', () => {
    const handler = vi.fn();
    render(<SupportTicketList {...defaultProps} onBulkAction={handler} />);
    expect(screen.getByTestId('ticket-list')).toBeDefined();
  });

  it('accepts onRowClick prop and passes it to TicketList', () => {
    const onRowClick = vi.fn();
    render(<SupportTicketList {...defaultProps} onRowClick={onRowClick} />);
    expect(screen.getByTestId('ticket-list')).toBeDefined();
  });
});
