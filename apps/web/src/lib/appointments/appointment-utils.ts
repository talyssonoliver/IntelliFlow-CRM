/**
 * Appointment utility functions — PG-139
 *
 * Status/type label/color mappers and formatting helpers.
 */

import type { RecurrencePattern, DayOfWeek } from '@/components/appointments/types';

export function getTypeConfig(type: string): {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
} {
  switch (type) {
    case 'MEETING':
      return { label: 'Meeting', icon: 'groups', color: 'text-blue-800', bgColor: 'bg-blue-100' };
    case 'CALL':
      return { label: 'Call', icon: 'call', color: 'text-green-800', bgColor: 'bg-green-100' };
    case 'HEARING':
      return { label: 'Hearing', icon: 'gavel', color: 'text-red-800', bgColor: 'bg-red-100' };
    case 'CONSULTATION':
      return {
        label: 'Consultation',
        icon: 'forum',
        color: 'text-purple-800',
        bgColor: 'bg-purple-100',
      };
    case 'DEPOSITION':
      return {
        label: 'Deposition',
        icon: 'description',
        color: 'text-orange-800',
        bgColor: 'bg-orange-100',
      };
    case 'OTHER':
      return { label: 'Other', icon: 'event', color: 'text-slate-800', bgColor: 'bg-slate-100' };
    default:
      return { label: type, icon: 'event', color: 'text-gray-800', bgColor: 'bg-gray-100' };
  }
}

export function getStatusConfig(status: string): { label: string; color: string; bgColor: string } {
  switch (status) {
    case 'SCHEDULED':
      return { label: 'Scheduled', color: 'text-slate-800', bgColor: 'bg-slate-100' };
    case 'CONFIRMED':
      return { label: 'Confirmed', color: 'text-blue-800', bgColor: 'bg-blue-100' };
    case 'IN_PROGRESS':
      return { label: 'In Progress', color: 'text-amber-800', bgColor: 'bg-amber-100' };
    case 'COMPLETED':
      return { label: 'Completed', color: 'text-green-800', bgColor: 'bg-green-100' };
    case 'CANCELLED':
      return { label: 'Cancelled', color: 'text-red-800', bgColor: 'bg-red-100' };
    case 'NO_SHOW':
      return { label: 'No Show', color: 'text-orange-800', bgColor: 'bg-orange-100' };
    default:
      return { label: status, color: 'text-gray-800', bgColor: 'bg-gray-100' };
  }
}

export function getConflictSeverityColor(type: string): {
  color: string;
  bgColor: string;
  borderColor: string;
} {
  switch (type) {
    case 'EXACT':
      return { color: 'text-red-800', bgColor: 'bg-red-50', borderColor: 'border-red-300' };
    case 'PARTIAL':
      return {
        color: 'text-orange-800',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-300',
      };
    case 'BUFFER':
      return {
        color: 'text-yellow-800',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-300',
      };
    default:
      return { color: 'text-gray-800', bgColor: 'bg-gray-50', borderColor: 'border-gray-300' };
  }
}

export function formatTimeRange(
  start: Date | string,
  end: Date | string,
  timezone: string = 'Europe/London'
): string {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    });
  return `${fmt(s)} - ${fmt(e)}`;
}

export function formatDuration(start: Date | string, end: Date | string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function isOverdue(endTime: Date | string, status: string): boolean {
  if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'NO_SHOW') return false;
  return new Date(endTime) < new Date();
}

export function formatDateShort(date: Date | string, timezone: string = 'Europe/London'): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone });
}

export function timeAgo(date: Date | string, timezone: string = 'Europe/London'): string {
  const now = new Date();
  const d = new Date(date);
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}

export function getInitials(name: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
};

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
};

export function formatRecurrence(
  pattern: RecurrencePattern | null | undefined,
  timezone: string = 'Europe/London'
): string {
  if (!pattern) return '';
  const freq = FREQUENCY_LABELS[pattern.frequency] || pattern.frequency.toLowerCase();
  let text =
    pattern.interval === 1 ? `Repeats every ${freq}` : `Repeats every ${pattern.interval} ${freq}s`;

  if (pattern.frequency === 'WEEKLY' && pattern.daysOfWeek?.length) {
    const days = pattern.daysOfWeek.map((d) => DAY_LABELS[d] || d).join(', ');
    text += ` on ${days}`;
  }

  if (pattern.frequency === 'MONTHLY' && pattern.dayOfMonth) {
    text += ` on day ${pattern.dayOfMonth}`;
  }

  if (pattern.endDate) {
    const d = new Date(pattern.endDate);
    text += ` until ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone })}`;
  } else if (pattern.occurrenceCount) {
    text += ` for ${pattern.occurrenceCount} occurrences`;
  }

  return text;
}

export const APPOINTMENT_TYPE_OPTIONS = [
  { value: 'MEETING', label: 'Meeting' },
  { value: 'CALL', label: 'Call' },
  { value: 'HEARING', label: 'Hearing' },
  { value: 'CONSULTATION', label: 'Consultation' },
  { value: 'DEPOSITION', label: 'Deposition' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const APPOINTMENT_STATUS_OPTIONS = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No Show' },
] as const;

export const BUFFER_PRESETS = [0, 15, 30, 60] as const;
export const REMINDER_PRESETS = [15, 30, 60, 1440] as const;

export function getReminderLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min before`;
  if (minutes === 60) return '1 hour before';
  if (minutes === 1440) return '1 day before';
  return `${Math.round(minutes / 60)} hours before`;
}
