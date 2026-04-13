import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/hooks/useCalendarVisibility', () => ({
  useCalendarVisibilityOptional: () => ({
    calendars: [],
    toggle: vi.fn(),
    isVisible: () => true,
    setOnlyVisible: vi.fn(),
    addCalendar: vi.fn(),
    removeCalendar: vi.fn(),
    dbCalendars: [],
  }),
}));

import { AppointmentForm } from '../AppointmentForm';
import { mockAppointmentDetail } from '@/test/fixtures/appointment-data';

const defaultProps = {
  onSubmit: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn(),
  isSubmitting: false,
  onConflictCheck: vi.fn(),
};

describe('AppointmentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create form with empty fields', () => {
    render(<AppointmentForm {...defaultProps} />);
    expect(screen.getByLabelText(/Title/)).toHaveValue('');
    expect(screen.getByLabelText(/Description/)).toHaveValue('');
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('renders edit form with pre-filled values', () => {
    render(<AppointmentForm {...defaultProps} appointment={mockAppointmentDetail} />);
    expect(screen.getByLabelText(/Title/)).toHaveValue('Strategy Meeting');
    expect(screen.getByText('Update')).toBeInTheDocument();
  });

  it('validates required title field', async () => {
    render(<AppointmentForm {...defaultProps} />);
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => {
      expect(screen.getByText('Title is required')).toBeInTheDocument();
    });
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it('validates required start time', async () => {
    render(<AppointmentForm {...defaultProps} />);
    const titleInput = screen.getByLabelText(/Title/);
    fireEvent.change(titleInput, { target: { value: 'Test Meeting' } });
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => {
      expect(screen.getByText('Start time is required')).toBeInTheDocument();
    });
  });

  it('validates end time must be after start time', async () => {
    render(<AppointmentForm {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText(/Start Time/), {
      target: { value: '2026-02-15T10:00' },
    });
    fireEvent.change(screen.getByLabelText(/End Time/), { target: { value: '2026-02-15T09:00' } });
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => {
      expect(screen.getByText('End time must be after start time')).toBeInTheDocument();
    });
  });

  it('submits valid form data', async () => {
    render(<AppointmentForm {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Test Meeting' } });
    fireEvent.change(screen.getByLabelText(/Start Time/), {
      target: { value: '2026-02-15T10:00' },
    });
    fireEvent.change(screen.getByLabelText(/End Time/), { target: { value: '2026-02-15T11:00' } });
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => {
      expect(defaultProps.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Meeting',
          appointmentType: 'MEETING',
        })
      );
    });
  });

  it('shows spinner when submitting', () => {
    render(<AppointmentForm {...defaultProps} isSubmitting />);
    const submitBtn = screen.getByText('Create');
    expect(submitBtn).toBeDisabled();
  });

  it('calls onCancel when cancel clicked', () => {
    render(<AppointmentForm {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('changes appointment type', () => {
    render(<AppointmentForm {...defaultProps} />);
    const typeSelect = screen.getByLabelText(/Type/);
    fireEvent.change(typeSelect, { target: { value: 'HEARING' } });
    expect(typeSelect).toHaveValue('HEARING');
  });

  it('changes buffer before/after', () => {
    render(<AppointmentForm {...defaultProps} />);
    const bufferBefore = screen.getByLabelText(/Buffer Before/);
    fireEvent.change(bufferBefore, { target: { value: '15' } });
    expect(bufferBefore).toHaveValue('15');
  });

  it('changes reminder', () => {
    render(<AppointmentForm {...defaultProps} />);
    const reminder = screen.getByLabelText(/Reminder/);
    fireEvent.change(reminder, { target: { value: '30' } });
    expect(reminder).toHaveValue('30');
  });

  it('disables all fields when submitting', () => {
    render(<AppointmentForm {...defaultProps} isSubmitting />);
    expect(screen.getByLabelText(/Title/)).toBeDisabled();
    expect(screen.getByLabelText(/Description/)).toBeDisabled();
  });

  it('shows conflict warning when conflicts exist', () => {
    const conflicts = {
      hasConflicts: true,
      conflicts: [
        {
          id: 'c1',
          title: 'Existing Meeting',
          startTime: new Date(),
          endTime: new Date(),
          appointmentType: 'MEETING',
          overlapMinutes: 30,
          conflictType: 'EXACT' as const,
        },
      ],
      canOverride: true,
    };
    render(<AppointmentForm {...defaultProps} conflicts={conflicts} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
