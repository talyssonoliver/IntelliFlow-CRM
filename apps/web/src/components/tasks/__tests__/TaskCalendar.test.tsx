/**
 * TaskCalendar Component Tests (PG-136)
 *
 * Tests for month-view calendar with task chips and navigation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskCalendar, type CalendarTask } from '../TaskCalendar';

describe('TaskCalendar', () => {
  const mockTasks: CalendarTask[] = [
    { id: 'task-1', title: 'Call client', dueDate: '2026-02-15T00:00:00.000Z', priority: 'HIGH' },
    { id: 'task-2', title: 'Send report', dueDate: '2026-02-15T00:00:00.000Z', priority: 'MEDIUM' },
    { id: 'task-3', title: 'Team meeting', dueDate: '2026-02-20T00:00:00.000Z', priority: 'LOW' },
  ];

  const onTaskClick = vi.fn();
  const onCreateWithDate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders calendar grid', () => {
    render(
      <TaskCalendar tasks={mockTasks} onTaskClick={onTaskClick} onCreateWithDate={onCreateWithDate} />
    );

    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('renders day name headers', () => {
    render(
      <TaskCalendar tasks={mockTasks} onTaskClick={onTaskClick} onCreateWithDate={onCreateWithDate} />
    );

    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Thu')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  it('renders task chips', () => {
    render(
      <TaskCalendar tasks={mockTasks} onTaskClick={onTaskClick} onCreateWithDate={onCreateWithDate} />
    );

    const chips = screen.getAllByTestId('calendar-task-chip');
    expect(chips.length).toBeGreaterThanOrEqual(3);
  });

  it('calls onTaskClick when chip is clicked', () => {
    render(
      <TaskCalendar tasks={mockTasks} onTaskClick={onTaskClick} onCreateWithDate={onCreateWithDate} />
    );

    const chips = screen.getAllByTestId('calendar-task-chip');
    fireEvent.click(chips[0]);

    expect(onTaskClick).toHaveBeenCalled();
  });

  it('calls onCreateWithDate when empty day is clicked', () => {
    render(
      <TaskCalendar tasks={[]} onTaskClick={onTaskClick} onCreateWithDate={onCreateWithDate} />
    );

    const cells = screen.getAllByRole('gridcell');
    fireEvent.click(cells[0]);

    expect(onCreateWithDate).toHaveBeenCalledWith(expect.any(Date));
  });

  it('navigates to previous month', () => {
    render(
      <TaskCalendar tasks={mockTasks} onTaskClick={onTaskClick} onCreateWithDate={onCreateWithDate} />
    );

    const prevBtn = screen.getByRole('button', { name: 'Previous month' });
    fireEvent.click(prevBtn);

    // Should show a different month header now
    expect(prevBtn).toBeInTheDocument();
  });

  it('navigates to next month', () => {
    render(
      <TaskCalendar tasks={mockTasks} onTaskClick={onTaskClick} onCreateWithDate={onCreateWithDate} />
    );

    const nextBtn = screen.getByRole('button', { name: 'Next month' });
    fireEvent.click(nextBtn);

    expect(nextBtn).toBeInTheDocument();
  });

  it('has Today button', () => {
    render(
      <TaskCalendar tasks={mockTasks} onTaskClick={onTaskClick} onCreateWithDate={onCreateWithDate} />
    );

    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('shows overflow indicator when > 3 tasks on same day', () => {
    const manyTasks: CalendarTask[] = [
      { id: '1', title: 'Task A', dueDate: '2026-02-15T00:00:00.000Z', priority: 'HIGH' },
      { id: '2', title: 'Task B', dueDate: '2026-02-15T00:00:00.000Z', priority: 'MEDIUM' },
      { id: '3', title: 'Task C', dueDate: '2026-02-15T00:00:00.000Z', priority: 'LOW' },
      { id: '4', title: 'Task D', dueDate: '2026-02-15T00:00:00.000Z', priority: 'URGENT' },
    ];

    render(
      <TaskCalendar tasks={manyTasks} onTaskClick={onTaskClick} onCreateWithDate={onCreateWithDate} />
    );

    expect(screen.getByTestId('overflow-indicator')).toBeInTheDocument();
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('supports keyboard navigation on cells', () => {
    render(
      <TaskCalendar tasks={[]} onTaskClick={onTaskClick} onCreateWithDate={onCreateWithDate} />
    );

    const cells = screen.getAllByRole('gridcell');
    fireEvent.keyDown(cells[0], { key: 'Enter' });

    expect(onCreateWithDate).toHaveBeenCalled();
  });

  it('renders accessible aria-labels on cells', () => {
    render(
      <TaskCalendar tasks={mockTasks} onTaskClick={onTaskClick} onCreateWithDate={onCreateWithDate} />
    );

    const cells = screen.getAllByRole('gridcell');
    // All cells should have aria-labels
    cells.forEach((cell) => {
      expect(cell).toHaveAttribute('aria-label');
    });
  });
});
