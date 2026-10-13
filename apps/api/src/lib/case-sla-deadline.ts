/**
 * Case SLA deadline — PG-204 (ADR-076, spec D7).
 *
 * A case type's SLA is a number of calendar days. The deadline is the last
 * instant (23:59:59.999) of local calendar day today+N in the case timezone
 * (UTC when none). Calendar arithmetic is done on the local date, then the
 * deadline is 1 ms before the next local day starts, so DST changes between today
 * and the target day, or at that midnight itself, do not shift the result.
 *
 * Self-contained on purpose: the shared `getTimezoneOffsetMinutes` in
 * lib/timezone-utils.ts wraps offsets above +12h (UTC+13/+14 zones), which would
 * move these deadlines by days.
 */

import { formatISODateInTimezone, safeTimezone } from './timezone-utils';

const MINUTE_MS = 60 * 1000;

/** Offset of `timezone` from UTC at `instant`, in minutes (exact for any zone). */
function offsetMinutesAt(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const part = (type: string) => Number(byType[type]);
  const wallClockAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second')
  );
  const wholeSeconds = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((wallClockAsUtc - wholeSeconds) / MINUTE_MS);
}

const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * First instant of local calendar day `dayStart` (a UTC-midnight timestamp naming the
 * local date). The zone's offsets a day before and a day after bracket any DST change
 * at that midnight; each gives a candidate start, and the earliest candidate that is
 * already on the target date wins. This handles a repeated midnight (first 00:00), a
 * repeated last hour of the previous day, and a skipped midnight (the jump instant).
 */
function startOfLocalDay(dayStart: number, timezone: string): number {
  const target = formatISODateInTimezone(new Date(dayStart), 'UTC');
  const offsets = [
    offsetMinutesAt(new Date(dayStart - DAY_MS), timezone),
    offsetMinutesAt(new Date(dayStart + DAY_MS), timezone),
  ];
  const onTarget = offsets
    .map((offset) => dayStart - offset * MINUTE_MS)
    .filter((instant) => formatISODateInTimezone(new Date(instant), timezone) === target);
  return Math.min(...onTarget);
}

export function computeSlaDeadline(
  now: Date,
  days: number,
  timezone: string | null | undefined
): Date {
  const tz = safeTimezone(timezone);
  const [year, month, day] = formatISODateInTimezone(now, tz).split('-').map(Number);
  // The deadline is the last instant of local day D+N: 1 ms before local day D+N+1 starts.
  // This stays right when the day's last hour repeats (clocks go back at midnight) or
  // when the next midnight is skipped (clocks go forward at midnight).
  const nextDay = Date.UTC(year, month - 1, day + days + 1);
  return new Date(startOfLocalDay(nextDay, tz) - 1);
}
