import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeadlineTracker } from '../DeadlineTracker';
import type { CaseTaskItem } from '../types';

const mockTasks: CaseTaskItem[] = [
  { id: 't1', title: 'Review contract', description: null, dueDate: '2026-02-20T00:00:00Z', status: 'COMPLETED', assignee: null, isOverdue: false, createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z', completedAt: '2026-02-10T00:00:00Z' },
  { id: 't2', title: 'File response', description: null, dueDate: '2026-01-15T00:00:00Z', status: 'PENDING', assignee: null, isOverdue: true, createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z', completedAt: null },
  { id: 't3', title: 'Draft motion', description: null, dueDate: '2026-03-01T00:00:00Z', status: 'PENDING', assignee: null, isOverdue: false, createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z', completedAt: null },
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
    expect(defaultProps.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'New task' }));
  });
});
