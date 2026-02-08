import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactList } from '../ContactList';

// ─── Mock @intelliflow/ui ───────────────────────────────────────────────────────

vi.mock('@intelliflow/ui', () => ({
  DataTable: ({ columns, data, onRowClick, emptyMessage, enableRowSelection, bulkActions, ...rest }: any) => (
    <div data-testid="data-table" aria-label={rest['aria-label']}>
      {data.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : (
        <table>
          <thead>
            <tr>
              {columns.map((col: any, i: number) => (
                <th key={i}>{typeof col.header === 'function' ? col.header() : col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row: any, ri: number) => (
              <tr key={ri} onClick={() => onRowClick?.(row)} data-testid={`row-${row.id}`}>
                {columns.map((col: any, ci: number) => (
                  <td key={ci}>
                    {col.cell?.({ row: { original: row } }) ?? row[col.accessorKey]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {enableRowSelection && bulkActions && (
        <div data-testid="bulk-actions">
          {bulkActions.map((action: any, i: number) => (
            <button key={i} onClick={() => action.onClick(data)} data-testid={`bulk-${action.label.toLowerCase().replace(/\s/g, '-')}`}>
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
        <button key={i} onClick={(e) => { e.stopPropagation(); a.onClick(); }} aria-label={a.label}>{a.label}</button>
      ))}
      {dropdownActions?.filter((a: any) => !a.separator).map((a: any, i: number) => (
        <button key={i} onClick={(e) => { e.stopPropagation(); a.onClick(); }} aria-label={a.label}>{a.label}</button>
      ))}
    </div>
  ),
  Skeleton: ({ className }: any) => <div data-testid="skeleton" className={className} />,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createContact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    email: 'sarah@skynet.com',
    firstName: 'Sarah',
    lastName: 'Connor',
    title: 'VP of Engineering',
    phone: '+15550001234',
    department: 'Engineering',
    accountId: 'acct-1',
    status: 'ACTIVE' as const,
    createdAt: '2026-01-15T10:00:00.000Z',
    owner: { id: 'user-1', email: 'jane@example.com', name: 'Jane Smith' },
    account: { id: 'acct-1', name: 'Cyberdyne Systems' },
    _count: { opportunities: 2, tasks: 3 },
    ...overrides,
  };
}

const defaultProps = {
  contacts: [createContact()],
  total: 1,
  isLoading: false,
  onRowClick: vi.fn(),
  onDelete: vi.fn(),
  onBulkDelete: vi.fn(),
  onBulkEmail: vi.fn(),
  onBulkExport: vi.fn(),
};

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('ContactList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders empty state when contacts array is empty', () => {
      render(<ContactList {...defaultProps} contacts={[]} total={0} />);

      expect(screen.getByText('No contacts found')).toBeInTheDocument();
    });

    it('renders contact rows in DataTable', () => {
      render(<ContactList {...defaultProps} />);

      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
      expect(screen.getByText('Cyberdyne Systems')).toBeInTheDocument();
    });

    it('displays loading skeleton while isLoading=true', () => {
      render(<ContactList {...defaultProps} isLoading={true} />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Loading contacts...')).toBeInTheDocument();
    });

    it('displays total count "Showing X of Y"', () => {
      render(<ContactList {...defaultProps} total={50} />);

      expect(screen.getByText('Showing 1 of 50')).toBeInTheDocument();
    });
  });

  // ── Sorting & Pagination ──────────────────────────────────────────────────────

  describe('Sorting & Pagination', () => {
    it('renders column headers', () => {
      render(<ContactList {...defaultProps} />);

      expect(screen.getByText('Contact Name')).toBeInTheDocument();
      expect(screen.getByText('Account')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
    });
  });

  // ── Bulk Actions ──────────────────────────────────────────────────────────────

  describe('Bulk Actions', () => {
    it('renders bulk action buttons', () => {
      render(<ContactList {...defaultProps} />);

      expect(screen.getByTestId('bulk-send-email')).toBeInTheDocument();
      expect(screen.getByTestId('bulk-export')).toBeInTheDocument();
      expect(screen.getByTestId('bulk-delete')).toBeInTheDocument();
    });

    it('calls onBulkEmail with selected IDs', async () => {
      const user = userEvent.setup();
      const onBulkEmail = vi.fn();
      render(<ContactList {...defaultProps} onBulkEmail={onBulkEmail} />);

      await user.click(screen.getByTestId('bulk-send-email'));
      expect(onBulkEmail).toHaveBeenCalledWith(['c-1']);
    });

    it('calls onBulkExport with selected IDs and format', async () => {
      const user = userEvent.setup();
      const onBulkExport = vi.fn();
      render(<ContactList {...defaultProps} onBulkExport={onBulkExport} />);

      await user.click(screen.getByTestId('bulk-export'));
      expect(onBulkExport).toHaveBeenCalledWith(['c-1'], 'csv');
    });

    it('calls onBulkDelete with selected IDs', async () => {
      const user = userEvent.setup();
      const onBulkDelete = vi.fn();
      render(<ContactList {...defaultProps} onBulkDelete={onBulkDelete} />);

      await user.click(screen.getByTestId('bulk-delete'));
      expect(onBulkDelete).toHaveBeenCalledWith(['c-1']);
    });
  });

  // ── Row Actions ───────────────────────────────────────────────────────────────

  describe('Row Actions', () => {
    it('calls onDelete when delete action clicked', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(<ContactList {...defaultProps} onDelete={onDelete} />);

      const deleteBtn = screen.getByLabelText('Delete');
      await user.click(deleteBtn);
      expect(onDelete).toHaveBeenCalled();
    });

    it('calls onEdit when edit action clicked', async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();
      render(<ContactList {...defaultProps} onEdit={onEdit} />);

      const editBtn = screen.getByLabelText('Edit Contact');
      await user.click(editBtn);
      expect(onEdit).toHaveBeenCalled();
    });

    it('calls onCreateDeal when Create Deal action clicked', async () => {
      const user = userEvent.setup();
      const onCreateDeal = vi.fn();
      render(<ContactList {...defaultProps} onCreateDeal={onCreateDeal} />);

      const btn = screen.getByLabelText('Create Deal');
      await user.click(btn);
      expect(onCreateDeal).toHaveBeenCalledWith(defaultProps.contacts[0]);
    });

    it('calls onCreateTicket when Create Ticket action clicked', async () => {
      const user = userEvent.setup();
      const onCreateTicket = vi.fn();
      render(<ContactList {...defaultProps} onCreateTicket={onCreateTicket} />);

      const btn = screen.getByLabelText('Create Ticket');
      await user.click(btn);
      expect(onCreateTicket).toHaveBeenCalledWith(defaultProps.contacts[0]);
    });

    it('calls onScheduleMeeting when Schedule Meeting action clicked', async () => {
      const user = userEvent.setup();
      const onScheduleMeeting = vi.fn();
      render(<ContactList {...defaultProps} onScheduleMeeting={onScheduleMeeting} />);

      const btn = screen.getByLabelText('Schedule Meeting');
      await user.click(btn);
      expect(onScheduleMeeting).toHaveBeenCalledWith(defaultProps.contacts[0]);
    });

    it('does not render Create Deal action when onCreateDeal is not provided', () => {
      render(<ContactList {...defaultProps} />);
      expect(screen.queryByLabelText('Create Deal')).not.toBeInTheDocument();
    });
  });

  // ── Accessibility ─────────────────────────────────────────────────────────────

  describe('Accessibility', () => {
    it('DataTable has aria-label="Contact list"', () => {
      render(<ContactList {...defaultProps} />);

      expect(screen.getByTestId('data-table')).toHaveAttribute('aria-label', 'Contact list');
    });

    it('loading state has role="status" and aria-busy="true"', () => {
      render(<ContactList {...defaultProps} isLoading={true} />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-busy', 'true');
    });

    it('email links have aria-label="Send email to {name}"', () => {
      render(<ContactList {...defaultProps} />);

      expect(screen.getByLabelText('Send email to Sarah Connor')).toBeInTheDocument();
    });
  });
});
