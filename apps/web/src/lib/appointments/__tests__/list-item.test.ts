import { describe, it, expect } from 'vitest';
import { toAppointmentListItem, type AppointmentListRow } from '../list-item';

const row = (overrides: Partial<AppointmentListRow> = {}): AppointmentListRow => ({
  id: 'apt-1',
  title: 'Client call',
  startTime: '2026-10-05T09:00:00.000Z',
  endTime: '2026-10-05T09:30:00.000Z',
  appointmentType: 'CALL',
  status: 'SCHEDULED',
  location: null,
  calendarId: null,
  recurrence: null,
  parentAppointmentId: null,
  organizer: { id: 'u1', name: 'Alice' },
  attendees: [{ user: { name: 'Bob' } }, { user: null }],
  linkedCases: [{}, {}, {}],
  ...overrides,
});

describe('toAppointmentListItem', () => {
  it('maps an appointments.list row', () => {
    expect(toAppointmentListItem(row())).toEqual({
      id: 'apt-1',
      title: 'Client call',
      startTime: new Date('2026-10-05T09:00:00.000Z'),
      endTime: new Date('2026-10-05T09:30:00.000Z'),
      appointmentType: 'CALL',
      status: 'SCHEDULED',
      location: undefined,
      attendeeCount: 2,
      hasConflict: false,
      linkedCaseCount: 3,
      isRecurring: false,
      calendarId: null,
      organizer: { id: 'u1', name: 'Alice' },
      attendeeNames: ['Bob', 'Unknown'],
    });
  });

  // Both pages read a non-existent `recurrencePattern` field before, so this
  // was always false.
  it('marks an appointment with a recurrence rule as recurring', () => {
    expect(toAppointmentListItem(row({ recurrence: { freq: 'WEEKLY' } })).isRecurring).toBe(true);
  });

  it('marks an instance of a recurring series as recurring', () => {
    expect(toAppointmentListItem(row({ parentAppointmentId: 'apt-0' })).isRecurring).toBe(true);
  });

  it('falls back when there is no organizer and keeps a location', () => {
    const item = toAppointmentListItem(row({ organizer: null, location: 'Room 2' }));
    expect(item.organizer).toEqual({ id: '', name: 'Unknown' });
    expect(item.location).toBe('Room 2');
  });
});
