/**
 * TaskDetail Component Tests (PG-136)
 *
 * Tests for full task detail view with actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskDetail, type TaskDetailData } from '../TaskDetail';

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
  ConfirmationDialog: ({ open, onOpenChange, onConfirm, title, confirmLabel }: any) =>
    open ? (
      <div
        data-testid={`confirm-dialog-${title?.toLowerCase().includes('archive') ? 'archive' : 'delete'}`}
      >
        <span>{title}</span>
        <button
          onClick={onConfirm}
          data-testid={`confirm-btn-${title?.toLowerCase().includes('archive') ? 'archive' : 'delete'}`}
        >
          {confirmLabel || 'Confirm'}
        </button>
        <button
          onClick={() => onOpenChange(false)}
          data-testid={`cancel-btn-${title?.toLowerCase().includes('archive') ? 'archive' : 'delete'}`}
        >
          Dismiss
        </button>
      </div>
    ) : null,
  toast: vi.fn(),
}));

const mockTask: TaskDetailData = {
  id: 'task-1',
  title: 'Review proposal',
  description: 'Review the Q1 proposal document',
  dueDate: '2026-03-15T00:00:00.000Z',
  priority: 'HIGH',
  status: 'IN_PROGRESS',
  ownerId: 'user-1',
  owner: { id: 'user-1', email: 'alice@test.com', name: 'Alice Johnson' },
  lead: { id: 'lead-1', firstName: 'Bob', lastName: 'Williams' },
  contact: null,
  opportunity: null,
  createdAt: '2026-02-01T10:00:00.000Z',
  updatedAt: '2026-02-10T14:00:00.000Z',
  completedAt: null,
};

describe('TaskDetail', () => {
  const onComplete = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onArchive = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton', () => {
    render(
      <TaskDetail
        task={null}
        isLoading={true}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    expect(screen.getByTestId('task-detail-skeleton')).toBeInTheDocument();
  });

  it('renders not-found state', () => {
    render(
      <TaskDetail
        task={null}
        isLoading={false}
        isNotFound={true}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    expect(screen.getByTestId('task-not-found')).toBeInTheDocument();
    expect(screen.getByText('Task not found')).toBeInTheDocument();
  });

  it('renders task title', () => {
    render(
      <TaskDetail
        task={mockTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    expect(screen.getByText('Review proposal')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(
      <TaskDetail
        task={mockTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
  });

  it('renders priority badge', () => {
    render(
      <TaskDetail
        task={mockTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('renders owner name', () => {
    render(
      <TaskDetail
        task={mockTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(
      <TaskDetail
        task={mockTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    expect(screen.getByText('Review the Q1 proposal document')).toBeInTheDocument();
  });

  it('renders linked entity', () => {
    render(
      <TaskDetail
        task={mockTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    expect(screen.getByText('Bob Williams')).toBeInTheDocument();
  });

  it('calls onComplete when complete button clicked', () => {
    render(
      <TaskDetail
        task={mockTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Complete task' }));
    expect(onComplete).toHaveBeenCalledWith('task-1');
  });

  it('hides complete button and shows archive for completed tasks', () => {
    const completedTask = { ...mockTask, status: 'COMPLETED' as const };
    render(
      <TaskDetail
        task={completedTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    expect(screen.queryByRole('button', { name: 'Complete task' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive task' })).toBeInTheDocument();
  });

  it('calls onEdit when edit button clicked', () => {
    render(
      <TaskDetail
        task={mockTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }));
    expect(onEdit).toHaveBeenCalledWith(mockTask);
  });

  it('shows confirmation dialog on delete', () => {
    render(
      <TaskDetail
        task={mockTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    expect(screen.getByTestId('confirm-dialog-delete')).toBeInTheDocument();
  });

  it('calls onDelete after confirmation', () => {
    render(
      <TaskDetail
        task={mockTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    fireEvent.click(screen.getByTestId('confirm-btn-delete'));
    expect(onDelete).toHaveBeenCalledWith('task-1');
  });

  it('hides description section when null', () => {
    const noDescTask = { ...mockTask, description: null };
    render(
      <TaskDetail
        task={noDescTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    expect(screen.queryByText('Description')).not.toBeInTheDocument();
  });

  it('hides entity link when no entity', () => {
    const noEntityTask = { ...mockTask, lead: null };
    render(
      <TaskDetail
        task={noEntityTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    expect(screen.queryByText('Bob Williams')).not.toBeInTheDocument();
  });

  it('shows archive confirmation dialog for completed tasks', () => {
    const completedTask = { ...mockTask, status: 'COMPLETED' as const };
    render(
      <TaskDetail
        task={completedTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archive task' }));
    expect(screen.getByTestId('confirm-dialog-archive')).toBeInTheDocument();
    expect(screen.getByText('Archive Task')).toBeInTheDocument();
  });

  it('calls onArchive after archive confirmation', () => {
    const completedTask = { ...mockTask, status: 'COMPLETED' as const };
    render(
      <TaskDetail
        task={completedTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archive task' }));
    fireEvent.click(screen.getByTestId('confirm-btn-archive'));
    expect(onArchive).toHaveBeenCalledWith('task-1');
  });

  it('closes delete dialog via onOpenChange', () => {
    render(
      <TaskDetail
        task={mockTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    expect(screen.getByTestId('confirm-dialog-delete')).toBeInTheDocument();

    // Click cancel to close via onOpenChange(false)
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByTestId('confirm-dialog-delete')).not.toBeInTheDocument();
  });

  it('closes archive dialog via onOpenChange', () => {
    const completedTask = { ...mockTask, status: 'COMPLETED' as const };
    render(
      <TaskDetail
        task={completedTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archive task' }));
    expect(screen.getByTestId('confirm-dialog-archive')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByTestId('confirm-dialog-archive')).not.toBeInTheDocument();
  });

  it('shows archive button for CANCELLED tasks', () => {
    const cancelledTask = { ...mockTask, status: 'CANCELLED' as const };
    render(
      <TaskDetail
        task={cancelledTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
      />
    );

    expect(screen.getByRole('button', { name: 'Archive task' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete task' })).not.toBeInTheDocument();
  });
});
