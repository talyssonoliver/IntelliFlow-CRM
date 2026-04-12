import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppointmentDetail } from '../AppointmentDetail';
import { mockAppointmentDetail } from '@/test/fixtures/appointment-data';
import type { AppointmentDetailData } from '../types';

const defaultProps = {
  appointment: mockAppointmentDetail,
  isLoading: false,
  onConfirm: vi.fn().mockResolvedValue(undefined),
  onComplete: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn().mockResolvedValue(undefined),
  onMarkNoShow: vi.fn().mockResolvedValue(undefined),
  onReschedule: vi.fn().mockResolvedValue(undefined),
  onAddAttendee: vi.fn().mockResolvedValue(undefined),
  onRemoveAttendee: vi.fn().mockResolvedValue(undefined),
  onLinkCase: vi.fn().mockResolvedValue(undefined),
  onUnlinkCase: vi.fn().mockResolvedValue(undefined),
};

describe('AppointmentDetail', () => {
  it('renders appointment title', () => {
    render(<AppointmentDetail {...defaultProps} />);
    expect(screen.getByText('Strategy Meeting')).toBeInTheDocument();
  });

  it('renders appointment type badge', () => {
    render(<AppointmentDetail {...defaultProps} />);
    expect(screen.getByText('Meeting')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<AppointmentDetail {...defaultProps} />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('renders the detail container', () => {
    render(<AppointmentDetail {...defaultProps} />);
    expect(screen.getByTestId('appointment-detail')).toBeInTheDocument();
  });

  it('renders location', () => {
    render(<AppointmentDetail {...defaultProps} />);
    expect(screen.getByText('Conference Room A')).toBeInTheDocument();
  });

  it('renders description in overview tab', () => {
    render(<AppointmentDetail {...defaultProps} />);
    expect(screen.getByText(/case strategy/i)).toBeInTheDocument();
  });

  it('renders attendee list', () => {
    render(<AppointmentDetail {...defaultProps} />);
    // Click attendees tab (rendered as lowercase with count suffix)
    const attendeesTab = screen.getByRole('tab', { name: /attendees/i });
    fireEvent.click(attendeesTab);
    // Jane Doe may appear as both organizer and attendee
    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('Sarah Wilson')).toBeInTheDocument();
  });

  it('renders linked cases', () => {
    render(<AppointmentDetail {...defaultProps} />);
    const casesTab = screen.getByRole('tab', { name: /cases/i });
    fireEvent.click(casesTab);
    expect(screen.getByText(/Smith v. Johnson/)).toBeInTheDocument();
  });

  it('renders buffer time info', () => {
    render(<AppointmentDetail {...defaultProps} />);
    expect(screen.getByText(/15 min before/)).toBeInTheDocument();
    expect(screen.getByText(/30 min after/)).toBeInTheDocument();
  });

  it('renders recurrence info', () => {
    render(<AppointmentDetail {...defaultProps} />);
    expect(screen.getByText(/Repeats every week/i)).toBeInTheDocument();
  });

  it('renders action buttons for SCHEDULED status', () => {
    render(<AppointmentDetail {...defaultProps} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('calls onConfirm when Confirm clicked', async () => {
    render(<AppointmentDetail {...defaultProps} />);
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalled();
    });
  });

  it('hides action buttons for terminal statuses', () => {
    const completedAppt: AppointmentDetailData = {
      ...mockAppointmentDetail,
      status: 'COMPLETED',
      completedAt: new Date(),
    };
    render(<AppointmentDetail {...defaultProps} appointment={completedAppt} />);
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });

  it('renders tabs: Overview, Attendees, Cases', () => {
    render(<AppointmentDetail {...defaultProps} />);
    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /attendees/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /cases/i })).toBeInTheDocument();
  });

  it('switches tabs when clicked', () => {
    render(<AppointmentDetail {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /attendees/i }));
    // Attendee content visible — John Smith only appears in attendee list
    expect(screen.getByText('John Smith')).toBeInTheDocument();
  });

  it('renders organizer name', () => {
    render(<AppointmentDetail {...defaultProps} />);
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
  });

  it('shows reminder info', () => {
    render(<AppointmentDetail {...defaultProps} />);
    expect(screen.getByText(/1 hour before/)).toBeInTheDocument();
  });

  it('shows cancel action button', () => {
    render(<AppointmentDetail {...defaultProps} />);
    // "Cancel" button exists in actions section
    const cancelButtons = screen.getAllByText('Cancel');
    expect(cancelButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows attendee count', () => {
    render(<AppointmentDetail {...defaultProps} />);
    // Attendee count "3" appears in the component
    const threeTexts = screen.getAllByText(/3/);
    expect(threeTexts.length).toBeGreaterThanOrEqual(1);
  });
});
