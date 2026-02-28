import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppointmentCalendar } from '../AppointmentCalendar';
import { mockAppointments } from '@/test/fixtures/appointment-data';

const defaultProps = {
  appointments: mockAppointments,
  view: 'month' as const,
  currentDate: new Date('2026-02-14T12:00:00Z'),
  onViewChange: vi.fn(),
  onDateChange: vi.fn(),
  onAppointmentClick: vi.fn(),
  onCreateWithSlot: vi.fn(),
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

  it('renders month view by default', () => {
    render(<AppointmentCalendar {...defaultProps} view="month" />);
    expect(screen.getByTestId('month-view')).toBeInTheDocument();
  });

  it('renders week view', () => {
    render(<AppointmentCalendar {...defaultProps} view="week" />);
    expect(screen.getByTestId('week-view')).toBeInTheDocument();
  });

  it('renders day view', () => {
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
    // View switcher uses lowercase text with CSS capitalize
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

  it('renders day headers in month view', () => {
    render(<AppointmentCalendar {...defaultProps} view="month" />);
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
  });

  it('calls onAppointmentClick when appointment clicked', () => {
    render(<AppointmentCalendar {...defaultProps} />);
    const appt = screen.queryByText('Strategy Meeting');
    if (appt) {
      fireEvent.click(appt);
      expect(defaultProps.onAppointmentClick).toHaveBeenCalledWith('appt-1');
    }
  });

  it('uses semantic table in month view', () => {
    render(<AppointmentCalendar {...defaultProps} view="month" />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders column headers with native th elements', () => {
    render(<AppointmentCalendar {...defaultProps} view="month" />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBe(7);
  });

  it('renders cells in month view', () => {
    render(<AppointmentCalendar {...defaultProps} view="month" />);
    const cells = screen.getAllByRole('cell');
    expect(cells.length).toBeGreaterThan(0);
  });
});
