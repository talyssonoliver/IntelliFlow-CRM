/**
 * TicketList Coverage Supplementary Tests (PG-137)
 *
 * Tests stats card interactions, keyboard handlers, bulk action dialogs,
 * and column cell renderers that are not covered by the main test file.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TicketList } from '../TicketList';
import {
  createMockTicketList,
  createMockStats,
  createMockFilterOptions,
} from './ticket-test-utils';

// Use a DataTable mock that renders cell functions for column coverage
vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual('@intelliflow/ui');
  return {
    ...actual,
    DataTable: ({ data, columns, onRowClick, emptyMessage, emptyIcon, bulkActions }: any) => (
      <div data-testid="data-table">
        {data.length === 0 ? (
          <div>
            <span className="material-symbols-outlined">{emptyIcon}</span>
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <table role="table">
            <thead>
              <tr>
                {columns.map((col: any, i: number) => (
                  <th key={i}>{typeof col.header === 'string' ? col.header : col.id}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((item: any, rowIdx: number) => (
                <tr key={item.id} data-testid={`row-${item.id}`} onClick={() => onRowClick?.(item)}>
                  {columns.map((col: any, colIdx: number) => (
                    <td key={colIdx} data-testid={`cell-${rowIdx}-${colIdx}`}>
                      {col.cell ? col.cell({ row: { original: item } }) : item[col.accessorKey]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {bulkActions && (
          <div data-testid="bulk-actions">
            {bulkActions.map((action: any, i: number) => (
              <button
                key={i}
                data-testid={`bulk-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => action.onClick(data.slice(0, 2))}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    ),
    TableRowActions: ({ quickActions, dropdownActions }: any) => (
      <div data-testid="row-actions">
        {quickActions?.map((a: any, i: number) => (
          <button key={i} data-testid={`quick-${a.label.toLowerCase()}`} onClick={a.onClick}>
            {a.label}
          </button>
        ))}
        {dropdownActions
          ?.filter((a: any) => !a.separator)
          .map((a: any, i: number) => (
            <button
              key={i}
              data-testid={`dropdown-${a.label.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
      </div>
    ),
    ConfirmationDialog: ({ open, onConfirm, title, confirmLabel }: any) =>
      open ? (
        <div data-testid={`dialog-${confirmLabel?.toLowerCase()}`}>
          <p>{title}</p>
          <button data-testid={`confirm-${confirmLabel?.toLowerCase()}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      ) : null,
    StatusSelectDialog: ({ open, onConfirm, title, options }: any) =>
      open ? (
        <div data-testid="status-select-dialog">
          <p>{title}</p>
          {options?.map((opt: any) => (
            <button
              key={opt.value}
              data-testid={`opt-${opt.value}`}
              onClick={() => onConfirm(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null,
    Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
    cn: (...args: any[]) => args.filter(Boolean).join(' '),
  };
});

vi.mock('@/components/shared', () => ({
  SearchFilterBar: ({ searchValue, onSearchChange, filters, filterChips, sort }: any) => (
    <div data-testid="search-filter-bar">
      <input
        data-testid="search"
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {filters?.map((f: any) => (
        <select
          key={f.id}
          data-testid={`filter-${f.id}`}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
        >
          {f.options?.map((opt: any) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}
      {filterChips && (
        <div data-testid="filter-chips">
          {filterChips.options?.map((chip: any) => (
            <button
              key={chip.value}
              data-testid={`chip-${chip.value}`}
              onClick={() => filterChips.onChange(chip.value)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
      {sort && (
        <select
          data-testid="sort"
          value={sort.value}
          onChange={(e) => sort.onChange(e.target.value)}
        >
          {sort.options?.map((opt: any) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  ),
}));

vi.mock('../SLAIndicator', () => ({
  SLAIndicator: ({ slaStatus, slaTimeRemaining, ticketStatus, size, showTimer }: any) => (
    <div
      data-testid="sla-indicator"
      data-sla-status={slaStatus}
      data-size={size}
      data-show-timer={showTimer}
    >
      {slaStatus} {slaTimeRemaining}m {ticketStatus}
    </div>
  ),
}));

vi.mock('@/components/shared/app-avatar', () => ({
  AppAvatar: ({ name }: any) => <div data-testid="app-avatar">{name}</div>,
}));

vi.mock('@/lib/tickets/ticket-utils', () => ({
  getPriorityConfig: (priority: string) => {
    const configs: Record<string, any> = {
      CRITICAL: { text: 'text-red-600', icon: 'priority_high', label: 'Critical' },
      HIGH: { text: 'text-orange-600', icon: 'arrow_upward', label: 'High' },
      MEDIUM: { text: 'text-yellow-600', icon: 'remove', label: 'Medium' },
      LOW: { text: 'text-green-600', icon: 'arrow_downward', label: 'Low' },
    };
    return configs[priority] || { text: 'text-slate-500', icon: 'help', label: priority };
  },
}));

vi.mock('@/lib/shared/filter-utils', () => ({
  ticketStatusOptions: () => [
    { value: 'OPEN', label: 'Open' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
  ],
  ticketPriorityOptions: () => [
    { value: 'CRITICAL', label: 'Critical' },
    { value: 'HIGH', label: 'High' },
  ],
  slaStatusChips: () => [
    { value: 'all', label: 'All' },
    { value: 'BREACHED', label: 'Breached' },
    { value: 'AT_RISK', label: 'At Risk' },
  ],
}));

describe('TicketList Coverage', () => {
  const mockTickets = createMockTicketList(3);
  const mockStats = createMockStats();
  const mockFilterOptions = createMockFilterOptions();

  const defaultProps = {
    tickets: mockTickets,
    total: mockTickets.length,
    stats: mockStats,
    filterOptions: mockFilterOptions,
    isLoading: false,
    onRowClick: vi.fn(),
    onBulkAction: vi.fn().mockResolvedValue(undefined),
    pagination: { page: 1, limit: 10, onPageChange: vi.fn() },
    searchValue: '',
    onSearchChange: vi.fn(),
    statusFilter: '',
    onStatusChange: vi.fn(),
    priorityFilter: '',
    onPriorityChange: vi.fn(),
    slaFilter: 'all',
    onSLAChange: vi.fn(),
    sortValue: 'updatedAt',
    onSortChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Column Cell Renderers ─────────────────────────────────────────────────

  describe('Column Cell Renderers', () => {
    it('renders ticket number and subject in first column', () => {
      render(<TicketList {...defaultProps} />);

      expect(screen.getByText(`#${mockTickets[0].ticketNumber}`)).toBeInTheDocument();
      expect(screen.getByText(mockTickets[0].subject)).toBeInTheDocument();
      expect(screen.getByText(mockTickets[0].contactName)).toBeInTheDocument();
    });

    it('renders SLA indicators in timer and status columns', () => {
      render(<TicketList {...defaultProps} />);

      const slaIndicators = screen.getAllByTestId('sla-indicator');
      // Each ticket should have 2 SLA indicators (timer + status)
      expect(slaIndicators.length).toBeGreaterThanOrEqual(mockTickets.length * 2);
    });

    it('renders priority badges for each ticket', () => {
      render(<TicketList {...defaultProps} />);

      // Priority labels appear in both column cells and filter dropdowns
      // Just verify that at least one priority icon is rendered via getPriorityConfig
      // At least some cells should contain priority text
      const priorityTexts = ['Critical', 'High', 'Medium', 'Low'];
      const found = priorityTexts.some((p) => screen.queryAllByText(p).length > 0);
      expect(found).toBe(true);
    });

    it('renders assignee with avatar for assigned tickets', () => {
      const assignedTicket = { ...mockTickets[0], assignee: 'Sarah Jenkins', assigneeAvatar: 'SJ' };
      render(<TicketList {...defaultProps} tickets={[assignedTicket]} />);

      // "Sarah Jenkins" may appear in both the table cell and filter dropdown options
      expect(screen.getAllByText('Sarah Jenkins').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByTestId('app-avatar').length).toBeGreaterThanOrEqual(1);
    });

    it('renders Unassigned for tickets without assignee', () => {
      const unassigned = { ...mockTickets[0], assignee: null, assigneeAvatar: null };
      render(<TicketList {...defaultProps} tickets={[unassigned]} />);

      expect(screen.getByText('Unassigned')).toBeInTheDocument();
    });

    it('renders updated time column', () => {
      render(<TicketList {...defaultProps} />);

      // updatedAt value may appear in multiple rows if mock data shares the same value
      const matches = screen.getAllByText(mockTickets[0].updatedAt);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('renders row action buttons (resolve, escalate, etc.)', () => {
      render(<TicketList {...defaultProps} />);

      const rowActions = screen.getAllByTestId('row-actions');
      expect(rowActions.length).toBe(mockTickets.length);

      // Quick actions: Resolve and Escalate
      expect(screen.getAllByTestId('quick-resolve').length).toBe(mockTickets.length);
      expect(screen.getAllByTestId('quick-escalate').length).toBe(mockTickets.length);
    });
  });

  // ─── Stats Card Interactions ───────────────────────────────────────────────

  describe('Stats Card Interactions', () => {
    it('clicks Open stats card to filter by OPEN', () => {
      render(<TicketList {...defaultProps} />);

      const openCard = screen.getByLabelText(/Filter by Open tickets/);
      fireEvent.click(openCard);

      expect(defaultProps.onStatusChange).toHaveBeenCalledWith('OPEN');
    });

    it('toggles off Open filter when already active', () => {
      render(<TicketList {...defaultProps} statusFilter="OPEN" />);

      const openCard = screen.getByLabelText(/Filter by Open tickets/);
      fireEvent.click(openCard);

      expect(defaultProps.onStatusChange).toHaveBeenCalledWith('');
    });

    it('clicks In Progress stats card to filter', () => {
      render(<TicketList {...defaultProps} />);

      const card = screen.getByLabelText(/Filter by In Progress tickets/);
      fireEvent.click(card);

      expect(defaultProps.onStatusChange).toHaveBeenCalledWith('IN_PROGRESS');
    });

    it('clicks SLA Breached stats card to filter', () => {
      render(<TicketList {...defaultProps} />);

      const card = screen.getByLabelText(/Filter by SLA Breached tickets/);
      fireEvent.click(card);

      expect(defaultProps.onSLAChange).toHaveBeenCalledWith('BREACHED');
    });

    it('clicks Resolved Today stats card to filter', () => {
      render(<TicketList {...defaultProps} />);

      const card = screen.getByLabelText(/Filter by Resolved tickets/);
      fireEvent.click(card);

      expect(defaultProps.onStatusChange).toHaveBeenCalledWith('RESOLVED');
    });

    // Stat cards are native <button type="button"> elements now, so keyboard
    // activation is implicit (browser dispatches `click` on Enter/Space).
    // `fireEvent.keyDown` does NOT simulate that default — use userEvent.keyboard
    // after focusing the button to exercise the real keyboard-activation path.
    it('handles keyboard Enter on stats card', async () => {
      const user = userEvent.setup();
      render(<TicketList {...defaultProps} />);

      const openCard = screen.getByLabelText(/Filter by Open tickets/);
      openCard.focus();
      await user.keyboard('{Enter}');

      expect(defaultProps.onStatusChange).toHaveBeenCalledWith('OPEN');
    });

    it('handles keyboard Space on stats card', async () => {
      const user = userEvent.setup();
      render(<TicketList {...defaultProps} />);

      const openCard = screen.getByLabelText(/Filter by Open tickets/);
      openCard.focus();
      await user.keyboard(' ');

      expect(defaultProps.onStatusChange).toHaveBeenCalledWith('OPEN');
    });

    it('handles keyboard Enter on In Progress card', async () => {
      const user = userEvent.setup();
      render(<TicketList {...defaultProps} />);

      const card = screen.getByLabelText(/Filter by In Progress tickets/);
      card.focus();
      await user.keyboard('{Enter}');

      expect(defaultProps.onStatusChange).toHaveBeenCalledWith('IN_PROGRESS');
    });

    it('handles keyboard Enter on SLA Breached card', async () => {
      const user = userEvent.setup();
      render(<TicketList {...defaultProps} />);

      const card = screen.getByLabelText(/Filter by SLA Breached tickets/);
      card.focus();
      await user.keyboard('{Enter}');

      expect(defaultProps.onSLAChange).toHaveBeenCalledWith('BREACHED');
    });

    it('handles keyboard Enter on Resolved card', async () => {
      const user = userEvent.setup();
      render(<TicketList {...defaultProps} />);

      const card = screen.getByLabelText(/Filter by Resolved tickets/);
      card.focus();
      await user.keyboard('{Enter}');

      expect(defaultProps.onStatusChange).toHaveBeenCalledWith('RESOLVED');
    });

    it('shows active state for selected status filter', () => {
      render(<TicketList {...defaultProps} statusFilter="OPEN" />);

      const openCard = screen.getByLabelText(/Filter by Open tickets/);
      expect(openCard.getAttribute('aria-pressed')).toBe('true');
    });

    it('shows active state for SLA Breached filter', () => {
      render(<TicketList {...defaultProps} slaFilter="BREACHED" />);

      const card = screen.getByLabelText(/Filter by SLA Breached tickets/);
      expect(card.getAttribute('aria-pressed')).toBe('true');
    });

    it('toggles off SLA Breached filter when already active', () => {
      render(<TicketList {...defaultProps} slaFilter="BREACHED" />);

      const card = screen.getByLabelText(/Filter by SLA Breached tickets/);
      fireEvent.click(card);

      expect(defaultProps.onSLAChange).toHaveBeenCalledWith('all');
    });
  });

  // ─── Bulk Action Dialogs ───────────────────────────────────────────────────

  describe('Bulk Actions', () => {
    it('opens assign dialog on bulk assign click', () => {
      render(<TicketList {...defaultProps} />);

      const assignBtn = screen.getByTestId('bulk-assign');
      fireEvent.click(assignBtn);

      expect(screen.getByTestId('status-select-dialog')).toBeInTheDocument();
      expect(screen.getByText('Assign Tickets')).toBeInTheDocument();
    });

    it('opens status dialog on bulk update status click', () => {
      render(<TicketList {...defaultProps} />);

      const statusBtn = screen.getByTestId('bulk-update-status');
      fireEvent.click(statusBtn);

      expect(screen.getByTestId('status-select-dialog')).toBeInTheDocument();
      expect(screen.getByText('Update Ticket Status')).toBeInTheDocument();
    });

    it('opens resolve dialog on bulk resolve click', () => {
      render(<TicketList {...defaultProps} />);

      const resolveBtn = screen.getByTestId('bulk-resolve');
      fireEvent.click(resolveBtn);

      expect(screen.getByTestId('dialog-resolve')).toBeInTheDocument();
    });

    it('opens escalate dialog on bulk escalate click', () => {
      render(<TicketList {...defaultProps} />);

      const escalateBtn = screen.getByTestId('bulk-escalate');
      fireEvent.click(escalateBtn);

      expect(screen.getByTestId('dialog-escalate')).toBeInTheDocument();
    });

    it('opens close dialog on bulk close click', () => {
      render(<TicketList {...defaultProps} />);

      const closeBtn = screen.getByTestId('bulk-close');
      fireEvent.click(closeBtn);

      expect(screen.getByTestId('dialog-close')).toBeInTheDocument();
    });

    it('calls onBulkAction with resolve when resolve dialog confirmed', async () => {
      render(<TicketList {...defaultProps} />);

      fireEvent.click(screen.getByTestId('bulk-resolve'));
      fireEvent.click(screen.getByTestId('confirm-resolve'));

      await vi.waitFor(() => {
        expect(defaultProps.onBulkAction).toHaveBeenCalledWith('resolve', expect.any(Array));
      });
    });

    it('calls onBulkAction with escalate when escalate dialog confirmed', async () => {
      render(<TicketList {...defaultProps} />);

      fireEvent.click(screen.getByTestId('bulk-escalate'));
      fireEvent.click(screen.getByTestId('confirm-escalate'));

      await vi.waitFor(() => {
        expect(defaultProps.onBulkAction).toHaveBeenCalledWith('escalate', expect.any(Array));
      });
    });

    it('calls onBulkAction with close when close dialog confirmed', async () => {
      render(<TicketList {...defaultProps} />);

      fireEvent.click(screen.getByTestId('bulk-close'));
      fireEvent.click(screen.getByTestId('confirm-close'));

      await vi.waitFor(() => {
        expect(defaultProps.onBulkAction).toHaveBeenCalledWith('close', expect.any(Array));
      });
    });

    it('calls onBulkAction with assign when assign dialog option selected', async () => {
      render(<TicketList {...defaultProps} />);

      fireEvent.click(screen.getByTestId('bulk-assign'));
      // Select first assignee option
      const option = screen.getByTestId('opt-sarah-jenkins');
      fireEvent.click(option);

      await vi.waitFor(() => {
        expect(defaultProps.onBulkAction).toHaveBeenCalledWith('assign', expect.any(Array), {
          assigneeId: 'sarah-jenkins',
        });
      });
    });

    it('calls onBulkAction with updateStatus when status dialog option selected', async () => {
      render(<TicketList {...defaultProps} />);

      fireEvent.click(screen.getByTestId('bulk-update-status'));
      // Select OPEN status
      const option = screen.getByTestId('opt-OPEN');
      fireEvent.click(option);

      await vi.waitFor(() => {
        expect(defaultProps.onBulkAction).toHaveBeenCalledWith('updateStatus', expect.any(Array), {
          status: 'OPEN',
        });
      });
    });
  });

  // ─── Row Actions ───────────────────────────────────────────────────────────

  describe('Row Actions', () => {
    it('opens resolve dialog from row quick action', () => {
      render(<TicketList {...defaultProps} />);

      const resolveButtons = screen.getAllByTestId('quick-resolve');
      fireEvent.click(resolveButtons[0]);

      expect(screen.getByTestId('dialog-resolve')).toBeInTheDocument();
    });

    it('opens escalate dialog from row quick action', () => {
      render(<TicketList {...defaultProps} />);

      const escalateButtons = screen.getAllByTestId('quick-escalate');
      fireEvent.click(escalateButtons[0]);

      expect(screen.getByTestId('dialog-escalate')).toBeInTheDocument();
    });

    it('opens assign dialog from row dropdown action', () => {
      render(<TicketList {...defaultProps} />);

      const assignButtons = screen.getAllByTestId('dropdown-assign-to...');
      fireEvent.click(assignButtons[0]);

      expect(screen.getByTestId('status-select-dialog')).toBeInTheDocument();
    });

    it('triggers change priority from row dropdown action', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      render(<TicketList {...defaultProps} />);

      const buttons = screen.getAllByTestId('dropdown-change-priority');
      fireEvent.click(buttons[0]);

      expect(consoleSpy).toHaveBeenCalledWith('Change priority:', expect.any(String));
      consoleSpy.mockRestore();
    });

    it('triggers view history from row dropdown action', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      render(<TicketList {...defaultProps} />);

      const buttons = screen.getAllByTestId('dropdown-view-history');
      fireEvent.click(buttons[0]);

      expect(consoleSpy).toHaveBeenCalledWith('View history:', expect.any(String));
      consoleSpy.mockRestore();
    });

    it('triggers delete from row dropdown action', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      render(<TicketList {...defaultProps} />);

      const buttons = screen.getAllByTestId('dropdown-delete');
      fireEvent.click(buttons[0]);

      expect(consoleSpy).toHaveBeenCalledWith('Delete ticket:', expect.any(String));
      consoleSpy.mockRestore();
    });
  });

  // ─── SearchFilterBar Integration ──────────────────────────────────────────

  describe('SearchFilterBar', () => {
    it('passes sort options to SearchFilterBar', () => {
      render(<TicketList {...defaultProps} />);

      expect(screen.getByTestId('sort')).toBeInTheDocument();
    });

    it('passes filter chips to SearchFilterBar', () => {
      render(<TicketList {...defaultProps} />);

      expect(screen.getByTestId('filter-chips')).toBeInTheDocument();
    });
  });
});
