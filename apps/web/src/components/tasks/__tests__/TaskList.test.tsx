/**
 * TaskList Component Tests (PG-136)
 *
 * Tests for task data table with columns, row actions, and bulk actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TaskList, type TaskListItem } from '../TaskList';
import { followUpTaskRows } from '../follow-up-rows';

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }));

// Mock @intelliflow/ui (partial — preserve real exports like EmptyState)
vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  DataTable: ({ columns, data, onRowClick, bulkActions, canSelectRow, getRowId }: any) => (
    <div data-testid="data-table">
      <table>
        <thead>
          <tr>
            {columns.map((col: any, i: number) => (
              <th key={i}>{typeof col.header === 'function' ? 'Actions' : col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row: any) => (
            <tr
              key={row.id}
              data-testid={`task-row-${row.id}`}
              data-selectable={canSelectRow ? String(canSelectRow(row)) : 'true'}
              data-row-id={getRowId ? getRowId(row) : ''}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col: any, i: number) => (
                <td key={i}>
                  {col.cell ? col.cell({ row: { original: row } }) : row[col.accessorKey]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {bulkActions && (
        <div data-testid="bulk-actions">
          {bulkActions.map((action: any, i: number) => (
            <button
              key={i}
              data-testid={`bulk-${action.label.toLowerCase().replace(/\s/g, '-')}`}
              onClick={() => action.onExecute(data)}
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
        <button key={i} onClick={a.onClick} disabled={a.disabled} aria-label={a.label}>
          {a.icon}
        </button>
      ))}
      {dropdownActions?.map((a: any, i: number) => (
        <button key={i} onClick={a.onClick} aria-label={a.label}>
          {a.icon}
        </button>
      ))}
    </div>
  ),
  Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
  ConfirmationDialog: () => null,
  toast: vi.fn(),
}));

const createMockTask = (overrides: Partial<TaskListItem> = {}): TaskListItem =>
  ({
    id: 'task-1',
    title: 'Test Task',
    description: 'Task description',
    dueDate: '2026-03-15T00:00:00.000Z',
    priority: 'MEDIUM',
    status: 'PENDING',
    ownerId: 'user-1',
    owner: { id: 'user-1', email: 'user@test.com', name: 'Test User' },
    lead: null,
    contact: null,
    opportunity: null,
    ...overrides,
  }) as TaskListItem;

describe('TaskList', () => {
  const defaultProps = {
    tasks: [createMockTask()],
    isLoading: false,
    onRowClick: vi.fn(),
    onComplete: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onArchive: vi.fn(),
    onBulkComplete: vi.fn(),
    onBulkDelete: vi.fn(),
    onBulkArchive: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton when isLoading', () => {
    render(<TaskList {...defaultProps} isLoading={true} tasks={[]} />);

    expect(screen.getByTestId('task-list-skeleton')).toBeInTheDocument();
  });

  it('renders empty state when no tasks', () => {
    render(<TaskList {...defaultProps} tasks={[]} />);

    expect(screen.getByTestId('task-list-empty')).toBeInTheDocument();
    expect(screen.getByText('No tasks found')).toBeInTheDocument();
  });

  it('does not ask to adjust filters when none is on', () => {
    render(<TaskList {...defaultProps} tasks={[]} filtered={false} />);
    expect(screen.getByTestId('task-list-empty')).toBeInTheDocument();
    expect(screen.queryByText(/adjusting your filters/i)).toBeNull();
  });

  describe('follow-up rows (owner 21/11: follow-ups in the same task table)', () => {
    it("keys selection by the row's own id, so it never moves to another row", () => {
      const owned = followUpTaskRows([
        {
          id: 'lead-8',
          firstName: 'Sam',
          lastName: 'Example',
          company: null,
          email: 'sam@example.invalid',
          lastContactedAt: '2026-11-13T09:00:00.000Z',
          owner: { id: 'user-3', email: 'owner@example.invalid', name: 'Pat Owner' },
        },
      ])[0];
      render(<TaskList {...defaultProps} tasks={[...defaultProps.tasks, owned]} />);
      const row = screen.getByTestId(`task-row-${owned.id}`);
      expect(row).toHaveAttribute('data-row-id', owned.id);
      // The lead's owner owns the follow-up (owner 27/11: one model).
      expect(row).toHaveTextContent('Pat Owner');
    });

    const followUp = followUpTaskRows([
      {
        id: 'lead-9',
        firstName: 'Jane',
        lastName: 'Example',
        company: null,
        email: 'jane@example.invalid',
        lastContactedAt: '2026-11-13T09:00:00.000Z',
      },
    ])[0];

    it('shows a follow-up like any task, pending and urgent (it is due), linked to its lead', () => {
      render(<TaskList {...defaultProps} tasks={[...defaultProps.tasks, followUp]} />);
      const row = screen.getByTestId(`task-row-${followUp.id}`);
      expect(row).toHaveTextContent('Follow up with Jane Example');
      // The table's own status pill and priority, no one-off badge (owner 21/11).
      expect(row).toHaveTextContent('PENDING');
      expect(row).toHaveTextContent('URGENT');
      expect(within(row).getByRole('link', { name: /Jane Example/ })).toHaveAttribute(
        'href',
        '/leads/lead-9'
      );
    });

    it('opens the lead on tap and offers "Mark done" and "Open lead", never Complete or Delete', () => {
      routerPush.mockClear();
      render(<TaskList {...defaultProps} tasks={[followUp]} />);
      const row = screen.getByTestId(`task-row-${followUp.id}`);
      expect(within(row).getByRole('button', { name: 'Open lead' })).toBeInTheDocument();
      expect(within(row).queryByRole('button', { name: 'Complete' })).toBeNull();
      expect(within(row).queryByRole('button', { name: 'Delete' })).toBeNull();
      fireEvent.click(row);
      expect(routerPush).toHaveBeenCalledWith('/leads/lead-9');
      expect(defaultProps.onRowClick).not.toHaveBeenCalledWith(followUp.id);
    });

    it('"Mark done" on a follow-up row hands its row id to onComplete', () => {
      const onComplete = vi.fn();
      render(<TaskList {...defaultProps} onComplete={onComplete} tasks={[followUp]} />);
      const row = screen.getByTestId(`task-row-${followUp.id}`);
      fireEvent.click(within(row).getByRole('button', { name: 'Mark done' }));
      expect(onComplete).toHaveBeenCalledWith(followUp.id);
    });

    it('bulk Mark Complete includes follow-ups; delete never touches them (owner 27/11)', () => {
      const onBulkComplete = vi.fn();
      const onBulkDelete = vi.fn();
      render(
        <TaskList
          {...defaultProps}
          tasks={[...defaultProps.tasks, followUp]}
          onBulkComplete={onBulkComplete}
          onBulkDelete={onBulkDelete}
        />
      );
      // The DataTable mock hands every row to the action, as a stale selection could.
      fireEvent.click(screen.getByTestId('bulk-mark-complete'));
      fireEvent.click(screen.getByTestId('bulk-delete'));
      expect(onBulkComplete).toHaveBeenCalledWith([defaultProps.tasks[0].id, followUp.id]);
      expect(onBulkDelete).toHaveBeenCalledWith([defaultProps.tasks[0].id]);
    });

    it('gives follow-ups the same selection checkbox as tasks (owner 27/11: one model)', () => {
      render(<TaskList {...defaultProps} tasks={[...defaultProps.tasks, followUp]} />);
      expect(screen.getByTestId(`task-row-${followUp.id}`)).toHaveAttribute(
        'data-selectable',
        'true'
      );
      expect(screen.getByTestId(`task-row-${defaultProps.tasks[0].id}`)).toHaveAttribute(
        'data-selectable',
        'true'
      );
    });
  });

  it('renders DataTable with task data', () => {
    render(<TaskList {...defaultProps} />);

    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.getByText('Test Task')).toBeInTheDocument();
  });

  it('renders all column headers', () => {
    render(<TaskList {...defaultProps} />);

    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Due Date')).toBeInTheDocument();
    expect(screen.getByText('Linked Entity')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<TaskList {...defaultProps} />);

    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('renders priority with icon', () => {
    render(<TaskList {...defaultProps} />);

    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
    expect(screen.getByText('flag')).toBeInTheDocument();
  });

  it('renders owner name', () => {
    render(<TaskList {...defaultProps} />);

    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('renders entity link for lead', () => {
    const taskWithLead = createMockTask({
      lead: { id: 'lead-1', firstName: 'John', lastName: 'Doe' },
    });
    render(<TaskList {...defaultProps} tasks={[taskWithLead]} />);

    expect(screen.getByRole('link', { name: /John Doe/ })).toBeInTheDocument();
  });

  it('renders dash when no entity linked', () => {
    render(<TaskList {...defaultProps} />);

    // Entity column should show dash
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders complete quick action button', () => {
    render(<TaskList {...defaultProps} />);

    const completeBtn = screen.getByRole('button', { name: 'Complete' });
    expect(completeBtn).toBeInTheDocument();
  });

  it('hides complete button for completed tasks', () => {
    const completedTask = createMockTask({ status: 'COMPLETED' as any });
    render(<TaskList {...defaultProps} tasks={[completedTask]} />);

    const completeBtn = screen.queryByRole('button', { name: 'Complete' });
    expect(completeBtn).not.toBeInTheDocument();
  });

  it('renders bulk actions', () => {
    render(<TaskList {...defaultProps} />);

    expect(screen.getByTestId('bulk-actions')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-mark-complete')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-archive')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-delete')).toBeInTheDocument();
  });

  it('renders task description in subtitle', () => {
    render(<TaskList {...defaultProps} />);

    expect(screen.getByText('Task description')).toBeInTheDocument();
  });

  it('renders multiple tasks', () => {
    const tasks = [
      createMockTask({ id: 'task-1', title: 'Task One' }),
      createMockTask({ id: 'task-2', title: 'Task Two' }),
    ];
    render(<TaskList {...defaultProps} tasks={tasks} />);

    expect(screen.getByText('Task One')).toBeInTheDocument();
    expect(screen.getByText('Task Two')).toBeInTheDocument();
  });

  it('renders contact entity link', () => {
    const taskWithContact = createMockTask({
      contact: { id: 'c-1', firstName: 'Alice', lastName: 'Wonder' },
    });
    render(<TaskList {...defaultProps} tasks={[taskWithContact]} />);
    expect(screen.getByRole('link', { name: /Alice Wonder/ })).toBeInTheDocument();
  });

  it('renders opportunity entity link', () => {
    const taskWithOpp = createMockTask({
      opportunity: { id: 'opp-1', name: 'Big Deal', stage: 'NEGOTIATION' },
    });
    render(<TaskList {...defaultProps} tasks={[taskWithOpp]} />);
    expect(screen.getByRole('link', { name: /Big Deal/ })).toBeInTheDocument();
  });

  it('renders overdue date styling', () => {
    const pastDate = new Date();
    pastDate.setUTCDate(pastDate.getUTCDate() - 5);
    const overdueTask = createMockTask({ dueDate: pastDate.toISOString() });
    render(<TaskList {...defaultProps} tasks={[overdueTask]} />);
    expect(screen.getByTestId('due-overdue')).toBeInTheDocument();
  });

  it('renders today date styling', () => {
    // getDueDateStatus in TaskList.tsx compares dueDay vs now by UTC day, so
    // build the fixture from UTC noon of the current UTC day — otherwise a
    // local-time noon near either side of 00:00 UTC lands on the adjacent UTC
    // day and the component returns 'overdue' / 'normal' instead of 'today'.
    const now = new Date();
    const todayUtcNoon = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0)
    );
    const todayTask = createMockTask({ dueDate: todayUtcNoon.toISOString() });
    render(<TaskList {...defaultProps} tasks={[todayTask]} />);
    expect(screen.getByTestId('due-today')).toBeInTheDocument();
  });

  it('renders dash for null due date', () => {
    const noDueTask = createMockTask({ dueDate: null });
    render(<TaskList {...defaultProps} tasks={[noDueTask]} />);
    expect(screen.getByTestId('due-normal')).toBeInTheDocument();
  });

  it('shows archive action for completed tasks instead of delete in row actions', () => {
    const completedTask = createMockTask({ status: 'COMPLETED' as any });
    render(<TaskList {...defaultProps} tasks={[completedTask]} />);
    const rowActions = screen.getByTestId('row-actions');
    const rowButtons = rowActions.querySelectorAll('button');
    const labels = Array.from(rowButtons).map((b) => b.getAttribute('aria-label'));
    expect(labels).toContain('Archive');
    expect(labels).not.toContain('Delete');
  });

  it('hides row-level delete and archive for archived tasks', () => {
    const archivedTask = createMockTask({ status: 'ARCHIVED' as any });
    render(<TaskList {...defaultProps} tasks={[archivedTask]} />);
    // Row actions (inside row-actions testid) should not have Delete or Archive
    const rowActions = screen.getByTestId('row-actions');
    // Edit is always present; Delete/Archive should be absent for ARCHIVED
    const rowButtons = rowActions.querySelectorAll('button');
    const labels = Array.from(rowButtons).map((b) => b.getAttribute('aria-label'));
    expect(labels).not.toContain('Delete');
    expect(labels).not.toContain('Archive');
  });

  it('shows owner email when name is null', () => {
    const taskNoOwnerName = createMockTask({
      owner: { id: 'u-1', email: 'user@test.com', name: null },
    });
    render(<TaskList {...defaultProps} tasks={[taskNoOwnerName]} />);
    expect(screen.getByText('user@test.com')).toBeInTheDocument();
  });

  it('calls onEdit when Edit row action is clicked', () => {
    render(<TaskList {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(defaultProps.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }));
  });

  it('calls onDelete when Delete row action is clicked', () => {
    render(<TaskList {...defaultProps} />);
    // Get row-level Delete from within row-actions (not bulk)
    const rowActions = screen.getByTestId('row-actions');
    const deleteBtn = rowActions.querySelector('button[aria-label="Delete"]');
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn!);
    expect(defaultProps.onDelete).toHaveBeenCalledWith('task-1');
  });

  it('calls onArchive when Archive row action is clicked for completed task', () => {
    const completedTask = createMockTask({ status: 'COMPLETED' as any });
    render(<TaskList {...defaultProps} tasks={[completedTask]} />);
    // Get row-level Archive from within row-actions
    const rowActions = screen.getByTestId('row-actions');
    const archiveBtn = rowActions.querySelector('button[aria-label="Archive"]');
    expect(archiveBtn).toBeTruthy();
    fireEvent.click(archiveBtn!);
    expect(defaultProps.onArchive).toHaveBeenCalledWith('task-1');
  });

  it('calls onBulkComplete when bulk Mark Complete is clicked', () => {
    const tasks = [createMockTask({ id: 't-1' }), createMockTask({ id: 't-2' })];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    fireEvent.click(screen.getByTestId('bulk-mark-complete'));
    expect(defaultProps.onBulkComplete).toHaveBeenCalledWith(['t-1', 't-2']);
  });

  it('calls onBulkArchive only for completed/cancelled tasks', () => {
    const tasks = [
      createMockTask({ id: 't-1', status: 'COMPLETED' as any }),
      createMockTask({ id: 't-2', status: 'PENDING' }),
      createMockTask({ id: 't-3', status: 'CANCELLED' as any }),
    ];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    fireEvent.click(screen.getByTestId('bulk-archive'));
    expect(defaultProps.onBulkArchive).toHaveBeenCalledWith(['t-1', 't-3']);
  });

  it('calls onBulkDelete excluding completed/cancelled/archived tasks', () => {
    const tasks = [
      createMockTask({ id: 't-1', status: 'PENDING' }),
      createMockTask({ id: 't-2', status: 'COMPLETED' as any }),
      createMockTask({ id: 't-3', status: 'IN_PROGRESS' as any }),
      createMockTask({ id: 't-4', status: 'ARCHIVED' as any }),
    ];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    fireEvent.click(screen.getByTestId('bulk-delete'));
    expect(defaultProps.onBulkDelete).toHaveBeenCalledWith(['t-1', 't-3']);
  });
});
