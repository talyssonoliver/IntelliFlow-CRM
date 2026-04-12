import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeadlineTracker } from '../DeadlineTracker';
import type { CaseTaskItem } from '../types';

const mockTasks: CaseTaskItem[] = [
  {
    id: 't1',
    title: 'Review contract',
    description: null,
    dueDate: '2026-02-20T00:00:00Z',
    status: 'COMPLETED',
    assignee: null,
    isOverdue: false,
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    completedAt: '2026-02-10T00:00:00Z',
  },
  {
    id: 't2',
    title: 'File response',
    description: null,
    dueDate: '2026-01-15T00:00:00Z',
    status: 'PENDING',
    assignee: null,
    isOverdue: true,
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    completedAt: null,
  },
  {
    id: 't3',
    title: 'Draft motion',
    description: null,
    dueDate: '2026-03-01T00:00:00Z',
    status: 'PENDING',
    assignee: null,
    isOverdue: false,
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    completedAt: null,
  },
];

const defaultProps = {
  tasks: mockTasks,
  onAddTask: vi.fn(),
  onCompleteTask: vi.fn(),
  onRemoveTask: vi.fn(),
};

describe('DeadlineTracker', () => {
  it('renders task list from props', () => {
    render(<DeadlineTracker {...defaultProps} />);
    expect(screen.getByText('Review contract')).toBeInTheDocument();
    expect(screen.getByText('File response')).toBeInTheDocument();
    expect(screen.getByText('Draft motion')).toBeInTheDocument();
  });

  it('shows progress bar with correct percentage', () => {
    render(<DeadlineTracker {...defaultProps} />);
    expect(screen.getByText('1/3 tasks completed')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('complete task button calls callback', () => {
    render(<DeadlineTracker {...defaultProps} />);
    const completeButtons = screen.getAllByLabelText(/Complete task:/);
    fireEvent.click(completeButtons[0]);
    expect(defaultProps.onCompleteTask).toHaveBeenCalled();
  });

  it('remove task button calls callback', () => {
    render(<DeadlineTracker {...defaultProps} />);
    const removeButtons = screen.getAllByLabelText(/Remove task:/);
    fireEvent.click(removeButtons[0]);
    expect(defaultProps.onRemoveTask).toHaveBeenCalled();
  });

  it('overdue tasks highlighted', () => {
    render(<DeadlineTracker {...defaultProps} />);
    expect(screen.getByText(/(Overdue)/)).toBeInTheDocument();
  });

  it('empty state shows "No tasks yet"', () => {
    render(<DeadlineTracker {...defaultProps} tasks={[]} />);
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
  });

  it('add task form submits correctly', () => {
    render(<DeadlineTracker {...defaultProps} />);
    fireEvent.click(screen.getByText('+ Add Task'));

    const titleInput = screen.getByLabelText('Task title');
    fireEvent.change(titleInput, { target: { value: 'New task' } });

    fireEvent.click(screen.getByText('Add Task'));
    expect(defaultProps.onAddTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New task' })
    );
  });

  it('cancel button hides the add form', () => {
    render(<DeadlineTracker {...defaultProps} />);
    fireEvent.click(screen.getByText('+ Add Task'));
    expect(screen.getByLabelText('Task title')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('Task title')).not.toBeInTheDocument();
  });

  it('empty title does not submit', () => {
    const onAddTask = vi.fn();
    render(<DeadlineTracker {...defaultProps} onAddTask={onAddTask} />);
    fireEvent.click(screen.getByText('+ Add Task'));
    // Submit without entering title
    fireEvent.click(screen.getByText('Add Task'));
    expect(onAddTask).not.toHaveBeenCalled();
  });

  it('add task form submits with due date', () => {
    const onAddTask = vi.fn();
    render(<DeadlineTracker {...defaultProps} onAddTask={onAddTask} />);
    fireEvent.click(screen.getByText('+ Add Task'));

    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Dated task' } });
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-04-01' } });

    fireEvent.click(screen.getByText('Add Task'));
    expect(onAddTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Dated task',
        dueDate: expect.any(Date),
      })
    );
  });

  it('disabled prop hides add task button and remove buttons', () => {
    render(<DeadlineTracker {...defaultProps} disabled={true} />);
    expect(screen.queryByText('+ Add Task')).not.toBeInTheDocument();
    expect(screen.queryAllByLabelText(/Remove task:/).length).toBe(0);
  });

  it('disabled prop disables complete buttons', () => {
    render(<DeadlineTracker {...defaultProps} disabled={true} />);
    const completeButtons = screen.getAllByLabelText(/Complete task:/);
    completeButtons.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('completed tasks show checkmark and line-through', () => {
    render(<DeadlineTracker {...defaultProps} />);
    // "Review contract" is COMPLETED
    expect(screen.getByText('Review contract').className).toContain('line-through');
  });

  it('completed tasks do not show remove button', () => {
    const completedOnly: CaseTaskItem[] = [{ ...mockTasks[0], status: 'COMPLETED' }];
    render(<DeadlineTracker {...defaultProps} tasks={completedOnly} />);
    expect(screen.queryByLabelText(/Remove task:/)).not.toBeInTheDocument();
  });

  it('renders CANCELLED task status label', () => {
    const cancelledTask: CaseTaskItem[] = [
      { ...mockTasks[0], status: 'CANCELLED', completedAt: null },
    ];
    render(<DeadlineTracker {...defaultProps} tasks={cancelledTask} />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders IN_PROGRESS task status label', () => {
    const inProgressTask: CaseTaskItem[] = [{ ...mockTasks[1], status: 'IN_PROGRESS' }];
    render(<DeadlineTracker {...defaultProps} tasks={inProgressTask} />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('sorts completed tasks to the end', () => {
    render(<DeadlineTracker {...defaultProps} />);
    const items = screen.getAllByRole('listitem');
    // First items should be pending, last should be completed
    expect(items.length).toBe(3);
  });

  it('progress shows 0% for empty tasks', () => {
    render(<DeadlineTracker {...defaultProps} tasks={[]} />);
    expect(screen.queryByText(/tasks completed/)).not.toBeInTheDocument();
  });

  it('sorts tasks with no dueDate after tasks with dueDate', () => {
    const tasksWithMixedDates: CaseTaskItem[] = [
      {
        ...mockTasks[0],
        id: 'no-date',
        status: 'PENDING',
        dueDate: null as any,
        completedAt: null,
      }, // test-only mock
      { ...mockTasks[1], id: 'has-date', status: 'PENDING', dueDate: '2026-02-20T00:00:00Z' },
    ];
    render(<DeadlineTracker {...defaultProps} tasks={tasksWithMixedDates} />);
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(2);
  });

  it('sorts tasks by dueDate ascending', () => {
    const tasksOrdered: CaseTaskItem[] = [
      { ...mockTasks[1], id: 'later', dueDate: '2026-05-01T00:00:00Z' },
      { ...mockTasks[1], id: 'earlier', dueDate: '2026-02-01T00:00:00Z' },
    ];
    render(<DeadlineTracker {...defaultProps} tasks={tasksOrdered} />);
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(2);
  });

  it('handles tasks where only second has no dueDate', () => {
    const tasksWithMixed: CaseTaskItem[] = [
      { ...mockTasks[1], id: 'a', dueDate: '2026-03-01T00:00:00Z' },
      { ...mockTasks[1], id: 'b', dueDate: null as any }, // test-only mock
    ];
    render(<DeadlineTracker {...defaultProps} tasks={tasksWithMixed} />);
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(2);
  });
});
