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
  ConfirmationDialog: ({ open, onConfirm, title }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm Delete</button>
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
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Complete task' }));
    expect(onComplete).toHaveBeenCalledWith('task-1');
  });

  it('disables complete button for completed tasks', () => {
    const completedTask = { ...mockTask, status: 'COMPLETED' as const };
    render(
      <TaskDetail
        task={completedTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    expect(screen.getByRole('button', { name: 'Complete task' })).toBeDisabled();
  });

  it('calls onEdit when edit button clicked', () => {
    render(
      <TaskDetail
        task={mockTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
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
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
  });

  it('calls onDelete after confirmation', () => {
    render(
      <TaskDetail
        task={mockTask}
        isLoading={false}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    fireEvent.click(screen.getByText('Confirm Delete'));
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
      />
    );

    expect(screen.queryByText('Bob Williams')).not.toBeInTheDocument();
  });
});
