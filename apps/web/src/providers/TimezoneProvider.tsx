'use client';

/**
 * Timezone Context Provider
 *
 * Makes the user's timezone available to all child components via context.
 * Wraps the useTimezone hook so components can access timezone without
 * individually querying the user profile.
 *
 * Usage:
 *   const { timezone, formatDate, formatTime, formatDateTime } = useTimezoneContext();
 *
 * The provider also exposes pre-bound formatting functions so consumers
 * don't need to pass timezone to every call.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTimezone } from '@/hooks/useTimezone';
import {
  formatDate as rawFormatDate,
  formatTime as rawFormatTime,
  formatDateTime as rawFormatDateTime,
  formatDateShort as rawFormatDateShort,
  formatISODate as rawFormatISODate,
  formatTimeRange as rawFormatTimeRange,
  getTimezoneAbbreviation,
  getTimezoneLabel,
  type DateInput,
} from '@/lib/shared/timezone-utils';

export interface TimezoneContextValue {
  /** User's IANA timezone (e.g., "America/New_York") */
  timezone: string;
  /** Whether timezone is still loading */
  isLoading: boolean;
  /** Browser-detected timezone */
  browserTimezone: string;
  /** Timezone abbreviation (e.g., "EST") */
  timezoneAbbr: string;
  /** Human-readable timezone label */
  timezoneLabel: string;

  // Pre-bound formatting functions (use user's timezone automatically)
  formatDate: (
    input: DateInput,
    options?: Partial<Pick<Intl.DateTimeFormatOptions, 'weekday' | 'year' | 'month' | 'day'>>
  ) => string;
  formatTime: (
    input: DateInput,
    options?: Partial<Pick<Intl.DateTimeFormatOptions, 'hour12' | 'second'>>
  ) => string;
  formatDateTime: (input: DateInput, options?: Partial<Intl.DateTimeFormatOptions>) => string;
  formatDateShort: (input: DateInput) => string;
  formatISODate: (input: DateInput) => string;
  formatTimeRange: (start: DateInput, end: DateInput) => string;
}

const UTC_FALLBACK: TimezoneContextValue = {
  timezone: 'Europe/London',
  isLoading: false,
  browserTimezone: 'UTC',
  timezoneAbbr: getTimezoneAbbreviation('Europe/London'),
  timezoneLabel: getTimezoneLabel('Europe/London'),
  formatDate: (input, options) => rawFormatDate(input, 'Europe/London', options),
  formatTime: (input, options) => rawFormatTime(input, 'Europe/London', options),
  formatDateTime: (input, options) => rawFormatDateTime(input, 'Europe/London', options),
  formatDateShort: (input) => rawFormatDateShort(input, 'Europe/London'),
  formatISODate: (input) => rawFormatISODate(input, 'Europe/London'),
  formatTimeRange: (start, end) => rawFormatTimeRange(start, end, 'Europe/London'),
};

const TimezoneContext = createContext<TimezoneContextValue>(UTC_FALLBACK);

export function TimezoneProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { timezone, isLoading, browserTimezone } = useTimezone();

  const value = useMemo<TimezoneContextValue>(
    () => ({
      timezone,
      isLoading,
      browserTimezone,
      timezoneAbbr: getTimezoneAbbreviation(timezone),
      timezoneLabel: getTimezoneLabel(timezone),

      formatDate: (input, options) => rawFormatDate(input, timezone, options),
      formatTime: (input, options) => rawFormatTime(input, timezone, options),
      formatDateTime: (input, options) => rawFormatDateTime(input, timezone, options),
      formatDateShort: (input) => rawFormatDateShort(input, timezone),
      formatISODate: (input) => rawFormatISODate(input, timezone),
      formatTimeRange: (start, end) => rawFormatTimeRange(start, end, timezone),
    }),
    [timezone, isLoading, browserTimezone]
  );

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}

/**
 * Access the timezone context.
 * Must be used within a TimezoneProvider.
 *
 * @example
 * const { formatDate, timezone } = useTimezoneContext();
 * return <span>{formatDate(appointment.startTime)}</span>;
 */
export function useTimezoneContext(): TimezoneContextValue {
  return useContext(TimezoneContext);
}
