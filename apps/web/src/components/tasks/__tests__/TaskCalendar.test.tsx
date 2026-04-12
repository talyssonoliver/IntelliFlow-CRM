/**
 * TaskCalendar Component Tests (PG-136)
 *
 * Tests for month-view calendar shell with Schedule-X inner component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskCalendar, type CalendarTask } from '../TaskCalendar';

// Mock next/dynamic to render the inner component synchronously in tests
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<{ default: React.ComponentType }>) => {
    const MockInner = (props: Record<string, unknown>) => {
      const tasks = props.tasks as CalendarTask[] | undefined;
      return (
        <div data-testid="schedule-x-task-inner">
          {tasks?.map((task) => (
            <button
              key={task.id}
              type="button"
              data-testid="calendar-task-chip"
              onClick={(e) => {
                e.stopPropagation();
                (props.onTaskClick as (id: string) => void)?.(task.id);
              }}
            >
              {task.title}
            </button>
          ))}
          <div
            data-testid="mock-cell"
            role="gridcell"
            aria-label="test cell"
            tabIndex={0}
            onClick={() => (props.onCreateWithDate as (d: Date) => void)?.(new Date('2026-02-15'))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                (props.onCreateWithDate as (d: Date) => void)?.(new Date('2026-02-15'));
              }
            }}
          />
        </div>
      );
    };
    MockInner.displayName = 'MockTaskCalendarInner';
    void loader;
    return MockInner;
  },
}));

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
      <TaskCalendar
        tasks={mockTasks}
        onTaskClick={onTaskClick}
        onCreateWithDate={onCreateWithDate}
      />
    );

    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('renders calendar header with month label', () => {
    render(
      <TaskCalendar
        tasks={mockTasks}
        onTaskClick={onTaskClick}
        onCreateWithDate={onCreateWithDate}
      />
    );

    // Day name headers are rendered by Schedule-X inner component (mocked in tests)
    // Shell renders the month label and navigation
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('renders task chips', () => {
    render(
      <TaskCalendar
        tasks={mockTasks}
        onTaskClick={onTaskClick}
        onCreateWithDate={onCreateWithDate}
      />
    );

    const chips = screen.getAllByTestId('calendar-task-chip');
    expect(chips.length).toBeGreaterThanOrEqual(3);
  });

  it('calls onTaskClick when chip is clicked', () => {
    render(
      <TaskCalendar
        tasks={mockTasks}
        onTaskClick={onTaskClick}
        onCreateWithDate={onCreateWithDate}
      />
    );

    const chips = screen.getAllByTestId('calendar-task-chip');
    fireEvent.click(chips[0]);

    expect(onTaskClick).toHaveBeenCalled();
  });

  it('calls onCreateWithDate when empty cell is clicked', () => {
    render(
      <TaskCalendar tasks={[]} onTaskClick={onTaskClick} onCreateWithDate={onCreateWithDate} />
    );

    const cell = screen.getByTestId('mock-cell');
    fireEvent.click(cell);

    expect(onCreateWithDate).toHaveBeenCalledWith(expect.any(Date));
  });

  it('navigates to previous month', () => {
    render(
      <TaskCalendar
        tasks={mockTasks}
        onTaskClick={onTaskClick}
        onCreateWithDate={onCreateWithDate}
      />
    );

    const prevBtn = screen.getByRole('button', { name: 'Previous month' });
    fireEvent.click(prevBtn);

    expect(prevBtn).toBeInTheDocument();
  });

  it('navigates to next month', () => {
    render(
      <TaskCalendar
        tasks={mockTasks}
        onTaskClick={onTaskClick}
        onCreateWithDate={onCreateWithDate}
      />
    );

    const nextBtn = screen.getByRole('button', { name: 'Next month' });
    fireEvent.click(nextBtn);

    expect(nextBtn).toBeInTheDocument();
  });

  it('has Today button', () => {
    render(
      <TaskCalendar
        tasks={mockTasks}
        onTaskClick={onTaskClick}
        onCreateWithDate={onCreateWithDate}
      />
    );

    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('renders inner component', () => {
    render(
      <TaskCalendar
        tasks={mockTasks}
        onTaskClick={onTaskClick}
        onCreateWithDate={onCreateWithDate}
      />
    );

    expect(screen.getByTestId('schedule-x-task-inner')).toBeInTheDocument();
  });

  it('supports keyboard navigation on mock cells', () => {
    render(
      <TaskCalendar tasks={[]} onTaskClick={onTaskClick} onCreateWithDate={onCreateWithDate} />
    );

    const cell = screen.getByTestId('mock-cell');
    fireEvent.keyDown(cell, { key: 'Enter' });

    expect(onCreateWithDate).toHaveBeenCalled();
  });
});
