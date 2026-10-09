// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const hook = vi.hoisted(() => ({
  toast: vi.fn(),
  toggle: vi.fn(),
  addCalendar: vi.fn(),
  removeCalendar: vi.fn(),
}));

vi.mock('@/hooks/useCalendarVisibility', () => ({
  CALENDAR_COLOR_OPTIONS: ['#111111', '#222222'],
  useCalendarVisibility: () => ({
    calendars: [
      { id: 'personal', label: 'Personal', color: '#3b82f6', checked: true, isDefault: true },
      { id: 'custom-1', label: 'Side Project', color: '#ef4444', checked: false, isDefault: false },
    ],
    toggle: hook.toggle,
    addCalendar: hook.addCalendar,
    removeCalendar: hook.removeCalendar,
  }),
}));

// Render the popover inline so the add form is reachable without Radix portals.
vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  toast: hook.toast,
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}));

import { CalendarTogglesSection } from '../CalendarTogglesSection';

describe('CalendarTogglesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hook.addCalendar.mockResolvedValue(undefined);
    hook.removeCalendar.mockResolvedValue(undefined);
  });

  it('adds a calendar with the trimmed name and chosen colour', () => {
    render(<CalendarTogglesSection isExpanded />);

    fireEvent.change(screen.getByPlaceholderText('Calendar name'), {
      target: { value: '  Holidays  ' },
    });
    fireEvent.click(screen.getByLabelText('Select color #222222'));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(hook.addCalendar).toHaveBeenCalledWith('Holidays', '#222222');
  });

  it('clears the form once the calendar has been added', async () => {
    render(<CalendarTogglesSection isExpanded />);

    const input = screen.getByPlaceholderText('Calendar name');
    fireEvent.change(input, { target: { value: 'Holidays' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(input).toHaveValue(''));
    expect(hook.toast).not.toHaveBeenCalled();
  });

  it('keeps the typed name and shows a destructive toast when adding fails', async () => {
    hook.addCalendar.mockRejectedValue(new Error('quota reached'));
    render(<CalendarTogglesSection isExpanded />);

    const input = screen.getByPlaceholderText('Calendar name');
    fireEvent.change(input, { target: { value: 'Holidays' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(hook.toast).toHaveBeenCalledWith({
        title: 'Could not add calendar',
        description: 'quota reached',
        variant: 'destructive',
      })
    );
    expect(input).toHaveValue('Holidays');
  });

  it('uses a generic toast message when adding rejects with a non-Error', async () => {
    hook.addCalendar.mockRejectedValue('boom');
    render(<CalendarTogglesSection isExpanded />);

    fireEvent.change(screen.getByPlaceholderText('Calendar name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(hook.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Please try again.' })
      )
    );
  });

  it('does not add a calendar when the name is blank', () => {
    render(<CalendarTogglesSection isExpanded />);

    fireEvent.change(screen.getByPlaceholderText('Calendar name'), { target: { value: '   ' } });
    fireEvent.keyDown(screen.getByPlaceholderText('Calendar name'), { key: 'Enter' });

    expect(hook.addCalendar).not.toHaveBeenCalled();
  });

  it('removes only custom calendars', () => {
    render(<CalendarTogglesSection isExpanded />);

    expect(screen.queryByLabelText('Remove Personal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Remove Side Project'));

    expect(hook.removeCalendar).toHaveBeenCalledWith('custom-1');
  });

  it('shows a destructive toast when removing a calendar fails', async () => {
    hook.removeCalendar.mockRejectedValue(new Error('locked'));
    render(<CalendarTogglesSection isExpanded />);

    fireEvent.click(screen.getByLabelText('Remove Side Project'));

    await waitFor(() =>
      expect(hook.toast).toHaveBeenCalledWith({
        title: 'Could not remove Side Project',
        description: 'locked',
        variant: 'destructive',
      })
    );
  });

  it('uses a generic toast message when removing rejects with a non-Error', async () => {
    hook.removeCalendar.mockRejectedValue('boom');
    render(<CalendarTogglesSection isExpanded />);

    fireEvent.click(screen.getByLabelText('Remove Side Project'));

    await waitFor(() =>
      expect(hook.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Please try again.' })
      )
    );
  });

  it('toggles a calendar', () => {
    render(<CalendarTogglesSection isExpanded />);
    fireEvent.click(screen.getByRole('button', { name: 'Personal' }));
    expect(hook.toggle).toHaveBeenCalledWith('personal');
  });
});
