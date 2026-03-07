import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppointmentCalendar } from '../AppointmentCalendar';
import { mockAppointments } from '@/test/fixtures/appointment-data';
import type { CalendarTask } from '../types';

// Mock next/dynamic to render the inner component synchronously in tests
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<{ default: React.ComponentType }>) => {
    // Return a mock component that renders testable output
    const MockInner = (props: Readonly<Record<string, unknown>>) => {
      const tasks = (props.tasks ?? []) as CalendarTask[];
      return (
        <div data-testid="schedule-x-inner" data-view={props.view as string}>
          <button
            type="button"
            data-testid="mock-event-click"
            onClick={() => (props.onAppointmentClick as (id: string) => void)?.('appt-1')}
          >
            Click Event
          </button>
          <button
            type="button"
            data-testid="mock-task-click"
            onClick={() => (props.onTaskClick as (id: string) => void)?.('task-1')}
          >
            Click Task
          </button>
          <button
            type="button"
            data-testid="mock-slot-click"
            onClick={() => {
              const start = new Date('2026-02-14T09:00:00Z');
              const end = new Date('2026-02-14T10:00:00Z');
              (props.onCreateWithSlot as (s: Date, e: Date) => void)?.(start, end);
            }}
          >
            Click Slot
          </button>
          <button
            type="button"
            data-testid="mock-date-click"
            onClick={() => {
              (props.onCreateWithDate as (d: Readonly<Date>) => void)?.(new Date('2026-02-14'));
            }}
          >
            Click Date
          </button>
          {tasks.map((t) => (
            <div key={t.id} data-testid="calendar-task-chip">
              {t.title}
            </div>
          ))}
        </div>
      );
    };
    MockInner.displayName = 'MockAppointmentCalendarInner';
    // Swallow the loader — we never call it
    void loader;
    return MockInner;
  },
}));

const mockTasks: CalendarTask[] = [
  { id: 'task-1', title: 'Follow up call', dueDate: '2026-02-14', priority: 'HIGH' },
  { id: 'task-2', title: 'Send proposal', dueDate: '2026-02-15', priority: 'MEDIUM' },
];

const defaultProps = {
  appointments: mockAppointments,
  tasks: [] as CalendarTask[],
  view: 'month' as const,
  currentDate: new Date('2026-02-14T12:00:00Z'),
  onViewChange: vi.fn(),
  onDateChange: vi.fn(),
  onAppointmentClick: vi.fn(),
  onTaskClick: vi.fn(),
  onCreateWithSlot: vi.fn(),
  onCreateWithDate: vi.fn(),
  isLoading: false,
};

describe('AppointmentCalendar', () => {
  it('renders calendar container', () => {
    render(<AppointmentCalendar {...defaultProps} />);
    expect(screen.getByTestId('appointment-calendar')).toBeInTheDocument();
  });

  it('renders loading skeleton', () => {
    render(<AppointmentCalendar {...defaultProps} isLoading />);
    expect(screen.getByTestId('calendar-skeleton')).toBeInTheDocument();
  });

  it('renders the correct view wrapper', () => {
    render(<AppointmentCalendar {...defaultProps} view="month" />);
    expect(screen.getByTestId('month-view')).toBeInTheDocument();
  });

  it('renders week view wrapper', () => {
    render(<AppointmentCalendar {...defaultProps} view="week" />);
    expect(screen.getByTestId('week-view')).toBeInTheDocument();
  });

  it('renders day view wrapper', () => {
    render(<AppointmentCalendar {...defaultProps} view="day" />);
    expect(screen.getByTestId('day-view')).toBeInTheDocument();
  });

  it('renders navigation buttons', () => {
    render(<AppointmentCalendar {...defaultProps} />);
    expect(screen.getByLabelText('Previous')).toBeInTheDocument();
    expect(screen.getByLabelText('Next')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('renders view switcher buttons', () => {
    render(<AppointmentCalendar {...defaultProps} />);
    const viewGroup = screen.getByRole('group', { name: /Calendar view/ });
    expect(viewGroup).toBeInTheDocument();
    expect(screen.getByText('month')).toBeInTheDocument();
    expect(screen.getByText('week')).toBeInTheDocument();
    expect(screen.getByText('day')).toBeInTheDocument();
  });

  it('calls onViewChange when view button clicked', () => {
    render(<AppointmentCalendar {...defaultProps} />);
    fireEvent.click(screen.getByText('week'));
    expect(defaultProps.onViewChange).toHaveBeenCalledWith('week');
  });

  it('calls onDateChange when Today clicked', () => {
    render(<AppointmentCalendar {...defaultProps} />);
    fireEvent.click(screen.getByText('Today'));
    expect(defaultProps.onDateChange).toHaveBeenCalled();
  });

  it('navigates to previous period', () => {
    render(<AppointmentCalendar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/previous/i));
    expect(defaultProps.onDateChange).toHaveBeenCalled();
  });

  it('navigates to next period', () => {
    render(<AppointmentCalendar {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/next/i));
    expect(defaultProps.onDateChange).toHaveBeenCalled();
  });

  it('displays current month/year in header', () => {
    render(<AppointmentCalendar {...defaultProps} />);
    expect(screen.getByText(/February 2026/)).toBeInTheDocument();
  });

  it('passes correct view prop to inner component', () => {
    render(<AppointmentCalendar {...defaultProps} view="week" />);
    const inner = screen.getByTestId('schedule-x-inner');
    expect(inner).toHaveAttribute('data-view', 'week');
  });

  it('calls onAppointmentClick through inner component', () => {
    render(<AppointmentCalendar {...defaultProps} />);
    fireEvent.click(screen.getByTestId('mock-event-click'));
    expect(defaultProps.onAppointmentClick).toHaveBeenCalledWith('appt-1');
  });

  it('calls onCreateWithSlot through inner component', () => {
    render(<AppointmentCalendar {...defaultProps} />);
    fireEvent.click(screen.getByTestId('mock-slot-click'));
    expect(defaultProps.onCreateWithSlot).toHaveBeenCalledWith(expect.any(Date), expect.any(Date));
  });

  it('shows empty state when no appointments or tasks', () => {
    render(<AppointmentCalendar {...defaultProps} appointments={[]} tasks={[]} />);
    expect(screen.getByTestId('calendar-empty')).toBeInTheDocument();
    expect(screen.getByText('No events this period')).toBeInTheDocument();
  });

  it('does not show empty state when tasks exist but no appointments', () => {
    render(<AppointmentCalendar {...defaultProps} appointments={[]} tasks={mockTasks} />);
    expect(screen.queryByTestId('calendar-empty')).not.toBeInTheDocument();
  });

  it('renders task chips when tasks are provided', () => {
    render(<AppointmentCalendar {...defaultProps} tasks={mockTasks} />);
    const chips = screen.getAllByTestId('calendar-task-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveTextContent('Follow up call');
    expect(chips[1]).toHaveTextContent('Send proposal');
  });

  it('calls onTaskClick when task is clicked', () => {
    render(<AppointmentCalendar {...defaultProps} tasks={mockTasks} />);
    fireEvent.click(screen.getByTestId('mock-task-click'));
    expect(defaultProps.onTaskClick).toHaveBeenCalledWith('task-1');
  });

  it('calls onCreateWithDate when date cell is clicked', () => {
    render(<AppointmentCalendar {...defaultProps} />);
    fireEvent.click(screen.getByTestId('mock-date-click'));
    expect(defaultProps.onCreateWithDate).toHaveBeenCalledWith(expect.any(Date));
  });
});
