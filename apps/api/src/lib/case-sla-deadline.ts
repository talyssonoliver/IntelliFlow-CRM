/**
 * Case SLA deadline — PG-204 (ADR-076, spec D7).
 *
 * A case type's SLA is a number of calendar days. The deadline is the last
 * instant (23:59:59.999) of local calendar day today+N in the case timezone
 * (UTC when none). Calendar arithmetic is done on the local date, then the
 * local end-of-day is converted to UTC with the zone's offset at that instant,
 * so DST changes between today and the target day do not shift the result.
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

export function computeSlaDeadline(
  now: Date,
  days: number,
  timezone: string | null | undefined
): Date {
  const tz = safeTimezone(timezone);
  const [year, month, day] = formatISODateInTimezone(now, tz).split('-').map(Number);
  // Target local date, then its 23:59:59.999 read as if it were UTC.
  const wallClock = Date.UTC(year, month - 1, day + days, 23, 59, 59, 999);
  const firstGuess = wallClock - offsetMinutesAt(new Date(wallClock), tz) * MINUTE_MS;
  // Re-check the offset at the real instant (it differs when a DST change lies in between).
  return new Date(wallClock - offsetMinutesAt(new Date(firstGuess), tz) * MINUTE_MS);
}
