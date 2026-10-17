/**
 * Pure draft helpers for the Availability page (PG-202).
 *
 * The page edits one draft (hours + timezone + buffers + cap + closures) and
 * saves it with one `calendar.availability.update`. Weekly hours are local
 * wall-clock times in the firm timezone and are never converted; closures are
 * calendar dates ('YYYY-MM-DD').
 */
import {
  AVAILABILITY_LIMITS,
  LEGACY_BOOKING_HOURS,
  type AvailabilityDto,
  type UpdateAvailabilityInput,
} from '@intelliflow/validators';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Monday first on screen; storage keeps 0 = Sunday. */
export const DISPLAY_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export const DEFAULT_OPEN_RANGE = { start: '09:00', end: '17:00' } as const;

export interface DraftRange {
  key: string;
  start: string;
  end: string;
}

export interface DraftDay {
  weekday: Weekday;
  open: boolean;
  /** Kept while a day is switched off (session only); only open days are saved. */
  ranges: DraftRange[];
}

export interface DraftClosure {
  key: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface AvailabilityDraft {
  timezone: string;
  /** Index = weekday (0 = Sunday). */
  days: DraftDay[];
  bufferBefore: string;
  bufferAfter: string;
  capEnabled: boolean;
  cap: string;
  closures: DraftClosure[];
}

export interface DraftError {
  fieldId: string;
  message: string;
}

let keySeed = 0;
export function newKey(prefix = 'k'): string {
  keySeed += 1;
  return `${prefix}${keySeed}`;
}

export function rangeFieldId(weekday: number, index: number, part: 'start' | 'end'): string {
  return `avail-${weekday}-${index}-${part}`;
}

export function closureFieldId(key: string, part: 'start' | 'end' | 'reason'): string {
  return `closure-${key}-${part}`;
}

export function minutesToTime(minutes: number): string {
  const m = minutes % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 'HH:MM' → minutes. An end of '00:00' means midnight at the end of the day (1440). */
export function timeToMinutes(value: string, role: 'start' | 'end'): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return role === 'end' && total === 0 ? 1440 : total;
}

/**
 * Minutes of a range. An end of '00:00' is midnight (1440) only when the range
 * starts after 00:00, so '00:00'-'00:00' stays an invalid (empty) range.
 */
export function rangeMinutes(range: Pick<DraftRange, 'start' | 'end'>): {
  start: number | null;
  end: number | null;
} {
  const start = timeToMinutes(range.start, 'start');
  const end = timeToMinutes(range.end, 'end');
  return { start, end: end === 1440 && start === 0 ? 0 : end };
}

function timeLabel(minutes: number): string {
  return minutes === 1440 ? 'midnight (end of day)' : minutesToTime(minutes);
}

/** Text summary of a day ("09:00 to 12:00 and 13:00 to 17:00" or "Closed"). */
export function formatDaySummary(day: DraftDay): string {
  if (!day.open || day.ranges.length === 0) return 'Closed';
  return day.ranges
    .map((r) => {
      const { start, end } = rangeMinutes(r);
      return `${start === null ? r.start : timeLabel(start)} to ${end === null ? r.end : timeLabel(end)}`;
    })
    .join(' and ');
}

const CLOSURE_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Calendar date → '24 Dec 2026', formatted in UTC so no viewer zone can shift the day. */
export function formatClosureDate(value: string): string {
  return CLOSURE_DATE_FORMAT.format(new Date(`${value}T00:00:00.000Z`));
}

export function prefillLegacyDays(): DraftDay[] {
  const start = minutesToTime(LEGACY_BOOKING_HOURS.startHour * 60);
  const end = minutesToTime(LEGACY_BOOKING_HOURS.endHour * 60);
  return ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((weekday) => ({
    weekday,
    open: true,
    ranges: [{ key: newKey('r'), start, end }],
  }));
}

export function toDraft(dto: AvailabilityDto): AvailabilityDraft {
  const days: DraftDay[] = dto.isConfigured
    ? ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((weekday) => {
        const ranges = (dto.days.find((d) => d.weekday === weekday)?.ranges ?? []).map((r) => ({
          key: newKey('r'),
          start: minutesToTime(r.startMinute),
          end: minutesToTime(r.endMinute),
        }));
        return { weekday, open: ranges.length > 0, ranges };
      })
    : prefillLegacyDays();
  return {
    timezone: dto.timezone,
    days,
    bufferBefore: String(dto.bufferBeforeMinutes),
    bufferAfter: String(dto.bufferAfterMinutes),
    capEnabled: dto.maxDailyBookings !== null,
    cap: dto.maxDailyBookings === null ? '' : String(dto.maxDailyBookings),
    closures: dto.closures.map((c) => ({
      key: newKey('c'),
      startDate: c.startDate,
      endDate: c.endDate,
      reason: c.reason ?? '',
    })),
  };
}

/** The payload that will be sent: open days only, client keys stripped. Assumes `validateDraft` passed. */
export function toUpdateInput(draft: AvailabilityDraft): UpdateAvailabilityInput {
  return {
    timezone: draft.timezone,
    days: draft.days.map((day) => ({
      weekday: day.weekday,
      ranges: day.open
        ? day.ranges.map((r) => {
            const { start, end } = rangeMinutes(r);
            return { startMinute: start ?? 0, endMinute: end ?? 0 };
          })
        : [],
    })),
    bufferBeforeMinutes: Number(draft.bufferBefore),
    bufferAfterMinutes: Number(draft.bufferAfter),
    maxDailyBookings: draft.capEnabled ? Number(draft.cap) : null,
    closures: draft.closures.map((c) => ({
      startDate: c.startDate,
      endDate: c.endDate,
      reason: c.reason.trim() ? c.reason.trim() : null,
    })),
  };
}

/** Stable comparison of what would be sent (hidden ranges of closed days are ignored). */
export function normalize(draft: AvailabilityDraft): string {
  return JSON.stringify({
    timezone: draft.timezone,
    days: draft.days.map((d) => (d.open ? d.ranges.map((r) => [r.start, r.end]) : [])),
    bufferBefore: draft.bufferBefore.trim(),
    bufferAfter: draft.bufferAfter.trim(),
    cap: draft.capEnabled ? draft.cap.trim() : null,
    closures: draft.closures.map((c) => [c.startDate, c.endDate, c.reason.trim()]),
  });
}

function isIntegerIn(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value.trim())) return false;
  const n = Number(value);
  return n >= min && n <= max;
}

function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000
  );
}

function validateDays(draft: AvailabilityDraft): DraftError[] {
  const errors: DraftError[] = [];
  for (const weekday of DISPLAY_ORDER) {
    const day = draft.days[weekday];
    if (!day?.open) continue;
    const name = WEEKDAY_NAMES[weekday];
    const valid: Array<{ index: number; start: number; end: number }> = [];
    day.ranges.forEach((range, index) => {
      const label = `${name} range ${index + 1}`;
      const { start, end } = rangeMinutes(range);
      if (start === null) {
        errors.push({
          fieldId: rangeFieldId(weekday, index, 'start'),
          message: `Enter a start time for ${label}`,
        });
      }
      if (end === null) {
        errors.push({
          fieldId: rangeFieldId(weekday, index, 'end'),
          message: `Enter an end time for ${label}`,
        });
      }
      if (start === null || end === null) return;
      if (end <= start) {
        errors.push({
          fieldId: rangeFieldId(weekday, index, 'end'),
          message: `${label} must end after it starts`,
        });
        return;
      }
      const overlap = valid.find((v) => start < v.end && v.start < end);
      if (overlap) {
        errors.push({
          fieldId: rangeFieldId(weekday, index, 'start'),
          message: `${label} overlaps range ${overlap.index + 1}`,
        });
        return;
      }
      valid.push({ index, start, end });
    });
  }
  return errors;
}

function validateClosures(draft: AvailabilityDraft): DraftError[] {
  const errors: DraftError[] = [];
  const { minClosureDate, maxClosureDate, maxClosureDays, maxReasonLength } = AVAILABILITY_LIMITS;
  const valid: Array<{ index: number; startDate: string; endDate: string }> = [];
  draft.closures.forEach((closure, index) => {
    const n = index + 1;
    let datesOk = true;
    if (!closure.startDate) {
      errors.push({
        fieldId: closureFieldId(closure.key, 'start'),
        message: `Enter a start date for closure ${n}`,
      });
      datesOk = false;
    }
    if (!closure.endDate) {
      errors.push({
        fieldId: closureFieldId(closure.key, 'end'),
        message: `Enter an end date for closure ${n}`,
      });
      datesOk = false;
    }
    if (datesOk) {
      const outOfBounds = [closure.startDate, closure.endDate].some(
        (d) => d < minClosureDate || d > maxClosureDate
      );
      if (outOfBounds) {
        errors.push({
          fieldId: closureFieldId(closure.key, 'start'),
          message: `Closure ${n} dates must be between ${minClosureDate} and ${maxClosureDate}`,
        });
        datesOk = false;
      } else if (closure.endDate < closure.startDate) {
        errors.push({
          fieldId: closureFieldId(closure.key, 'end'),
          message: `Closure ${n} must end on or after its start date`,
        });
        datesOk = false;
      } else if (daysBetween(closure.startDate, closure.endDate) + 1 > maxClosureDays) {
        errors.push({
          fieldId: closureFieldId(closure.key, 'end'),
          message: `Closure ${n} can span at most ${maxClosureDays} days`,
        });
        datesOk = false;
      }
    }
    if (closure.reason.trim().length > maxReasonLength) {
      errors.push({
        fieldId: closureFieldId(closure.key, 'reason'),
        message: `Closure ${n} reason can be at most ${maxReasonLength} characters`,
      });
    }
    if (!datesOk) return;
    const overlap = valid.find(
      (v) => closure.startDate <= v.endDate && v.startDate <= closure.endDate
    );
    if (overlap) {
      errors.push({
        fieldId: closureFieldId(closure.key, 'start'),
        message: `Closure ${n} overlaps closure ${overlap.index + 1}`,
      });
      return;
    }
    valid.push({ index, startDate: closure.startDate, endDate: closure.endDate });
  });
  return errors;
}

/** Client checks, returned in DOM order: weekly hours, timezone, closures, buffers. */
export function validateDraft(draft: AvailabilityDraft): DraftError[] {
  const errors = validateDays(draft);
  if (!draft.timezone) {
    errors.push({ fieldId: 'availability-timezone', message: 'Choose a valid timezone' });
  }
  errors.push(...validateClosures(draft));
  for (const [field, fieldId] of [
    ['bufferBefore', 'buffer-before'],
    ['bufferAfter', 'buffer-after'],
  ] as const) {
    if (!isIntegerIn(draft[field], 0, 240))
      errors.push({ fieldId, message: 'Enter 0 to 240 minutes' });
  }
  if (draft.capEnabled && !isIntegerIn(draft.cap, 1, AVAILABILITY_LIMITS.maxDailyBookings)) {
    errors.push({
      fieldId: 'cap-max',
      message: `Enter a number from 1 to ${AVAILABILITY_LIMITS.maxDailyBookings}`,
    });
  }
  return errors;
}

const CLOSURE_ISSUE_PARTS: Record<string, 'end' | 'reason'> = { endDate: 'end', reason: 'reason' };

/** Maps a server Zod issue path (days are Sunday-first) to the field it concerns. */
export function issuePathToFieldId(
  path: ReadonlyArray<PropertyKey>,
  draft: AvailabilityDraft
): string | null {
  const [head, index, , rangeIndex, field] = path;
  if (head === 'days' && typeof index === 'number' && typeof rangeIndex === 'number') {
    return rangeFieldId(index, rangeIndex, field === 'endMinute' ? 'end' : 'start');
  }
  if (head === 'closures' && typeof index === 'number') {
    const closure = draft.closures[index];
    if (!closure) return null;
    return closureFieldId(closure.key, CLOSURE_ISSUE_PARTS[String(path[2])] ?? 'start');
  }
  const simple: Record<string, string> = {
    bufferBeforeMinutes: 'buffer-before',
    bufferAfterMinutes: 'buffer-after',
    maxDailyBookings: 'cap-max',
    timezone: 'availability-timezone',
  };
  return typeof head === 'string' ? (simple[head] ?? null) : null;
}
