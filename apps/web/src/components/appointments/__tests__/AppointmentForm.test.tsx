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

import { AppointmentForm, addMinutesLocal } from '../AppointmentForm';
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

  // ── PG-202: firm availability is enforced by the server ──────────────────

  function fillValid(start = '2026-02-15T10:00', end = '2026-02-15T11:00') {
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Client call' } });
    fireEvent.change(screen.getByLabelText(/Start Time/), { target: { value: start } });
    fireEvent.change(screen.getByLabelText(/End Time/), { target: { value: end } });
  }

  it('submits a 06:00 start (no client-side business-hours rule)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AppointmentForm {...defaultProps} onSubmit={onSubmit} />);
    fillValid('2026-02-16T06:00', '2026-02-16T06:30');
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.queryByText(/must be between 07:00 and 19:00/)).not.toBeInTheDocument();
  });

  it('shows the server rejection in an alert and re-enables submit', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('The firm is closed on 2026-02-16.'));
    render(<AppointmentForm {...defaultProps} onSubmit={onSubmit} />);
    fillValid();
    fireEvent.click(screen.getByText('Create'));
    const alert = await screen.findByText('The firm is closed on 2026-02-16.');
    const region = alert.closest('[role="alert"]') as HTMLElement;
    expect(region).toHaveAttribute('id', 'form-submit-error');
    expect(region.className).toContain('text-red-700');
    expect(region.className).toContain('dark:text-red-300');
    expect(screen.getByText('Create')).not.toBeDisabled();
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    const onSubmit = vi.fn().mockRejectedValue('nope');
    render(<AppointmentForm {...defaultProps} onSubmit={onSubmit} />);
    fillValid();
    fireEvent.click(screen.getByText('Create'));
    expect(
      await screen.findByText('The appointment could not be saved. Please try again.')
    ).toBeInTheDocument();
  });

  it('clears the server error when a field is edited', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error('The daily booking limit for 2026-02-15 has been reached.'));
    render(<AppointmentForm {...defaultProps} onSubmit={onSubmit} />);
    fillValid();
    fireEvent.click(screen.getByText('Create'));
    await screen.findByText(/daily booking limit/);
    fireEvent.change(screen.getByLabelText(/Start Time/), {
      target: { value: '2026-02-17T10:00' },
    });
    expect(screen.queryByText(/daily booking limit/)).not.toBeInTheDocument();
  });

  it('clears the server error on the next submit attempt', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error('Appointments cannot run past midnight.'))
      .mockResolvedValueOnce(undefined);
    render(<AppointmentForm {...defaultProps} onSubmit={onSubmit} />);
    fillValid();
    fireEvent.click(screen.getByText('Create'));
    await screen.findByText(/past midnight/);
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/past midnight/)).not.toBeInTheDocument();
  });

  it('explains that firm hours use the firm timezone', () => {
    render(<AppointmentForm {...defaultProps} />);
    expect(screen.getByText(/Firm hours are checked in the firm timezone/)).toBeInTheDocument();
  });

  it('starts a new appointment from the firm default buffers', () => {
    render(<AppointmentForm {...defaultProps} defaultBuffers={{ before: 15, after: 30 }} />);
    expect(screen.getByLabelText(/Buffer Before/)).toHaveValue('15');
    expect(screen.getByLabelText(/Buffer After/)).toHaveValue('30');
  });

  it('offers a firm default that is not one of the presets', () => {
    render(<AppointmentForm {...defaultProps} defaultBuffers={{ before: 10, after: 0 }} />);
    expect(screen.getByLabelText(/Buffer Before/)).toHaveValue('10');
    expect(screen.getByRole('option', { name: '10 min' })).toBeInTheDocument();
  });

  it('keeps the buffers of an existing appointment when editing', () => {
    render(
      <AppointmentForm
        {...defaultProps}
        appointment={{ ...mockAppointmentDetail, bufferMinutesBefore: 0, bufferMinutesAfter: 0 }}
        defaultBuffers={{ before: 15, after: 30 }}
      />
    );
    expect(screen.getByLabelText(/Buffer Before/)).toHaveValue('0');
    expect(screen.getByLabelText(/Buffer After/)).toHaveValue('0');
  });
});

describe('AppointmentForm — event type picker (PG-203, AC-010)', () => {
  const eventTypes = [
    {
      id: 'clhevent00000000000',
      name: 'Initial consultation',
      durationMinutes: 45,
      colorToken: 'blue',
      description: 'A first call.',
      locationType: 'VIDEO' as const,
      locationDetails: 'https://meet.example.invalid/firm',
      appointmentType: 'CONSULTATION' as const,
    },
  ];

  beforeEach(() => vi.clearAllMocks());

  it('is offered in create mode only, and the Type field still has a unique label', () => {
    const { unmount } = render(<AppointmentForm {...defaultProps} eventTypes={eventTypes} />);
    expect(screen.getByLabelText('Event type')).toBeInTheDocument();
    expect(screen.getByLabelText(/Type/)).toHaveAttribute('id', 'appt-type');
    unmount();
    render(
      <AppointmentForm
        {...defaultProps}
        eventTypes={eventTypes}
        appointment={mockAppointmentDetail}
      />
    );
    expect(screen.queryByLabelText('Event type')).toBeNull();
  });

  it('is not shown when the firm has no active event types', () => {
    render(<AppointmentForm {...defaultProps} eventTypes={[]} />);
    expect(screen.queryByLabelText('Event type')).toBeNull();
  });

  it('sets the type, fills empty location and description and sets the end from the start', () => {
    render(<AppointmentForm {...defaultProps} eventTypes={eventTypes} />);
    fireEvent.change(screen.getByLabelText(/Start Time/), {
      target: { value: '2026-11-02T10:00' },
    });
    fireEvent.change(screen.getByLabelText('Event type'), {
      target: { value: 'clhevent00000000000' },
    });
    expect(screen.getByLabelText(/Type/)).toHaveValue('CONSULTATION');
    expect(screen.getByLabelText(/End Time/)).toHaveValue('2026-11-02T10:45');
    expect(screen.getByLabelText(/Location/)).toHaveValue('https://meet.example.invalid/firm');
    expect(screen.getByLabelText(/Description/)).toHaveValue('A first call.');
    expect(screen.getByLabelText(/Title/)).toHaveValue('');
  });

  it('never overwrites a location or description the user already typed', () => {
    render(<AppointmentForm {...defaultProps} eventTypes={eventTypes} />);
    fireEvent.change(screen.getByLabelText(/Location/), { target: { value: 'Room 4' } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Mine' } });
    fireEvent.change(screen.getByLabelText('Event type'), {
      target: { value: 'clhevent00000000000' },
    });
    expect(screen.getByLabelText(/Location/)).toHaveValue('Room 4');
    expect(screen.getByLabelText(/Description/)).toHaveValue('Mine');
  });

  it('follows later start changes, but not once the end was edited by hand', () => {
    render(<AppointmentForm {...defaultProps} eventTypes={eventTypes} />);
    fireEvent.change(screen.getByLabelText('Event type'), {
      target: { value: 'clhevent00000000000' },
    });
    expect(screen.getByLabelText(/End Time/)).toHaveValue(''); // no start yet: end untouched
    fireEvent.change(screen.getByLabelText(/Start Time/), {
      target: { value: '2026-11-02T09:00' },
    });
    expect(screen.getByLabelText(/End Time/)).toHaveValue('2026-11-02T09:45');
    fireEvent.change(screen.getByLabelText(/End Time/), { target: { value: '2026-11-02T11:00' } });
    fireEvent.change(screen.getByLabelText(/Start Time/), {
      target: { value: '2026-11-02T10:00' },
    });
    expect(screen.getByLabelText(/End Time/)).toHaveValue('2026-11-02T11:00');
  });

  it('clearing the choice keeps the values and submits without an event type', async () => {
    render(<AppointmentForm {...defaultProps} eventTypes={eventTypes} />);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Call' } });
    fireEvent.change(screen.getByLabelText(/Start Time/), {
      target: { value: '2026-11-02T10:00' },
    });
    fireEvent.change(screen.getByLabelText('Event type'), {
      target: { value: 'clhevent00000000000' },
    });
    fireEvent.change(screen.getByLabelText('Event type'), { target: { value: '' } });
    expect(screen.getByLabelText(/End Time/)).toHaveValue('2026-11-02T10:45');
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => expect(defaultProps.onSubmit).toHaveBeenCalled());
    expect(defaultProps.onSubmit.mock.calls[0][0].eventTypeId).toBeUndefined();
  });

  it('submits the chosen event type id', async () => {
    render(<AppointmentForm {...defaultProps} eventTypes={eventTypes} />);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Consult' } });
    fireEvent.change(screen.getByLabelText(/Start Time/), {
      target: { value: '2026-11-02T10:00' },
    });
    fireEvent.change(screen.getByLabelText('Event type'), {
      target: { value: 'clhevent00000000000' },
    });
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() =>
      expect(defaultProps.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventTypeId: 'clhevent00000000000',
          appointmentType: 'CONSULTATION',
        })
      )
    );
  });
});

describe('addMinutesLocal (PG-203)', () => {
  it('adds wall-clock minutes whatever the browser zone, across midnight too', () => {
    expect(addMinutesLocal('2026-07-01T10:00', 30)).toBe('2026-07-01T10:30');
    expect(addMinutesLocal('2026-07-01T23:45', 30)).toBe('2026-07-02T00:15');
  });
});
