/**
 * PG-203 — open booking slots for a public event type (ADR-083).
 *
 * Composes the PG-202 `generateCandidates` (weekly ranges, closures, one range
 * per local day, DST-safe grid) and then removes what a public visitor may not
 * book: slots inside the notice window or past the horizon, slots whose
 * buffered window overlaps the host's busy time, and days at the daily cap.
 *
 * The overlap rule matches `ConflictDetector`: each side is widened by its own
 * buffers and two windows conflict when `a.start < b.end && a.end > b.start`
 * (touching windows do not conflict).
 *
 * Pure: `now` is a parameter, so nothing here reads the wall clock.
 */
import {
  generateCandidates,
  localDayBoundsUtc,
  toZonedParts,
  type AvailabilityRules,
  type CandidateSlot,
} from './AvailabilityPolicy';
import {
  BOOKING_HORIZON_DAYS,
  BOOKING_MAX_SLOTS_PER_DAY,
  BOOKING_NOTICE_MINUTES,
  BOOKING_SLOT_STEP_MINUTES,
} from './event-types';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** An existing appointment of the host, with its own buffers. */
export interface BusyInterval {
  start: Date;
  end: Date;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

export interface DaySlots {
  /** 'YYYY-MM-DD' in the firm timezone. */
  date: string;
  slots: CandidateSlot[];
}

export interface ListOpenSlotsInput {
  rules: AvailabilityRules;
  /** First day to list, 'YYYY-MM-DD' in the firm timezone. */
  fromDate: string;
  days: number;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  busy: readonly BusyInterval[];
  /** Cap-counted bookings already on each local day. */
  bookedPerDay: Readonly<Record<string, number>>;
  now: Date;
  noticeMinutes?: number;
  horizonDays?: number;
  stepMinutes?: number;
  maxPerDay?: number;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function overlapsBusy(start: number, end: number, busy: readonly BusyInterval[]): boolean {
  return busy.some((b) => {
    const busyStart = b.start.getTime() - b.bufferBeforeMinutes * MS_PER_MINUTE;
    const busyEnd = b.end.getTime() + b.bufferAfterMinutes * MS_PER_MINUTE;
    return start < busyEnd && end > busyStart;
  });
}

export function listOpenSlots(input: ListOpenSlotsInput): DaySlots[] {
  const {
    rules,
    fromDate,
    days,
    durationMinutes,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    busy,
    bookedPerDay,
    now,
  } = input;
  const notice = input.noticeMinutes ?? BOOKING_NOTICE_MINUTES;
  const horizonDays = input.horizonDays ?? BOOKING_HORIZON_DAYS;
  const step = input.stepMinutes ?? BOOKING_SLOT_STEP_MINUTES;
  const maxPerDay = input.maxPerDay ?? BOOKING_MAX_SLOTS_PER_DAY;

  const dates = Array.from({ length: Math.max(0, days) }, (_, i) => addDays(fromDate, i));
  const result: DaySlots[] = dates.map((date) => ({ date, slots: [] }));
  if (dates.length === 0 || durationMinutes <= 0) return result;

  const byDate = new Map(result.map((d) => [d.date, d]));
  const windowStart = localDayBoundsUtc(fromDate, rules.timezone).startUtc.getTime();
  const windowEnd = localDayBoundsUtc(dates.at(-1)!, rules.timezone).endUtc.getTime();
  const earliest = Math.max(windowStart, now.getTime() + notice * MS_PER_MINUTE);
  const latest = Math.min(windowEnd, now.getTime() + horizonDays * MS_PER_DAY);
  if (earliest >= latest) return result;

  const candidates = generateCandidates({
    rules,
    from: new Date(earliest),
    durationMinutes,
    stepMinutes: step,
    maxDaysAhead: days + 1,
    limit: (days + 1) * Math.ceil(1440 / step),
  });

  for (const slot of candidates) {
    const start = slot.start.getTime();
    if (start >= latest) break;
    const day = byDate.get(toZonedParts(slot.start, rules.timezone).date);
    if (!day || day.slots.length >= maxPerDay) continue;
    if (
      rules.maxDailyBookings !== null &&
      (bookedPerDay[day.date] ?? 0) >= rules.maxDailyBookings
    ) {
      continue;
    }
    const effectiveStart = start - bufferBeforeMinutes * MS_PER_MINUTE;
    const effectiveEnd = slot.end.getTime() + bufferAfterMinutes * MS_PER_MINUTE;
    if (overlapsBusy(effectiveStart, effectiveEnd, busy)) continue;
    day.slots.push(slot);
  }
  return result;
}
