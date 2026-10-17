/**
 * Firm availability rules (PG-202, ADR-081).
 *
 * Pure scheduling rules: weekly working hours are wall-clock minutes in the firm
 * timezone, closures are calendar dates in that zone, appointment instants are
 * UTC. The only runtime dependency is the built-in `Intl` (no infrastructure).
 */
import type { AppointmentStatus } from './AppointmentEvents';
import { DomainError } from '../../shared/Result';

/** 0 = Sunday … 6 = Saturday (same as the DB column and NotificationPreference.quietHoursDays). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const MINUTES_PER_DAY = 1440;

/** The rule a tenant gets until it saves availability (create/reschedule, ADR-081). */
export const LEGACY_BOOKING_HOURS = { startHour: 7, endHour: 19 } as const;

/** Shared limits: the validators and the DB CHECKs use the same numbers. */
export const AVAILABILITY_LIMITS = {
  maxRangesPerWeekday: 6,
  maxClosures: 200,
  maxClosureDays: 366,
  maxDailyBookings: 500,
  maxReasonLength: 200,
  minClosureDate: '2000-01-01',
  maxClosureDate: '2100-12-31',
  maxFindNextSlotCandidates: 2000,
} as const;

/** Statuses that use up a daily-cap slot. CANCELLED and NO_SHOW free it. */
export const CAP_COUNTED_STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
] as const satisfies readonly AppointmentStatus[];
export type CapCountedStatus = (typeof CAP_COUNTED_STATUSES)[number];

export const AVAILABILITY_VIOLATION_CODES = [
  'INVALID_INTERVAL',
  'INVALID_TIMEZONE',
  'SPANS_MIDNIGHT',
  'CLOSED_DATE',
  'OUTSIDE_HOURS',
  'DAILY_CAP_REACHED',
] as const;
export type AvailabilityViolationCode = (typeof AVAILABILITY_VIOLATION_CODES)[number];

export interface WeeklyRange {
  readonly weekday: Weekday;
  readonly startMinute: number;
  readonly endMinute: number;
}

/** All-day, inclusive closure; dates are 'YYYY-MM-DD' in the firm timezone. */
export interface Closure {
  readonly startDate: string;
  readonly endDate: string;
}

export interface AvailabilityRules {
  readonly timezone: string;
  readonly weeklyRanges: readonly WeeklyRange[];
  readonly closures: readonly Closure[];
  readonly maxDailyBookings: number | null;
}

export interface ZonedParts {
  date: string;
  weekday: Weekday;
  minuteOfDay: number;
  second: number;
  ms: number;
}

export type AvailabilityResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: AvailabilityViolationCode; readonly message: string };

export interface CandidateSlot {
  start: Date;
  end: Date;
}

export class InvalidTimezoneError extends DomainError {
  readonly code = 'INVALID_TIMEZONE';

  constructor(timezone: string) {
    super(`Invalid timezone: ${timezone}`);
  }
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const WEEKDAY_BY_SHORT: Record<string, Weekday> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

const INVALID_TIMEZONE_MESSAGE =
  'The firm timezone is invalid. An administrator must fix it in Calendar > Availability.';

export function isValidTimezone(timezone: string): boolean {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function canonicalTimezone(timezone: string): string {
  if (!isValidTimezone(timezone)) throw new InvalidTimezoneError(timezone);
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).resolvedOptions().timeZone;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) return cached;
  if (!isValidTimezone(timezone)) throw new InvalidTimezoneError(timezone);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  formatterCache.set(timezone, formatter);
  return formatter;
}

export function toZonedParts(instant: Date, timezone: string): ZonedParts {
  const map: Record<string, string> = {};
  for (const part of formatterFor(timezone).formatToParts(instant)) map[part.type] = part.value;
  const hour = Number(map.hour) % 24;
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    weekday: WEEKDAY_BY_SHORT[map.weekday],
    minuteOfDay: hour * 60 + Number(map.minute),
    second: Number(map.second),
    ms: instant.getUTCMilliseconds(),
  };
}

function parseDate(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}

function addDays(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekdayOf(date: string): Weekday {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

function localKey(parts: ZonedParts): string {
  return `${parts.date}T${String(parts.minuteOfDay).padStart(4, '0')}`;
}

/** Offset (ms) of the zone at `instant`: local wall clock read as UTC, minus the instant. */
function offsetAt(instant: number, timezone: string): number {
  const p = toZonedParts(new Date(instant), timezone);
  const [y, m, d] = parseDate(p.date);
  const localAsUtc = Date.UTC(y, m - 1, d, 0, p.minuteOfDay, p.second);
  return localAsUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * Wall clock (`date`, `minuteOfDay`) in `timezone` → instant.
 * A time inside a DST gap resolves to the first instant after the gap; an
 * ambiguous time (DST overlap) resolves to the earlier occurrence.
 */
export function localToUtc(date: string, minuteOfDay: number, timezone: string): Date {
  if (minuteOfDay >= MINUTES_PER_DAY) {
    return localToUtc(
      addDays(date, Math.floor(minuteOfDay / MINUTES_PER_DAY)),
      minuteOfDay % MINUTES_PER_DAY,
      timezone
    );
  }
  const [y, m, d] = parseDate(date);
  const naive = Date.UTC(y, m - 1, d) + minuteOfDay * MS_PER_MINUTE;
  const offsets = [
    ...new Set([
      offsetAt(naive - MS_PER_DAY / 2, timezone),
      offsetAt(naive, timezone),
      offsetAt(naive + MS_PER_DAY / 2, timezone),
    ]),
  ];
  const matches = offsets
    .map((offset) => naive - offset)
    .filter((t) => {
      const p = toZonedParts(new Date(t), timezone);
      return p.date === date && p.minuteOfDay === minuteOfDay;
    });
  if (matches.length > 0) return new Date(Math.min(...matches));

  // DST gap: the first minute whose local wall clock is at or after the target.
  const target = `${date}T${String(minuteOfDay).padStart(4, '0')}`;
  let lo = naive - Math.max(...offsets);
  let hi = naive - Math.min(...offsets);
  while (hi - lo > MS_PER_MINUTE) {
    const mid = lo + Math.floor((hi - lo) / 2 / MS_PER_MINUTE) * MS_PER_MINUTE;
    if (localKey(toZonedParts(new Date(mid), timezone)) >= target) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

/** Half-open [startUtc, endUtc) of a firm-local calendar day (23 h / 25 h on DST days). */
export function localDayBoundsUtc(
  date: string,
  timezone: string
): { startUtc: Date; endUtc: Date } {
  return {
    startUtc: localToUtc(date, 0, timezone),
    endUtc: localToUtc(addDays(date, 1), 0, timezone),
  };
}

/** The firm-local day of `start`, used to count bookings against the daily cap. */
export function capCountWindow(
  rules: Pick<AvailabilityRules, 'timezone'>,
  start: Date
): { startUtc: Date; endUtc: Date } {
  return localDayBoundsUtc(toZonedParts(start, rules.timezone).date, rules.timezone);
}

/** Sort and merge touching/overlapping ranges per weekday; invalid ranges are dropped. Input is not mutated. */
export function mergeRanges(ranges: readonly WeeklyRange[]): WeeklyRange[] {
  const sorted = ranges
    .filter((r) => r.startMinute < r.endMinute)
    .map((r) => ({ weekday: r.weekday, startMinute: r.startMinute, endMinute: r.endMinute }))
    .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  const merged: WeeklyRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.weekday === range.weekday && range.startMinute <= last.endMinute) {
      merged[merged.length - 1] = { ...last, endMinute: Math.max(last.endMinute, range.endMinute) };
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function formatRangeList(ranges: readonly WeeklyRange[]): string {
  const labels = ranges.map((r) => `${formatMinute(r.startMinute)}-${formatMinute(r.endMinute)}`);
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}

function violation(code: AvailabilityViolationCode, message: string): AvailabilityResult {
  return { ok: false, code, message };
}

function isClosed(date: string, closures: readonly Closure[]): boolean {
  return closures.some((c) => c.startDate <= date && date <= c.endDate);
}

/**
 * The end as a minute of the start's local day (1440 = 24:00), rounding a
 * partial minute up; `null` when the appointment runs into the next day.
 */
function localEndMinute(s: ZonedParts, e: ZonedParts): number | null {
  const endsOnTheMinute = e.second === 0 && e.ms === 0;
  if (e.date === s.date) return e.minuteOfDay + (endsOnTheMinute ? 0 : 1);
  if (e.date === addDays(s.date, 1) && e.minuteOfDay === 0 && endsOnTheMinute) {
    return MINUTES_PER_DAY; // ends at 24:00 of the start day
  }
  return null;
}

/**
 * The booking as wall-clock [start, end) minute segments of its start day.
 * One segment unless the zone's offset changes inside the booking (a DST day):
 * then it splits at the change, so the repeated autumn hour and the skipped
 * spring hour are judged by the clock times that really happen.
 */
function wallClockSegments(
  start: Date,
  end: Date,
  timezone: string,
  s: ZonedParts,
  endMinute: number
): Array<[number, number]> {
  const endOffset = offsetAt(end.getTime(), timezone);
  if (offsetAt(start.getTime(), timezone) === endOffset) return [[s.minuteOfDay, endMinute]];
  // First instant on the end's offset (a day holds at most one change).
  let lo = start.getTime();
  let hi = end.getTime();
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (offsetAt(mid, timezone) === endOffset) hi = mid;
    else lo = mid;
  }
  const beforeChange =
    localEndMinute(s, toZonedParts(new Date(hi - 1), timezone)) ?? MINUTES_PER_DAY;
  const afterChange = toZonedParts(new Date(hi), timezone).minuteOfDay;
  return [
    [s.minuteOfDay, beforeChange],
    [afterChange, endMinute],
  ];
}

function checkWeeklyHours(
  rules: AvailabilityRules,
  s: ZonedParts,
  segments: Array<[number, number]>
): AvailabilityResult {
  const dayRanges = mergeRanges(rules.weeklyRanges).filter((r) => r.weekday === s.weekday);
  if (dayRanges.length === 0) {
    return violation(
      'OUTSIDE_HOURS',
      `The firm is closed on ${WEEKDAY_NAMES[s.weekday]}s (${rules.timezone}).`
    );
  }
  // Every minute of the booking must be open; on ordinary days this is "inside one range".
  const fits = segments.every(
    ([from, to]) => to <= from || dayRanges.some((r) => from >= r.startMinute && to <= r.endMinute)
  );
  if (!fits) {
    return violation(
      'OUTSIDE_HOURS',
      `Appointments on ${WEEKDAY_NAMES[s.weekday]} must fall within ${formatRangeList(dayRanges)} (${rules.timezone}).`
    );
  }
  return { ok: true };
}

function checkDailyCap(
  rules: AvailabilityRules,
  date: string,
  sameDayCount: number | undefined
): AvailabilityResult {
  if (rules.maxDailyBookings === null) return { ok: true };
  if (typeof sameDayCount !== 'number' || Number.isNaN(sameDayCount)) {
    throw new Error('sameDayCount is required when maxDailyBookings is set');
  }
  if (sameDayCount >= rules.maxDailyBookings) {
    return violation('DAILY_CAP_REACHED', `The daily booking limit for ${date} has been reached.`);
  }
  return { ok: true };
}

export function evaluateAvailability(input: {
  rules: AvailabilityRules;
  start: Date;
  end: Date;
  /** Bookings already counted on the start day (excluding the one being rescheduled). Required when a cap is set. */
  sameDayCount?: number;
}): AvailabilityResult {
  const { rules, start, end } = input;
  if (end.getTime() <= start.getTime()) {
    return violation('INVALID_INTERVAL', 'Appointment end time must be after its start time.');
  }
  if (!isValidTimezone(rules.timezone)) {
    return violation('INVALID_TIMEZONE', INVALID_TIMEZONE_MESSAGE);
  }

  const s = toZonedParts(start, rules.timezone);
  const endMinute = localEndMinute(s, toZonedParts(end, rules.timezone));
  if (endMinute === null) {
    return violation(
      'SPANS_MIDNIGHT',
      'Appointments cannot run past midnight. Book multi-day events as one appointment per day.'
    );
  }
  if (isClosed(s.date, rules.closures)) {
    return violation('CLOSED_DATE', `The firm is closed on ${s.date}.`);
  }
  const segments = wallClockSegments(start, end, rules.timezone, s, endMinute);
  const hours = checkWeeklyHours(rules, s, segments);
  if (!hours.ok) return hours;
  return checkDailyCap(rules, s.date, input.sameDayCount);
}

/**
 * Candidate slots inside saved availability, earliest first: anchored at each
 * merged range start (`start + k * step`), on non-closed days, leaving room for
 * the duration inside the range, at or after `from`, before `from + maxDaysAhead`.
 * Ignores the daily cap and conflicts (callers check those).
 */
export function generateCandidates(input: {
  rules: AvailabilityRules;
  from: Date;
  durationMinutes: number;
  stepMinutes?: number;
  maxDaysAhead: number;
  limit: number;
}): CandidateSlot[] {
  const { rules, from, durationMinutes, maxDaysAhead, limit } = input;
  const step = input.stepMinutes ?? 60;
  if (!isValidTimezone(rules.timezone) || durationMinutes <= 0 || step <= 0) return [];
  const merged = mergeRanges(rules.weeklyRanges);
  if (merged.length === 0) return [];
  const uncapped: AvailabilityRules = { ...rules, maxDailyBookings: null };
  const horizon = from.getTime() + maxDaysAhead * MS_PER_DAY;
  const firstDate = toZonedParts(from, rules.timezone).date;
  const out: CandidateSlot[] = [];

  for (const start of rangeStartsFrom(firstDate, maxDaysAhead + 1, merged, rules, step)) {
    if (start.getTime() >= horizon) break;
    if (start.getTime() < from.getTime()) continue;
    const end = new Date(start.getTime() + durationMinutes * MS_PER_MINUTE);
    if (!evaluateAvailability({ rules: uncapped, start, end }).ok) continue;
    out.push({ start, end });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The UTC instants of each grid time `start + k * step` inside the given
 * day's ranges, in chronological order without duplicates. A grid time in
 * the repeated autumn hour yields both occurrences; one in the skipped spring
 * hour resolves forward (and is dropped if that instant is already listed).
 * Whether the duration fits is left to `evaluateAvailability`, which measures
 * elapsed time.
 */
function dayGridStarts(
  date: string,
  ranges: readonly WeeklyRange[],
  timezone: string,
  step: number
): number[] {
  const { startUtc, endUtc } = localDayBoundsUtc(date, timezone);
  const repeat = offsetAt(startUtc.getTime(), timezone) - offsetAt(endUtc.getTime() - 1, timezone);
  const instants = new Set<number>();
  for (const range of ranges) {
    for (let minute = range.startMinute; minute < range.endMinute; minute += step) {
      const first = localToUtc(date, minute, timezone).getTime();
      instants.add(first);
      if (repeat > 0) {
        const second = toZonedParts(new Date(first + repeat), timezone);
        if (second.date === date && second.minuteOfDay === minute) instants.add(first + repeat);
      }
    }
  }
  return [...instants].sort((a, b) => a - b);
}

/** Grid starts of every non-closed day from `firstDate` to `firstDate + lastDayOffset`, earliest first. */
function* rangeStartsFrom(
  firstDate: string,
  lastDayOffset: number,
  merged: readonly WeeklyRange[],
  rules: AvailabilityRules,
  step: number
): Generator<Date> {
  for (let day = 0; day <= lastDayOffset; day++) {
    const date = addDays(firstDate, day);
    if (isClosed(date, rules.closures)) continue;
    const weekday = weekdayOf(date);
    const ranges = merged.filter((r) => r.weekday === weekday);
    for (const instant of dayGridStarts(date, ranges, rules.timezone, step))
      yield new Date(instant);
  }
}
