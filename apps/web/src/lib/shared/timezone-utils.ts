/**
 * Timezone-aware date/time formatting utilities for IntelliFlow CRM.
 *
 * All functions accept an IANA timezone string (e.g., "America/New_York")
 * and format UTC-stored dates for display in that timezone.
 *
 * Design principles:
 * - Storage is always UTC (Prisma DateTime → JS Date → UTC epoch)
 * - Display converts to the target timezone at render time
 * - Never use bare toLocaleDateString() without a timeZone option
 *
 * @module timezone-utils
 */

export type DateInput = Date | string | number;

function toDate(input: DateInput): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

/**
 * Format a date for display in a specific timezone.
 *
 * @example
 * formatDate(new Date(), 'America/New_York')
 * // → "Mar 15, 2026"
 *
 * formatDate(new Date(), 'America/New_York', { weekday: 'long' })
 * // → "Sunday, Mar 15, 2026"
 */
export function formatDate(
  input: DateInput,
  timezone: string = 'Europe/London',
  options?: Partial<Pick<Intl.DateTimeFormatOptions, 'weekday' | 'year' | 'month' | 'day'>>
): string {
  const date = toDate(input);
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
    timeZone: timezone,
  });
}

/**
 * Format a time for display in a specific timezone.
 *
 * @example
 * formatTime(new Date(), 'America/New_York')
 * // → "2:30 PM"
 *
 * formatTime(new Date(), 'Europe/London', { hour12: false })
 * // → "14:30"
 */
export function formatTime(
  input: DateInput,
  timezone: string = 'Europe/London',
  options?: Partial<Pick<Intl.DateTimeFormatOptions, 'hour12' | 'second'>>
): string {
  const date = toDate(input);
  return date.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    ...options,
    timeZone: timezone,
  });
}

/**
 * Format a date and time for display in a specific timezone.
 *
 * @example
 * formatDateTime(new Date(), 'America/New_York')
 * // → "Mar 15, 2026, 2:30 PM"
 */
export function formatDateTime(
  input: DateInput,
  timezone: string = 'Europe/London',
  options?: Partial<Intl.DateTimeFormatOptions>
): string {
  const date = toDate(input);
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
    timeZone: timezone,
  });
}

/**
 * Format a date as a short string (e.g., for table columns).
 *
 * @example
 * formatDateShort(new Date(), 'America/New_York')
 * // → "3/15/2026"
 */
export function formatDateShort(input: DateInput, timezone: string = 'Europe/London'): string {
  const date = toDate(input);
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: timezone,
  });
}

/**
 * Format a date as ISO date string in the given timezone (YYYY-MM-DD).
 * Useful for date inputs, grouping by day, and "today" comparisons.
 *
 * @example
 * formatISODate(new Date('2026-03-16T03:00:00Z'), 'America/New_York')
 * // → "2026-03-15" (still March 15 in New York)
 */
export function formatISODate(input: DateInput, timezone: string = 'Europe/London'): string {
  const date = toDate(input);
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

/**
 * Get the start of "today" in a specific timezone as a UTC Date.
 * Critical for "today" boundary queries against UTC-stored timestamps.
 *
 * @example
 * // If it's March 15 at 10pm in New York (March 16 02:00 UTC):
 * startOfDay('America/New_York')
 * // → Date representing "2026-03-15T05:00:00.000Z" (midnight ET in UTC)
 */
export function startOfDay(timezone: string = 'Europe/London', referenceDate?: DateInput): Date {
  const ref = referenceDate ? toDate(referenceDate) : new Date();
  const isoDate = formatISODate(ref, timezone);

  // Compute the UTC offset at the reference time in the target timezone,
  // then construct midnight local as a UTC timestamp.
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Find the UTC offset by comparing what "ref" looks like in UTC vs the timezone
  const utcParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(ref);

  const tzParts = formatter.formatToParts(ref);

  const getPartValue = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

  const utcH = getPartValue(utcParts, 'hour');
  const tzH = getPartValue(tzParts, 'hour');
  const utcM = getPartValue(utcParts, 'minute');
  const tzM = getPartValue(tzParts, 'minute');

  // Offset in minutes: local = UTC + offset → offset = local - UTC
  // Account for day boundaries
  let offsetMinutes = tzH * 60 + tzM - (utcH * 60 + utcM);

  // Handle day-crossing (e.g., UTC 23:00, local 01:00 next day)
  if (offsetMinutes > 720) offsetMinutes -= 1440;
  if (offsetMinutes < -720) offsetMinutes += 1440;

  // midnight local = midnight UTC - offset
  const midnightUtc = new Date(`${isoDate}T00:00:00.000Z`);
  midnightUtc.setUTCMinutes(midnightUtc.getUTCMinutes() - offsetMinutes);

  return midnightUtc;
}

/**
 * Get the end of "today" (start of tomorrow) in a specific timezone as UTC Date.
 */
export function endOfDay(timezone: string = 'Europe/London', referenceDate?: DateInput): Date {
  const start = startOfDay(timezone, referenceDate);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Get the start of the current month in a specific timezone as a UTC Date.
 */
export function startOfMonth(timezone: string = 'Europe/London', referenceDate?: DateInput): Date {
  const ref = referenceDate ? toDate(referenceDate) : new Date();
  const isoDate = formatISODate(ref, timezone);
  const monthStart = `${isoDate.substring(0, 7)}-01`;
  return startOfDay(timezone, new Date(`${monthStart}T12:00:00.000Z`));
}

/**
 * Get the hour of day (0-23) in a specific timezone.
 * Used for greetings ("Good morning/afternoon/evening").
 */
export function getHourInTimezone(
  timezone: string = 'Europe/London',
  referenceDate?: DateInput
): number {
  const ref = referenceDate ? toDate(referenceDate) : new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(ref);

  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  // Intl returns "24" for midnight in some locales when hour12=false
  const hour = parseInt(hourStr, 10);
  return hour === 24 ? 0 : hour;
}

/**
 * Format a time range in a specific timezone.
 *
 * @example
 * formatTimeRange(start, end, 'America/New_York')
 * // → "2:00 PM - 3:30 PM"
 */
export function formatTimeRange(
  start: DateInput,
  end: DateInput,
  timezone: string = 'Europe/London'
): string {
  return `${formatTime(start, timezone)} - ${formatTime(end, timezone)}`;
}

/**
 * Parse an HTML date input value safely.
 * HTML <input type="date"> returns "YYYY-MM-DD" which new Date() parses as UTC midnight.
 * In negative-offset timezones this shows as the previous day.
 * This function creates a date at noon UTC to avoid off-by-one errors.
 */
export function parseDateInputValue(value: string): Date {
  // Append noon UTC to avoid midnight-boundary issues
  return new Date(`${value}T12:00:00.000Z`);
}

/**
 * Get the timezone abbreviation for display (e.g., "EST", "PDT").
 */
export function getTimezoneAbbreviation(
  timezone: string = 'Europe/London',
  referenceDate?: DateInput
): string {
  const ref = referenceDate ? toDate(referenceDate) : new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    timeZoneName: 'short',
  }).formatToParts(ref);

  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone;
}

/**
 * Get a human-readable timezone label.
 *
 * @example
 * getTimezoneLabel('America/New_York')
 * // → "Eastern Time (EST)"
 */
export function getTimezoneLabel(timezone: string): string {
  try {
    const now = new Date();
    const abbr = getTimezoneAbbreviation(timezone, now);
    const longName =
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        timeZoneName: 'long',
      })
        .formatToParts(now)
        .find((p) => p.type === 'timeZoneName')?.value ?? timezone;

    return `${longName} (${abbr})`;
  } catch {
    return timezone;
  }
}
