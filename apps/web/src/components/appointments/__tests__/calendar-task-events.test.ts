import { describe, it, expect, vi } from 'vitest';
import { Temporal } from 'temporal-polyfill';

// The test setup stubs the global polyfill; this mapping needs the real Temporal.
(globalThis as unknown as { Temporal: typeof Temporal }).Temporal = Temporal;

// The Schedule-X React bindings are not needed to test the pure mapping.
vi.mock('@schedule-x/react', () => ({
  ScheduleXCalendar: () => null,
  useNextCalendarApp: () => null,
}));

import { mapTasksToEvents } from '../AppointmentCalendarInner';

const task = (dueDate: Date) => ({
  id: 't1',
  title: 'Call back',
  dueDate,
  priority: 'HIGH' as const,
});

describe('tasks on the calendar (owner 26/11: week view showed none)', () => {
  it('puts a task due outside the visible hours in the all-day row', () => {
    const late = new Date(2026, 10, 25, 23, 59);
    const [event] = mapTasksToEvents([task(late)]);
    expect(String(event.start)).toBe('2026-11-25');
    expect(String(event.end)).toBe('2026-11-25');
  });

  it('keeps a task with a time inside the visible hours at that time', () => {
    const [event] = mapTasksToEvents([task(new Date(2026, 10, 25, 14, 30))]);
    expect(String(event.start)).toContain('2026-11-25T14:30');
  });

  it('places a date-only task (midnight UTC) at the 09:00 default', () => {
    const [event] = mapTasksToEvents([task(new Date(Date.UTC(2026, 10, 25)))]);
    expect(String(event.start)).toContain('T09:00');
  });
});
