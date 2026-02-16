/**
 * TaskList Component Tests (PG-136)
 *
 * Tests for task data table with columns, row actions, and bulk actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskList, type TaskListItem } from '../TaskList';

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  DataTable: ({ columns, data, onRowClick, enableRowSelection, bulkActions, ...props }: any) => (
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
            <tr key={row.id} data-testid={`task-row-${row.id}`} onClick={() => onRowClick?.(row)}>
              {columns.map((col: any, i: number) => (
                <td key={i}>
                  {col.cell ? col.cell({ row: { original: row } }) : row[col.accessorKey]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {bulkActions && <div data-testid="bulk-actions">{bulkActions.length} actions</div>}
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

    expect(screen.getByText('John Doe')).toBeInTheDocument();
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
    expect(screen.getByText('3 actions')).toBeInTheDocument();
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
});
