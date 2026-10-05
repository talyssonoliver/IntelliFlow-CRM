/**
 * appointments.list rows → the list/calendar view model.
 *
 * Shared by the appointments list and the calendar, which used to duplicate this
 * mapping behind `as unknown as` casts of the query result. Those casts hid a
 * read of a non-existent `recurrencePattern` field, so no appointment was ever
 * shown as recurring.
 */
import type { AppointmentListItem } from '@/components/appointments/types';

/** The fields of an appointments.list row read here (dates arrive as ISO strings). */
export interface AppointmentListRow {
  id: string;
  title: string;
  startTime: string | Date;
  endTime: string | Date;
  appointmentType: AppointmentListItem['appointmentType'];
  status: AppointmentListItem['status'];
  location: string | null;
  calendarId: string | null;
  recurrence?: unknown;
  parentAppointmentId: string | null;
  organizer: { id: string; name: string | null } | null;
  attendees: ReadonlyArray<{ user: { name: string | null } | null }>;
  linkedCases: ReadonlyArray<unknown>;
}

export function toAppointmentListItem(a: AppointmentListRow): AppointmentListItem {
  return {
    id: a.id,
    title: a.title,
    startTime: new Date(a.startTime),
    endTime: new Date(a.endTime),
    appointmentType: a.appointmentType,
    status: a.status,
    location: a.location ?? undefined,
    attendeeCount: a.attendees.length,
    hasConflict: false,
    linkedCaseCount: a.linkedCases.length,
    // Recurring: it carries a recurrence rule, or it is an instance of a series.
    isRecurring: a.recurrence != null || a.parentAppointmentId != null,
    calendarId: a.calendarId,
    organizer: { id: a.organizer?.id ?? '', name: a.organizer?.name ?? 'Unknown' },
    attendeeNames: a.attendees.map((att) => att.user?.name ?? 'Unknown'),
  };
}
