/**
 * PG-203 — busy time from a host's recurring appointments.
 *
 * A recurring appointment is stored as one row (its first occurrence) plus a
 * `recurrence` rule (appointments.router `recurrenceSchema`), so a query on
 * startTime/endTime alone misses every later occurrence. The public booking page
 * expands each series inside the window it shows, so a slot is never offered on
 * top of the host's weekly meeting.
 *
 * The expansion is written here rather than delegated to the domain's
 * Recurrence.generateOccurrences, which ignores weekly intervals and drops a
 * monthly day that a short month skips (codex). Each series is expanded on the
 * calendar of its own time zone: weekdays, month days and the wall-clock time are
 * the ones the organiser chose, and each occurrence is converted to UTC on its own
 * date (so a 09:00 meeting stays at 09:00 across a DST change).
 */
import { isValidTimezone, localToUtc, toZonedParts, type BusyInterval } from '@intelliflow/domain';

const MS_PER_DAY = 86_400_000;
/** Hard stop for one series' day walk (~27 years of days). */
const MAX_STEPS = 10_000;
const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

export interface RecurringBusyRow {
  startTime: Date;
  endTime: Date;
  bufferMinutesBefore: number;
  bufferMinutesAfter: number;
  recurrence: unknown;
  /** The appointment's IANA zone; null or unknown reads the rule in UTC. */
  timezone: string | null;
}

interface Rule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  daysOfWeek: number[];
  dayOfMonth?: number;
  monthOfYear?: number;
  endDate?: Date;
  occurrenceCount?: number;
  exceptionDates: string[];
}

const FREQUENCIES = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

function positiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined;
}

function parseRule(value: unknown): Rule | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.frequency !== 'string' || !FREQUENCIES.has(raw.frequency)) return null;
  const endDate = typeof raw.endDate === 'string' ? new Date(raw.endDate) : undefined;
  const daysOfWeek = Array.isArray(raw.daysOfWeek)
    ? raw.daysOfWeek
        .map((d) => WEEKDAYS.indexOf(d as (typeof WEEKDAYS)[number]))
        .filter((d) => d >= 0)
    : [];
  const exceptions = Array.isArray(raw.exceptionDates) ? raw.exceptionDates : [];
  return {
    frequency: raw.frequency as Rule['frequency'],
    interval: positiveInt(raw.interval) ?? 1,
    daysOfWeek,
    dayOfMonth: positiveInt(raw.dayOfMonth),
    monthOfYear: positiveInt(raw.monthOfYear),
    endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : undefined,
    occurrenceCount: positiveInt(raw.occurrenceCount),
    exceptionDates: exceptions.filter((d): d is string => typeof d === 'string'),
  };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Skipped dates on the series' own calendar. Recurrence.toJSON stores each as a UTC
 * instant, which can fall on the previous or next UTC day (09:00 in Auckland), so an
 * instant is read in the series zone; a bare date is taken as written.
 */
function exceptionDays(dates: readonly string[], timezone: string): Set<string> {
  const days = new Set<string>();
  for (const value of dates) {
    if (DATE_ONLY.test(value)) {
      days.add(value);
      continue;
    }
    const instant = new Date(value);
    if (!Number.isNaN(instant.getTime())) days.add(toZonedParts(instant, timezone).date);
  }
  return days;
}

/** A calendar date ('YYYY-MM-DD') as a day number, and back. */
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!) / MS_PER_DAY;
}

function dateOf(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function* dailyDays(rule: Rule, firstDay: number): Generator<number> {
  for (let k = 0; k < MAX_STEPS; k += 1) yield firstDay + k * rule.interval;
}

function* weeklyDays(rule: Rule, firstDay: number): Generator<number> {
  const firstWeekday = new Date(firstDay * MS_PER_DAY).getUTCDay();
  const days = new Set(rule.daysOfWeek.length > 0 ? rule.daysOfWeek : [firstWeekday]);
  const weekStart = firstDay - firstWeekday; // the Sunday of the first week
  for (let day = firstDay; day < firstDay + MAX_STEPS; day += 1) {
    const week = Math.floor((day - weekStart) / 7);
    if (week % rule.interval === 0 && days.has((day - weekStart) % 7)) yield day;
  }
}

function* monthlyOrYearlyDays(rule: Rule, firstDate: string): Generator<number> {
  const [firstYear, firstMonth, firstDom] = firstDate.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const monthly = rule.frequency === 'MONTHLY';
  const step = monthly ? rule.interval : rule.interval * 12;
  const dom = rule.dayOfMonth ?? firstDom;
  const startMonth = monthly ? firstMonth - 1 : (rule.monthOfYear ?? firstMonth) - 1;
  const firstDay = dayNumber(firstDate);
  for (let k = 0; k * step < MAX_STEPS; k += 1) {
    const total = firstYear * 12 + startMonth + k * step;
    const year = Math.floor(total / 12);
    const month = total % 12;
    // A month without that day (31st, 29 February) has no occurrence, as in RFC 5545.
    if (dom > daysInMonth(year, month)) continue;
    const day = Date.UTC(year, month, dom) / MS_PER_DAY;
    if (day >= firstDay) yield day;
  }
}

/** Local calendar days the rule falls on, in order, from the first occurrence's day. */
function scheduledDays(rule: Rule, firstDate: string): Generator<number> {
  if (rule.frequency === 'DAILY') return dailyDays(rule, dayNumber(firstDate));
  if (rule.frequency === 'WEEKLY') return weeklyDays(rule, dayNumber(firstDate));
  return monthlyOrYearlyDays(rule, firstDate);
}

/** Scheduled starts in order, from the first occurrence; the caller decides when to stop. */
function* scheduledStarts(rule: Rule, first: Date, timezone: string): Generator<Date> {
  const local = toZonedParts(first, timezone);
  const extraMs = local.second * 1000 + local.ms;
  const firstDay = dayNumber(local.date);
  for (const day of scheduledDays(rule, local.date)) {
    // The first occurrence is the stored instant itself: rebuilding it from local time
    // would pick the earlier of a repeated DST hour (codex).
    yield day === firstDay
      ? new Date(first)
      : new Date(localToUtc(dateOf(day), local.minuteOfDay, timezone).getTime() + extraMs);
  }
}

/** Later occurrences of one series that start before windowEnd, skipped dates left out. */
function laterStarts(row: RecurringBusyRow, rule: Rule, windowEnd: Date): Date[] {
  const timezone = row.timezone && isValidTimezone(row.timezone) ? row.timezone : 'UTC';
  const skipped = exceptionDays(rule.exceptionDates, timezone);
  // The editor stores the chosen last day as midnight UTC; it is inclusive, on the series'
  // own calendar, so the meeting on that day still happens (codex).
  const lastDay = rule.endDate?.toISOString().slice(0, 10);
  const starts: Date[] = [];
  let count = 1; // the stored appointment is occurrence 1 (RFC 5545)
  for (const start of scheduledStarts(rule, row.startTime, timezone)) {
    if (start.getTime() === row.startTime.getTime()) continue;
    const localDate = toZonedParts(start, timezone).date;
    if (start >= windowEnd || (lastDay !== undefined && localDate > lastDay)) break;
    count += 1;
    if (rule.occurrenceCount !== undefined && count > rule.occurrenceCount) break;
    // A skipped date still counts towards occurrenceCount (RFC 5545 EXDATE).
    if (!skipped.has(localDate)) starts.push(start);
  }
  return starts;
}

/**
 * Every occurrence of each series that overlaps [windowStart, windowEnd), with the
 * series' own length and buffers, the stored first occurrence included. Callers leave
 * recurring rows out of their ordinary queries; a rule that cannot be read falls back
 * to the stored occurrence alone.
 */
export function recurringBusyIntervals(
  rows: readonly RecurringBusyRow[],
  windowStart: Date,
  windowEnd: Date
): BusyInterval[] {
  const busy: BusyInterval[] = [];
  for (const row of rows) {
    const length = row.endTime.getTime() - row.startTime.getTime();
    const rule = parseRule(row.recurrence);
    // The stored appointment is always busy, whatever the rule says: the database reserves
    // its interval (appointments_no_overlap_per_organizer), even when its own date is skipped
    // or its weekday is not one the rule repeats on (codex).
    const starts = [row.startTime, ...(rule ? laterStarts(row, rule, windowEnd) : [])];
    for (const start of starts) {
      const end = new Date(start.getTime() + length);
      if (start >= windowEnd || end <= windowStart) continue;
      busy.push({
        start,
        end,
        bufferBeforeMinutes: row.bufferMinutesBefore,
        bufferAfterMinutes: row.bufferMinutesAfter,
      });
    }
  }
  return busy;
}
