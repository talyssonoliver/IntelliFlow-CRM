/**
 * Appointment component types — PG-139
 *
 * TypeScript interfaces for appointment scheduling components.
 */

export type AppointmentType =
  | 'MEETING'
  | 'CALL'
  | 'HEARING'
  | 'CONSULTATION'
  | 'DEPOSITION'
  | 'OTHER';
export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';
export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export interface CalendarAppointment {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  appointmentType: AppointmentType;
  status: AppointmentStatus;
  location?: string;
  attendeeCount: number;
  hasConflict: boolean;
  linkedCaseCount: number;
  isRecurring: boolean;
  calendarId?: string | null;
}

export interface AppointmentListItem extends CalendarAppointment {
  organizer: { id: string; name: string };
  attendeeNames: string[];
}

export interface AppointmentAttendee {
  id: string;
  userId: string;
  name: string;
  email?: string;
}

export interface LinkedCase {
  id: string;
  caseId: string;
  title: string;
  caseNumber?: string;
}

export interface RecurrencePattern {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  daysOfWeek?: DayOfWeek[];
  dayOfMonth?: number;
  monthOfYear?: number;
  endDate?: Date;
  occurrenceCount?: number;
}

export interface AppointmentDetailData extends AppointmentListItem {
  description?: string;
  notes?: string;
  bufferMinutesBefore: number;
  bufferMinutesAfter: number;
  reminderMinutes?: number;
  recurrence?: RecurrencePattern;
  attendees: AppointmentAttendee[];
  linkedCases: LinkedCase[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
}

export interface ConflictDetail {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  appointmentType: string;
  overlapMinutes: number;
  conflictType: 'EXACT' | 'PARTIAL' | 'BUFFER';
}

export interface AppointmentStats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  upcoming: number;
  overdue: number;
}

export interface AppointmentFilters {
  search: string;
  status: AppointmentStatus | '';
  appointmentType: AppointmentType | '';
  startTimeFrom?: Date;
  startTimeTo?: Date;
  caseId?: string;
  sortBy: 'startTime' | 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
  page: number;
  limit: number;
  viewMode: 'calendar' | 'list';
  calendarView: 'month' | 'week' | 'day';
}

export interface ConflictCheckParams {
  startTime: Date;
  endTime: Date;
  excludeId?: string;
  attendeeIds?: string[];
}

export interface ConflictInfo {
  conflicts: ConflictDetail[];
  hasConflicts: boolean;
  canOverride: boolean;
}

export interface CalendarTask {
  id: string;
  title: string;
  dueDate: Date | string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  calendarId?: string | null;
}

export interface AppointmentFormInput {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  timezone?: string;
  appointmentType: AppointmentType;
  location?: string;
  attendeeIds: string[];
  linkedCaseIds: string[];
  bufferMinutesBefore: number;
  bufferMinutesAfter: number;
  recurrence?: RecurrencePattern | null;
  reminderMinutes?: number;
  forceOverrideConflicts: boolean;
  calendarId?: string | null;
}
