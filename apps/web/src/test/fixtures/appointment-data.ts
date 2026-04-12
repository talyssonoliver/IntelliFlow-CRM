/**
 * Mock data fixtures for Appointment components — PG-139
 */

import type {
  CalendarAppointment,
  AppointmentListItem,
  AppointmentDetailData,
  AppointmentAttendee,
  LinkedCase,
  ConflictDetail,
  AppointmentStats,
  RecurrencePattern,
} from '@/components/appointments/types';

export const mockAttendee1: AppointmentAttendee = {
  id: 'att-1',
  userId: 'user-1',
  name: 'Jane Doe',
  email: 'jane@firm.com',
};

export const mockAttendee2: AppointmentAttendee = {
  id: 'att-2',
  userId: 'user-2',
  name: 'John Smith',
  email: 'john@firm.com',
};

export const mockAttendee3: AppointmentAttendee = {
  id: 'att-3',
  userId: 'user-3',
  name: 'Sarah Wilson',
  email: 'sarah@firm.com',
};

export const mockLinkedCase1: LinkedCase = {
  id: 'lc-1',
  caseId: 'case-1',
  title: 'Smith v. Johnson Property Dispute',
  caseNumber: 'CF-2024-001',
};

export const mockLinkedCase2: LinkedCase = {
  id: 'lc-2',
  caseId: 'case-2',
  title: 'Williams Contract Breach',
  caseNumber: 'CF-2024-002',
};

export const mockConflict1: ConflictDetail = {
  id: 'conflict-1',
  title: 'Team Standup',
  startTime: new Date('2026-02-14T10:00:00Z'),
  endTime: new Date('2026-02-14T10:30:00Z'),
  appointmentType: 'MEETING',
  overlapMinutes: 30,
  conflictType: 'EXACT',
};

export const mockConflict2: ConflictDetail = {
  id: 'conflict-2',
  title: 'Client Call',
  startTime: new Date('2026-02-14T10:15:00Z'),
  endTime: new Date('2026-02-14T11:00:00Z'),
  appointmentType: 'CALL',
  overlapMinutes: 15,
  conflictType: 'PARTIAL',
};

export const mockConflict3: ConflictDetail = {
  id: 'conflict-3',
  title: 'Court Hearing',
  startTime: new Date('2026-02-14T11:30:00Z'),
  endTime: new Date('2026-02-14T12:30:00Z'),
  appointmentType: 'HEARING',
  overlapMinutes: 15,
  conflictType: 'BUFFER',
};

export const mockAppointment1: CalendarAppointment = {
  id: 'appt-1',
  title: 'Strategy Meeting',
  startTime: new Date('2026-02-14T10:00:00Z'),
  endTime: new Date('2026-02-14T11:00:00Z'),
  appointmentType: 'MEETING',
  status: 'SCHEDULED',
  location: 'Conference Room A',
  attendeeCount: 3,
  hasConflict: false,
  linkedCaseCount: 1,
  isRecurring: false,
  calendarId: null,
};

export const mockAppointment2: CalendarAppointment = {
  id: 'appt-2',
  title: 'Court Hearing - Smith Case',
  startTime: new Date('2026-02-15T09:00:00Z'),
  endTime: new Date('2026-02-15T11:00:00Z'),
  appointmentType: 'HEARING',
  status: 'CONFIRMED',
  location: 'Courtroom 3B',
  attendeeCount: 2,
  hasConflict: true,
  linkedCaseCount: 1,
  isRecurring: false,
  calendarId: null,
};

export const mockAppointment3: CalendarAppointment = {
  id: 'appt-3',
  title: 'Client Consultation',
  startTime: new Date('2026-02-13T14:00:00Z'),
  endTime: new Date('2026-02-13T15:00:00Z'),
  appointmentType: 'CONSULTATION',
  status: 'COMPLETED',
  location: 'Office 201',
  attendeeCount: 1,
  hasConflict: false,
  linkedCaseCount: 0,
  isRecurring: false,
  calendarId: null,
};

export const mockAppointment4: CalendarAppointment = {
  id: 'appt-4',
  title: 'Follow-up Call',
  startTime: new Date('2026-02-16T16:00:00Z'),
  endTime: new Date('2026-02-16T16:30:00Z'),
  appointmentType: 'CALL',
  status: 'CANCELLED',
  attendeeCount: 1,
  hasConflict: false,
  linkedCaseCount: 0,
  isRecurring: true,
  calendarId: null,
};

export const mockAppointments: CalendarAppointment[] = [
  mockAppointment1,
  mockAppointment2,
  mockAppointment3,
  mockAppointment4,
];

export const mockRecurrence: RecurrencePattern = {
  frequency: 'WEEKLY',
  interval: 1,
  daysOfWeek: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
  endDate: new Date('2026-03-15T00:00:00Z'),
};

export const mockListItem1: AppointmentListItem = {
  ...mockAppointment1,
  organizer: { id: 'user-1', name: 'Jane Doe' },
  attendeeNames: ['Jane Doe', 'John Smith', 'Sarah Wilson'],
};

export const mockListItem2: AppointmentListItem = {
  ...mockAppointment2,
  organizer: { id: 'user-1', name: 'Jane Doe' },
  attendeeNames: ['Jane Doe', 'John Smith'],
};

export const mockAppointmentDetail: AppointmentDetailData = {
  ...mockListItem1,
  description: 'Discuss case strategy and next steps for the Smith property dispute.',
  notes: 'Bring the property survey documents.',
  bufferMinutesBefore: 15,
  bufferMinutesAfter: 30,
  reminderMinutes: 60,
  recurrence: mockRecurrence,
  attendees: [mockAttendee1, mockAttendee2, mockAttendee3],
  linkedCases: [mockLinkedCase1],
  createdAt: new Date('2026-02-10T10:00:00Z'),
  updatedAt: new Date('2026-02-12T14:00:00Z'),
};

export const mockStats: AppointmentStats = {
  total: 24,
  byStatus: {
    SCHEDULED: 8,
    CONFIRMED: 6,
    IN_PROGRESS: 2,
    COMPLETED: 5,
    CANCELLED: 2,
    NO_SHOW: 1,
  },
  byType: {
    MEETING: 10,
    CALL: 5,
    HEARING: 4,
    CONSULTATION: 3,
    DEPOSITION: 1,
    OTHER: 1,
  },
  upcoming: 14,
  overdue: 3,
};

export function createMockAppointment(
  overrides: Partial<CalendarAppointment> = {}
): CalendarAppointment {
  return { ...mockAppointment1, ...overrides };
}

export function createMockConflict(overrides: Partial<ConflictDetail> = {}): ConflictDetail {
  return { ...mockConflict1, ...overrides };
}

export function createMockStats(overrides: Partial<AppointmentStats> = {}): AppointmentStats {
  return { ...mockStats, ...overrides };
}
