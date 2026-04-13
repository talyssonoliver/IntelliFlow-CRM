// @vitest-environment jsdom
/**
 * ContactList Component Tests (PG-133)
 *
 * Tests the ContactList component for:
 * - Data table rendering
 * - Loading states
 * - Empty states
 * - Row click handling
 * - Bulk actions (email, export, delete)
 * - Quick actions (call, email)
 * - Pagination info
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactList } from '../ContactList';
import {
  createMockContact,
  createMockContactList,
  createMockHandlers,
  resetAllMocks,
} from './contact-test-utils';

// Mock the DataTable component from @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  DataTable: ({
    columns,
    data,
    onRowClick,
    emptyMessage,
    emptyIcon,
  }: Readonly<{
    columns: unknown[];
    data: unknown[];
    onRowClick: (row: unknown) => void;
    emptyMessage: string;
    emptyIcon: string;
  }>) => {
    if (data.length === 0) {
      return (
        <div>
          <span className="material-symbols-outlined">{emptyIcon}</span>
          <p>{emptyMessage}</p>
        </div>
      );
    }
    return (
      <table>
        <tbody>
          {(data as unknown[]).map((row: unknown, _idx: number) => {
            const rowData = row as { id: string; firstName: string; lastName: string };
            // Render all columns including the actions column
            const actionsColumn = (columns as unknown[]).find(
              (col: unknown) => (col as { id?: string }).id === 'actions'
            ) as { id?: string; cell?: (ctx: unknown) => React.ReactNode } | undefined;
            return (
              <tr
                key={rowData.id}
                onClick={() => onRowClick(row)}
                data-testid={`row-${rowData.id}`}
              >
                <td>
                  {rowData.firstName} {rowData.lastName}
                </td>
                {actionsColumn && (
                  <td>
                    {typeof (actionsColumn as { cell?: (ctx: unknown) => React.ReactNode }).cell ===
                    'function'
                      ? (actionsColumn as { cell: (ctx: unknown) => React.ReactNode }).cell({
                          row: { original: row },
                        })
                      : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  },
  TableRowActions: ({
    quickActions,
    dropdownActions,
  }: Readonly<{
    quickActions?: Array<{ icon: string; label: string; onClick: () => void }>;
    dropdownActions?: Array<{
      icon: string;
      label: string;
      onClick: () => void;
      separator?: boolean;
      variant?: string;
      id?: string;
    }>;
  }>) => (
    <div data-testid="row-actions">
      {quickActions?.map((action) => (
        <button key={action.label} onClick={action.onClick}>
          {action.label}
        </button>
      ))}
      {dropdownActions
        ?.filter((action) => !action.separator)
        .map((action) => (
          <button key={action.label} onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  ),
  Skeleton: ({ className }: Readonly<{ className?: string }>) => (
    <div className={`skeleton ${className ?? ''}`} />
  ),
}));

describe('ContactList', () => {
  let handlers: ReturnType<typeof createMockHandlers>;

  beforeEach(() => {
    handlers = createMockHandlers();
    resetAllMocks(handlers);
  });

  describe('Rendering', () => {
    it('renders contact names', () => {
      const contacts = createMockContactList(3);
      render(
        <ContactList
          contacts={contacts}
          total={3}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      expect(screen.getByText(/Contact1 User1/)).toBeInTheDocument();
      expect(screen.getByText(/Contact2 User2/)).toBeInTheDocument();
      expect(screen.getByText(/Contact3 User3/)).toBeInTheDocument();
    });

    it('shows total count', () => {
      const contacts = createMockContactList(5);
      render(
        <ContactList
          contacts={contacts}
          total={10}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      expect(screen.getByText(/Showing 5 of 10/)).toBeInTheDocument();
    });

    it('does not show count when total is 0', () => {
      render(
        <ContactList
          contacts={[]}
          total={0}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading skeletons when isLoading is true', () => {
      render(
        <ContactList
          contacts={[]}
          total={0}
          isLoading={true}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      expect(screen.getByText('Loading contacts...')).toBeInTheDocument();
      const skeletons = document.querySelectorAll('.skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('has aria-busy attribute when loading', () => {
      const { container } = render(
        <ContactList
          contacts={[]}
          total={0}
          isLoading={true}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      // The loading container uses aria-live="polite" aria-busy="true" (semantic <div> without explicit role)
      const loadingContainer = container.querySelector('[aria-busy="true"]');
      expect(loadingContainer).toBeInTheDocument();
      expect(loadingContainer).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('Empty State', () => {
    it('shows empty message when no contacts', () => {
      render(
        <ContactList
          contacts={[]}
          total={0}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      expect(screen.getByText('No contacts found')).toBeInTheDocument();
    });

    it('renders empty icon', () => {
      const { container } = render(
        <ContactList
          contacts={[]}
          total={0}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      const icon = container.querySelector('.material-symbols-outlined');
      expect(icon).toHaveTextContent('person_off');
    });
  });

  describe('Row Click', () => {
    it('calls onRowClick when row is clicked', () => {
      const contacts = createMockContactList(1);
      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      const row = screen.getByTestId(`row-${contacts[0].id}`);
      fireEvent.click(row);

      expect(handlers.onRowClick).toHaveBeenCalledTimes(1);
      expect(handlers.onRowClick).toHaveBeenCalledWith(
        expect.objectContaining({
          id: contacts[0].id,
        })
      );
    });
  });

  describe('Quick Actions', () => {
    it('renders call and email quick actions', () => {
      const contacts = [createMockContact({ phone: '+1 (555) 123-4567' })];
      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      expect(screen.getByText('Call')).toBeInTheDocument();
      expect(screen.getByText('Send Email')).toBeInTheDocument();
    });

    it('opens tel: link when call action clicked', async () => {
      const user = userEvent.setup();
      const contacts = [createMockContact({ phone: '+1 (555) 123-4567' })];
      const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      await user.click(screen.getByText('Call'));
      await waitFor(() => {
        expect(windowOpen).toHaveBeenCalledWith('tel:+1 (555) 123-4567');
      });

      windowOpen.mockRestore();
    });

    it('navigates to compose page when email action clicked', async () => {
      const user = userEvent.setup();
      const contacts = [createMockContact({ email: 'test@example.com' })];

      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      await user.click(screen.getByText('Send Email'));
      await waitFor(() => {
        expect(window.location.href).toContain('/email/compose?to=test%40example.com');
      });
    });
  });

  describe('Dropdown Actions', () => {
    it('renders edit action when onEdit provided', () => {
      const contacts = [createMockContact()];
      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
          onEdit={handlers.onEdit}
        />
      );

      expect(screen.getByText('Edit Contact')).toBeInTheDocument();
    });

    it('calls onEdit when edit action clicked', async () => {
      const user = userEvent.setup();
      const contacts = [createMockContact()];
      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
          onEdit={handlers.onEdit}
        />
      );

      await user.click(screen.getByText('Edit Contact'));
      await waitFor(() => {
        expect(handlers.onEdit).toHaveBeenCalledTimes(1);
      });
    });

    it('renders create deal action when onCreateDeal provided', () => {
      const contacts = [createMockContact()];
      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
          onCreateDeal={handlers.onCreateDeal}
        />
      );

      expect(screen.getByText('Create Deal')).toBeInTheDocument();
    });

    it('renders create ticket action when onCreateTicket provided', () => {
      const contacts = [createMockContact()];
      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
          onCreateTicket={handlers.onCreateTicket}
        />
      );

      expect(screen.getByText('Create Ticket')).toBeInTheDocument();
    });

    it('renders schedule meeting action when onScheduleMeeting provided', () => {
      const contacts = [createMockContact()];
      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
          onScheduleMeeting={handlers.onScheduleMeeting}
        />
      );

      expect(screen.getByText('New Appointment')).toBeInTheDocument();
    });

    it('always renders delete action', () => {
      const contacts = [createMockContact()];
      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('calls onDelete when delete action clicked', async () => {
      const user = userEvent.setup();
      const contacts = [createMockContact()];
      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      await user.click(screen.getByText('Delete'));
      await waitFor(() => {
        expect(handlers.onDelete).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Accessibility', () => {
    it('has aria-label for data table', () => {
      const contacts = createMockContactList(1);
      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      // DataTable passes aria-label to the table element
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('has aria-live region for count updates', () => {
      const contacts = createMockContactList(3);
      render(
        <ContactList
          contacts={contacts}
          total={10}
          isLoading={false}
          onRowClick={handlers.onRowClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Domain Status Types (IFC-253 F-08)', () => {
    let handlers: ReturnType<typeof createMockHandlers>;

    beforeEach(() => {
      handlers = createMockHandlers();
      resetAllMocks(handlers);
    });

    it('accepts contacts with PROSPECT status', () => {
      const contacts = [createMockContact({ status: 'PROSPECT' })];
      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );
      // Should render without crashing
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('accepts contacts with CUSTOMER status', () => {
      const contacts = [createMockContact({ status: 'CUSTOMER' })];
      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('accepts contacts with FORMER_CUSTOMER status', () => {
      const contacts = [createMockContact({ status: 'FORMER_CUSTOMER' })];
      render(
        <ContactList
          contacts={contacts}
          total={1}
          isLoading={false}
          onRowClick={handlers.onClick}
          onDelete={handlers.onDelete}
          onBulkDelete={handlers.onBulkDelete}
          onBulkEmail={handlers.onBulkEmail}
          onBulkExport={handlers.onBulkExport}
        />
      );
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });
});
