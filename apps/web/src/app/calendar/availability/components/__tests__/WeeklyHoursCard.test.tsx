/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import axe from 'axe-core';
import { WeeklyHoursCard } from '../WeeklyHoursCard';
import { toDraft, rangeFieldId, type DraftDay } from '../../availability-draft';

const h = (hour: number, minute = 0) => hour * 60 + minute;

function baseDays(): DraftDay[] {
  return toDraft({
    isConfigured: true,
    timezone: 'Europe/London',
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      ranges: weekday >= 1 && weekday <= 5 ? [{ startMinute: h(9), endMinute: h(17) }] : [],
    })),
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    maxDailyBookings: null,
    closures: [],
    canEdit: true,
  } as never).days;
}

/** Stateful harness so add/remove/focus behave as in the page. */
function Harness(props: {
  initial?: DraftDay[];
  errors?: Record<string, string>;
  readOnly?: boolean;
}) {
  const [days, setDays] = React.useState(props.initial ?? baseDays());
  const [announcement, setAnnouncement] = React.useState('');
  return (
    <>
      <output aria-live="polite">{announcement}</output>
      <WeeklyHoursCard
        days={days}
        onChange={setDays}
        errors={props.errors ?? {}}
        readOnly={props.readOnly ?? false}
        announce={setAnnouncement}
      />
    </>
  );
}

describe('WeeklyHoursCard', () => {
  it('renders seven weekday fieldsets, Monday first, inside a labelled section', () => {
    render(<Harness />);
    expect(screen.getByRole('region', { name: 'Weekly hours' })).toBeInTheDocument();
    const groups = screen.getAllByRole('group');
    expect(
      groups.map((g) => within(g).getByText(/day$/, { selector: 'legend' }).textContent)
    ).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    expect(screen.getByRole('heading', { level: 2, name: 'Weekly hours' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });

  it('names each switch and describes it with a text summary', () => {
    render(<Harness />);
    const monday = screen.getByRole('switch', { name: 'Monday open' });
    expect(monday).toHaveAttribute('aria-checked', 'true');
    expect(monday).toHaveAccessibleDescription('09:00 to 17:00');
    expect(screen.getByRole('switch', { name: 'Saturday open' })).toHaveAccessibleDescription(
      'Closed'
    );
  });

  it('labels range inputs by position and renders no controls for a closed day', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Monday range 1 start')).toHaveValue('09:00');
    expect(screen.getByLabelText('Monday range 1 end')).toHaveValue('17:00');
    expect(screen.getByRole('list', { name: 'Monday hours' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Saturday hours' })).not.toBeInTheDocument();
  });

  it('adds a range, announces it and focuses its start input', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add range for Monday' }));
    const start = screen.getByLabelText('Monday range 2 start');
    expect(document.activeElement).toBe(start);
    expect(screen.getByRole('status')).toHaveTextContent('Range added, Monday range 2.');
  });

  it('offers Remove only when a day has more than one range, then moves focus', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Remove Monday range 1' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add range for Monday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Monday range 2' }));
    expect(screen.queryByLabelText('Monday range 2 start')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText('Monday range 1 start'));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Monday range 2 removed, 1 range remains.'
    );
  });

  it('caps a day at six ranges with aria-disabled and an announcement', () => {
    render(<Harness />);
    const add = screen.getByRole('button', { name: 'Add range for Monday' });
    for (let i = 0; i < 5; i++) fireEvent.click(add);
    expect(screen.getByLabelText('Monday range 6 start')).toBeInTheDocument();
    expect(add).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(add);
    expect(screen.queryByLabelText('Monday range 7 start')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Maximum of 6 ranges reached for Monday.');
  });

  it('switching a day off hides its ranges and keeps them for switching back on', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Monday range 1 start'), { target: { value: '08:30' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Monday open' }));
    expect(screen.queryByLabelText('Monday range 1 start')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Monday open' })).toHaveAccessibleDescription(
      'Closed'
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Monday open' }));
    expect(screen.getByLabelText('Monday range 1 start')).toHaveValue('08:30');
  });

  it('opening a day with no ranges seeds 09:00-17:00', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('switch', { name: 'Saturday open' }));
    expect(screen.getByLabelText('Saturday range 1 start')).toHaveValue('09:00');
    expect(screen.getByLabelText('Saturday range 1 end')).toHaveValue('17:00');
  });

  it('shows a field error with aria-invalid and the error colour tokens', () => {
    render(
      <Harness
        errors={{ [rangeFieldId(1, 0, 'end')]: 'Monday range 1 must end after it starts' }}
      />
    );
    const end = screen.getByLabelText('Monday range 1 end');
    expect(end).toHaveAttribute('aria-invalid', 'true');
    expect(end).toHaveAccessibleDescription('Monday range 1 must end after it starts');
    const error = screen.getByText('Monday range 1 must end after it starts');
    expect(error.className).toContain('text-red-700');
    expect(error.className).toContain('dark:text-red-300');
    expect(error.className).not.toContain('text-destructive');
  });

  it('renders summaries as text and no controls when read-only', () => {
    render(<Harness readOnly />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getAllByText('09:00 to 17:00')).toHaveLength(5);
    expect(screen.getAllByText('Closed')).toHaveLength(2);
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness />);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('calls onChange with the edited time', () => {
    const onChange = vi.fn();
    render(
      <WeeklyHoursCard
        days={baseDays()}
        onChange={onChange}
        errors={{}}
        readOnly={false}
        announce={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('Tuesday range 1 end'), { target: { value: '18:00' } });
    const next = onChange.mock.calls[0][0] as DraftDay[];
    expect(next[2].ranges[0].end).toBe('18:00');
  });
});
