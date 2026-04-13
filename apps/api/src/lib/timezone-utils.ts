/**
 * Server-side timezone utilities for IntelliFlow CRM API.
 *
 * Provides timezone-aware "today" boundaries and date formatting
 * for use in tRPC routers and services. All functions produce
 * UTC Date objects suitable for Prisma DateTime queries.
 *
 * @module api/timezone-utils
 */

export type DateInput = Date | string | number;

function toDate(input: DateInput): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

/**
 * Validate and normalize a timezone string.
 * Returns the timezone if valid, or 'UTC' as fallback.
 */
export function safeTimezone(timezone: string | undefined | null): string {
  if (!timezone) return 'UTC';
  try {
    // Intl.DateTimeFormat throws RangeError for invalid timezones
    Intl.DateTimeFormat('en-GB', { timeZone: timezone });
    return timezone;
  } catch {
    return 'UTC';
  }
}

/**
 * Get the ISO date string (YYYY-MM-DD) for a given moment in a specific timezone.
 */
export function formatISODateInTimezone(
  input: DateInput,
  timezone: string = 'Europe/London'
): string {
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
 * Get the start of "today" in the user's timezone as a UTC Date.
 *
 * Replaces the anti-pattern:
 *   new Date(now.getFullYear(), now.getMonth(), now.getDate())
 * which uses server local time instead of the user's timezone.
 *
 * @example
 * // User in New York, server in UTC
 * // It's 11pm March 15 in New York (March 16 04:00 UTC)
 * startOfDayInTimezone('America/New_York')
 * // → Date("2026-03-15T05:00:00.000Z") — midnight ET as UTC
 */
export function startOfDayInTimezone(
  timezone: string = 'Europe/London',
  referenceDate?: DateInput
): Date {
  const ref = referenceDate ? toDate(referenceDate) : new Date();
  const isoDate = formatISODateInTimezone(ref, timezone);

  // Compute the UTC offset at the reference time in the target timezone
  const offsetMinutes = getTimezoneOffsetMinutes(ref, timezone);

  // Midnight local = midnight UTC - offset
  const midnightUtc = new Date(`${isoDate}T00:00:00.000Z`);
  midnightUtc.setUTCMinutes(midnightUtc.getUTCMinutes() - offsetMinutes);

  return midnightUtc;
}

/**
 * Get the end of "today" (start of tomorrow) in the user's timezone as a UTC Date.
 */
export function endOfDayInTimezone(
  timezone: string = 'Europe/London',
  referenceDate?: DateInput
): Date {
  const start = startOfDayInTimezone(timezone, referenceDate);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Get the start of the current month in a timezone as a UTC Date.
 *
 * Replaces:
 *   new Date(now.getFullYear(), now.getMonth(), 1)
 */
export function startOfMonthInTimezone(
  timezone: string = 'Europe/London',
  referenceDate?: DateInput
): Date {
  const ref = referenceDate ? toDate(referenceDate) : new Date();
  const isoDate = formatISODateInTimezone(ref, timezone);
  const monthStart = `${isoDate.substring(0, 7)}-01`;
  return startOfDayInTimezone(timezone, new Date(`${monthStart}T12:00:00.000Z`));
}

/**
 * Get the hour of day (0-23) in a specific timezone.
 * Replaces the home.router.ts getGreeting() Intl usage.
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
  const hour = parseInt(hourStr, 10);
  return hour === 24 ? 0 : hour;
}

/**
 * Format a date for display in a specific timezone (server-side rendering).
 * Used by email/reminder services that format dates outside of React.
 */
export function formatDateTimeInTimezone(
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
 * Calculate the UTC offset in minutes for a timezone at a given moment.
 * Positive = ahead of UTC, negative = behind UTC.
 *
 * Uses Intl.DateTimeFormat to determine the offset without any
 * dependency on the server's local timezone setting.
 */
function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  const utcParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const tzParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const getPartValue = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

  const utcH = getPartValue(utcParts, 'hour');
  const utcM = getPartValue(utcParts, 'minute');
  const tzH = getPartValue(tzParts, 'hour');
  const tzM = getPartValue(tzParts, 'minute');

  let offsetMinutes = tzH * 60 + tzM - (utcH * 60 + utcM);

  // Handle day-crossing
  if (offsetMinutes > 720) offsetMinutes -= 1440;
  if (offsetMinutes < -720) offsetMinutes += 1440;

  return offsetMinutes;
}
