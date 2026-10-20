/**
 * Firm availability validators (PG-202, ADR-081).
 *
 * Weekly hours are local minutes-of-day in the firm timezone; closures are
 * inclusive 'YYYY-MM-DD' calendar dates. Limits come from the domain so the
 * validators, the UI and the DB CHECKs agree.
 */
import { z } from 'zod';
import {
  AVAILABILITY_LIMITS,
  LEGACY_BOOKING_HOURS,
  canonicalTimezone,
  isValidTimezone,
} from '@intelliflow/domain';

export { AVAILABILITY_LIMITS, LEGACY_BOOKING_HOURS };

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const DAY_MS = 86_400_000;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, 'Not a real date')
  .refine(
    (value) =>
      value >= AVAILABILITY_LIMITS.minClosureDate && value <= AVAILABILITY_LIMITS.maxClosureDate,
    `Dates must be between ${AVAILABILITY_LIMITS.minClosureDate} and ${AVAILABILITY_LIMITS.maxClosureDate}`
  );

function daysBetween(start: string, end: string): number {
  const [ys, ms, ds] = start.split('-').map(Number);
  const [ye, me, de] = end.split('-').map(Number);
  return Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / DAY_MS);
}

export const availabilityRangeSchema = z
  .object({
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((r) => r.startMinute < r.endMinute, {
    message: 'A range must end after it starts',
    path: ['endMinute'],
  });

export const availabilityDaySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  ranges: z.array(availabilityRangeSchema).max(AVAILABILITY_LIMITS.maxRangesPerWeekday),
});

export const availabilityClosureInputSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    reason: z
      .string()
      .trim()
      .max(AVAILABILITY_LIMITS.maxReasonLength)
      .nullish()
      .transform((value) => (value ? value : null)),
  })
  .superRefine((c, ctx) => {
    if (c.endDate < c.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'A closure must end on or after its start date',
      });
    } else if (daysBetween(c.startDate, c.endDate) + 1 > AVAILABILITY_LIMITS.maxClosureDays) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: `A closure can span at most ${AVAILABILITY_LIMITS.maxClosureDays} days`,
      });
    }
  });

const timezoneSchema = z
  .string()
  .refine((value) => isValidTimezone(value), 'Choose a valid timezone')
  .transform((value) => canonicalTimezone(value));

export const updateAvailabilitySchema = z
  .object({
    timezone: timezoneSchema,
    days: z.array(availabilityDaySchema).length(7),
    bufferBeforeMinutes: z.number().int().min(0).max(240),
    bufferAfterMinutes: z.number().int().min(0).max(240),
    maxDailyBookings: z.number().int().min(1).max(AVAILABILITY_LIMITS.maxDailyBookings).nullable(),
    closures: z.array(availabilityClosureInputSchema).max(AVAILABILITY_LIMITS.maxClosures),
  })
  .superRefine((input, ctx) => {
    const seen = new Set<number>();
    input.days.forEach((day, dayIndex) => {
      if (seen.has(day.weekday)) {
        ctx.addIssue({
          code: 'custom',
          path: ['days', dayIndex, 'weekday'],
          message: 'Each weekday may appear once',
        });
      }
      seen.add(day.weekday);
      // Overlap (touching allowed), reported on the later range in start order.
      const order = day.ranges
        .map((range, index) => ({ range, index }))
        .sort((a, b) => a.range.startMinute - b.range.startMinute || a.index - b.index);
      for (let i = 1; i < order.length; i++) {
        const prev = order[i - 1];
        const cur = order[i];
        if (cur.range.startMinute < prev.range.endMinute) {
          ctx.addIssue({
            code: 'custom',
            path: ['days', dayIndex, 'ranges', cur.index, 'startMinute'],
            message: `${WEEKDAY_NAMES[day.weekday] ?? 'Day'} range ${cur.index + 1} overlaps range ${prev.index + 1}`,
          });
        }
      }
    });

    const closures = input.closures
      .map((closure, index) => ({ closure, index }))
      .sort((a, b) => a.closure.startDate.localeCompare(b.closure.startDate) || a.index - b.index);
    for (let i = 1; i < closures.length; i++) {
      const prev = closures[i - 1];
      const cur = closures[i];
      if (cur.closure.startDate <= prev.closure.endDate) {
        ctx.addIssue({
          code: 'custom',
          path: ['closures', cur.index, 'startDate'],
          message: `Closure ${cur.index + 1} overlaps closure ${prev.index + 1}`,
        });
      }
    }
  });

export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;

export interface AvailabilityRangeDto {
  startMinute: number;
  endMinute: number;
}

export interface AvailabilityDayDto {
  weekday: number;
  /** Empty = closed that weekday. */
  ranges: AvailabilityRangeDto[];
}

export interface AvailabilityClosureDto {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface AvailabilityDto {
  isConfigured: boolean;
  timezone: string;
  /** Always seven entries, Sunday (0) to Saturday (6). */
  days: AvailabilityDayDto[];
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  maxDailyBookings: number | null;
  closures: AvailabilityClosureDto[];
  canEdit: boolean;
}
