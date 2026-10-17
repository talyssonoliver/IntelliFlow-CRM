/**
 * @vitest-environment jsdom
 *
 * PG-202 — Availability page Save / Reset behaviour (AC-008, AC-010, AC-017,
 * AC-024). PageHeader is NOT mocked: Save/Reset are its real action buttons.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  availabilityDto,
  unconfiguredDto,
  trpcError,
  type FixtureDto,
} from './availability-fixtures';

const h = vi.hoisted(() => ({
  auth: { isLoading: false, isAuthenticated: true },
  query: {
    data: undefined as unknown,
    isLoading: false,
    error: null as null | { message: string },
  },
  refetch: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
  update: { mutateAsync: vi.fn(), isPending: false },
  reset: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  toast: h.toast,
}));
vi.mock('@/lib/auth/AuthContext', () => ({ useRequireAuth: () => h.auth }));
vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'Europe/London', timezoneLabel: 'London (GMT+1)' }),
}));
vi.mock('@/components/settings/TimezoneSelector', () => ({
  TimezoneSelector: (props: Record<string, any>) => (
    <select id={props.id} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
      <option value="Europe/London">Europe/London</option>
      <option value="America/New_York">America/New_York</option>
    </select>
  ),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ calendar: { availability: { get: { invalidate: h.invalidate } } } }),
    calendar: {
      availability: {
        get: { useQuery: () => ({ ...h.query, refetch: h.refetch }) },
        update: { useMutation: () => h.update },
        resetToDefaults: { useMutation: () => h.reset },
      },
    },
  },
}));

import AvailabilityContent from '../AvailabilityContent';

function load(dto: FixtureDto) {
  h.query = { data: dto, isLoading: false, error: null };
}

const save = () => screen.getByRole('button', { name: 'Save Changes' });

beforeEach(() => {
  vi.clearAllMocks();
  h.update = { mutateAsync: vi.fn(), isPending: false };
  h.reset = { mutateAsync: vi.fn(), isPending: false };
  load(availabilityDto());
});

describe('Save', () => {
  it('is disabled while clean and enabled once dirty, with a visible cue', () => {
    render(<AvailabilityContent />);
    expect(save()).toBeDisabled();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buffer before (minutes)'), { target: { value: '20' } });
    expect(save()).not.toBeDisabled();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('is enabled for an unconfigured tenant so the prefill can be confirmed', () => {
    load(unconfiguredDto());
    render(<AvailabilityContent />);
    expect(save()).not.toBeDisabled();
  });

  it('is disabled while a save is pending, keeping its label', () => {
    h.update = { mutateAsync: vi.fn(), isPending: true };
    render(<AvailabilityContent />);
    fireEvent.change(screen.getByLabelText('Buffer before (minutes)'), { target: { value: '20' } });
    expect(save()).toBeDisabled();
    expect(save()).toHaveTextContent('Save Changes');
  });

  it('validates on click: summary alert, focus on the first invalid field, nothing sent', async () => {
    render(<AvailabilityContent />);
    fireEvent.change(screen.getByLabelText('Tuesday range 1 end'), { target: { value: '08:00' } });
    fireEvent.change(screen.getByLabelText('Buffer after (minutes)'), { target: { value: '' } });
    fireEvent.click(save());
    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('2 problems need fixing');
    expect(summary).toHaveTextContent('Tuesday range 1 must end after it starts');
    expect(document.activeElement).toBe(screen.getByLabelText('Tuesday range 1 end'));
    expect(h.update.mutateAsync).not.toHaveBeenCalled();
    // After a failed attempt, fixing the field clears its error.
    fireEvent.change(screen.getByLabelText('Tuesday range 1 end'), { target: { value: '17:00' } });
    expect(
      screen.queryByText('Tuesday range 1 must end after it starts', { selector: 'p' })
    ).not.toBeInTheDocument();
  });

  it('summary links move focus to their field', async () => {
    render(<AvailabilityContent />);
    fireEvent.change(screen.getByLabelText('Buffer after (minutes)'), { target: { value: '' } });
    fireEvent.click(save());
    const link = await screen.findByRole('link', { name: 'Enter 0 to 240 minutes' });
    fireEvent.click(link);
    expect(document.activeElement).toBe(screen.getByLabelText('Buffer after (minutes)'));
  });

  it('sends the whole draft once, refreshes from the response, toasts and focuses Weekly hours', async () => {
    const saved = availabilityDto({ bufferBeforeMinutes: 20 });
    h.update.mutateAsync.mockResolvedValue(saved);
    render(<AvailabilityContent />);
    fireEvent.change(screen.getByLabelText('Buffer before (minutes)'), { target: { value: '20' } });
    fireEvent.click(save());
    await waitFor(() => expect(h.update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.update.mutateAsync.mock.calls[0][0]).toMatchObject({
      timezone: 'Europe/London',
      bufferBeforeMinutes: 20,
      bufferAfterMinutes: 5,
      maxDailyBookings: null,
      closures: [{ startDate: '2026-12-24', endDate: '2026-12-26', reason: 'Christmas' }],
    });
    await waitFor(() => expect(save()).toBeDisabled());
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Availability saved' }));
    expect(h.invalidate).toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 2, name: 'Weekly hours' })
    );
  });

  it('first save of an unconfigured tenant that only adds a closure keeps 07:00-19:00 every day', async () => {
    load(unconfiguredDto());
    h.update.mutateAsync.mockResolvedValue(availabilityDto());
    render(<AvailabilityContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Closure' }));
    fireEvent.change(screen.getByLabelText('Closure 1 start date'), {
      target: { value: '2026-12-25' },
    });
    fireEvent.change(screen.getByLabelText('Closure 1 end date'), {
      target: { value: '2026-12-25' },
    });
    fireEvent.click(save());
    await waitFor(() => expect(h.update.mutateAsync).toHaveBeenCalled());
    const input = h.update.mutateAsync.mock.calls[0][0];
    expect(input.days.every((d: { ranges: unknown[] }) => d.ranges.length === 1)).toBe(true);
    expect(input.days[0].ranges[0]).toEqual({ startMinute: 420, endMinute: 1140 });
  });

  it('shows a server error in an alert, focuses it and does not toast', async () => {
    h.update.mutateAsync.mockRejectedValue(
      trpcError('INTERNAL_SERVER_ERROR', 'Something went wrong')
    );
    render(<AvailabilityContent />);
    fireEvent.change(screen.getByLabelText('Buffer before (minutes)'), { target: { value: '20' } });
    fireEvent.click(save());
    const alert = await screen.findByText('Something went wrong');
    expect(alert.closest('[role="alert"]')).not.toBeNull();
    expect(document.activeElement).toBe(alert.closest('[role="alert"]'));
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('on CONFLICT shows the message with Reload, disables Save until reloaded', async () => {
    h.update.mutateAsync.mockRejectedValue(
      trpcError('CONFLICT', 'Availability was changed by someone else. Reload and try again.')
    );
    render(<AvailabilityContent />);
    fireEvent.change(screen.getByLabelText('Buffer before (minutes)'), { target: { value: '20' } });
    fireEvent.click(save());
    expect(
      await screen.findByText('Availability was changed by someone else. Reload and try again.')
    ).toBeInTheDocument();
    expect(save()).toBeDisabled();
    h.refetch.mockResolvedValue({ data: availabilityDto({ bufferBeforeMinutes: 30 }) });
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(h.refetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText('Buffer before (minutes)')).toHaveValue(30));
    expect(screen.queryByText(/changed by someone else/)).not.toBeInTheDocument();
  });

  it('reports a FORBIDDEN save with the edit-rights message', async () => {
    h.update.mutateAsync.mockRejectedValue(
      trpcError('FORBIDDEN', 'Only administrators and managers can change availability.')
    );
    render(<AvailabilityContent />);
    fireEvent.change(screen.getByLabelText('Buffer before (minutes)'), { target: { value: '20' } });
    fireEvent.click(save());
    expect(
      await screen.findByText('Only administrators and managers can change availability.')
    ).toBeInTheDocument();
  });
});

describe('Reset', () => {
  it('confirms what is reset and what is kept, then resets and announces it', async () => {
    h.reset.mutateAsync.mockResolvedValue(
      unconfiguredDto({ bufferBeforeMinutes: 10, bufferAfterMinutes: 5 })
    );
    render(<AvailabilityContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'This clears the saved working hours, closures and daily booking limit, so bookings go back to the built-in 07:00-19:00 rule. The timezone and buffer times are kept.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset Availability' }));
    await waitFor(() => expect(h.reset.mutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Availability reset. Hours show the built-in 07:00-19:00 rule until you save.'
      )
    );
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 2, name: 'Weekly hours' })
    );
  });

  it('cancel keeps the draft and calls nothing', async () => {
    render(<AvailabilityContent />);
    fireEvent.change(screen.getByLabelText('Buffer before (minutes)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(h.reset.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Buffer before (minutes)')).toHaveValue(25);
  });

  it('shows a failed reset in an alert', async () => {
    h.reset.mutateAsync.mockRejectedValue(new Error('Reset failed'));
    render(<AvailabilityContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Reset Availability' }));
    expect(await screen.findByText('Reset failed')).toBeInTheDocument();
  });
});
