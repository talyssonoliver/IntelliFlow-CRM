/**
 * Firm availability enforcement (PG-202, ADR-081).
 *
 * Loads a tenant's saved availability and applies the pure domain rules
 * (`AvailabilityPolicy`) to bookings. Called by appointments.create,
 * appointments.reschedule and appointments.findNextSlot. A tenant that never
 * saved availability (`availabilityConfiguredAt` NULL) keeps the legacy rules
 * byte for byte: create/reschedule 07:00-19:00, findNextSlot 09:00-17:00.
 *
 * `prismaWithTenant` does not inject `tenantId`, so every query passes it.
 */
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@intelliflow/db';
import type { CheckConflictsUseCase } from '@intelliflow/application';
import {
  AVAILABILITY_LIMITS,
  CAP_COUNTED_STATUSES,
  INVALID_TIMEZONE_MESSAGE,
  LEGACY_BOOKING_HOURS,
  capCountWindow,
  evaluateAvailability,
  generateCandidates,
  isValidTimezone,
  toZonedParts,
  type AvailabilityRules,
  type Weekday,
} from '@intelliflow/domain';
import { mapErrorToTRPCError } from '../../shared/error-mapper';

export const AVAILABILITY_MIGRATION = '20261017130000_availability';

/** Prisma error codes for a missing table / column: the migration has not been applied yet. */
const MISSING_SCHEMA_CODES = new Set(['P2021', 'P2022']);

export type AvailabilityPrisma = Pick<
  PrismaClient,
  'appointmentSettings' | 'availabilityHour' | 'availabilityClosure' | 'appointment'
>;

export type TenantAvailability =
  | { configured: false }
  | { configured: true; rules: AvailabilityRules };

function prismaCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  return (err as { code?: string }).code;
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function loadTenantAvailability(
  prisma: AvailabilityPrisma,
  tenantId: string
): Promise<TenantAvailability> {
  try {
    const row: unknown = await prisma.appointmentSettings.findUnique({
      where: { tenantId },
      select: { availabilityConfiguredAt: true, defaultTimezone: true, maxDailyBookings: true },
    });
    if (!row || typeof row !== 'object') return { configured: false };
    const settings = row as {
      availabilityConfiguredAt: Date | null;
      defaultTimezone: string;
      maxDailyBookings: number | null;
    };
    if (!settings.availabilityConfiguredAt) return { configured: false };

    const [hours, closures] = await Promise.all([
      prisma.availabilityHour.findMany({
        where: { tenantId },
        select: { weekday: true, startMinute: true, endMinute: true },
      }),
      prisma.availabilityClosure.findMany({
        where: { tenantId },
        select: { startDate: true, endDate: true },
      }),
    ]);
    return {
      configured: true,
      rules: {
        timezone: settings.defaultTimezone,
        weeklyRanges: hours.map((h) => ({
          weekday: h.weekday as Weekday,
          startMinute: h.startMinute,
          endMinute: h.endMinute,
        })),
        closures: closures.map((c) => ({
          startDate: toDateString(c.startDate),
          endDate: toDateString(c.endDate),
        })),
        maxDailyBookings: settings.maxDailyBookings ?? null,
      },
    };
  } catch (err) {
    const code = prismaCode(err);
    if (code && MISSING_SCHEMA_CODES.has(code)) {
      // Deploy-order slip: degrade to today's rule instead of failing every booking.
      console.error(
        `[availability] migration ${AVAILABILITY_MIGRATION} is not applied; using the legacy booking rule`,
        { code }
      );
      return { configured: false };
    }
    throw err;
  }
}

// ── Legacy rule (moved verbatim from appointments.router.ts, PG-202) ────────

function getLocalHour(date: Date, timezone = 'UTC'): number {
  // Use en-GB to get 24-hour format reliably
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(date);
  // en-GB can return "24" for midnight in some engines — normalise
  const hour = Number.parseInt(hourStr, 10);
  return hour === 24 ? 0 : hour;
}

/**
 * Validates that the appointment's start and end fall within business hours
 * (07:00 – 19:00) in the provided timezone. Throws a BAD_REQUEST if outside.
 */
function assertLegacyBusinessHours(startTime: Date, endTime: Date, timezone?: string): void {
  const startHour = getLocalHour(startTime, timezone);
  const endHour = getLocalHour(endTime, timezone);
  const { startHour: open, endHour: close } = LEGACY_BOOKING_HOURS;
  const startWithinDay = startHour >= open && startHour < close;
  // End boundary: end hour == 19 is OK when minutes are 00 (meeting ends at 19:00 sharp)
  const endMinutes = Number.parseInt(
    new Intl.DateTimeFormat('en-GB', {
      minute: '2-digit',
      timeZone: timezone ?? 'UTC',
    }).format(endTime),
    10
  );
  const endWithinDay =
    (endHour >= open && endHour < close) || (endHour === close && endMinutes === 0);

  if (!startWithinDay || !endWithinDay) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Appointments must start and end between ${String(open).padStart(2, '0')}:00 and ${String(
        close
      ).padStart(2, '0')}:00.`,
    });
  }
}

// ── Enforcement ─────────────────────────────────────────────────────────────

/**
 * Rejects a booking (create or reschedule) that falls outside the firm's saved
 * availability. `forceOverrideConflicts` is deliberately not an input: it only
 * bypasses overlap conflicts, never availability (spec AC-015).
 */
export async function assertAppointmentWithinAvailability(
  prisma: AvailabilityPrisma,
  args: {
    tenantId: string;
    start: Date;
    end: Date;
    /** Used only by the legacy rule (create passes input.timezone; reschedule passes none = UTC). */
    legacyTimezone?: string;
    /** Reschedule: the appointment being moved does not count against its own day. */
    excludeAppointmentId?: string;
  }
): Promise<void> {
  const availability = await loadTenantAvailability(prisma, args.tenantId);
  if (!availability.configured) {
    assertLegacyBusinessHours(args.start, args.end, args.legacyTimezone);
    return;
  }
  const { rules } = availability;

  let verdict = evaluateAvailability({
    rules: { ...rules, maxDailyBookings: null },
    start: args.start,
    end: args.end,
  });
  if (verdict.ok && rules.maxDailyBookings !== null) {
    const window = capCountWindow(rules, args.start);
    const sameDayCount = await prisma.appointment.count({
      where: {
        tenantId: args.tenantId,
        status: { in: [...CAP_COUNTED_STATUSES] },
        startTime: { gte: window.startUtc, lt: window.endUtc },
        ...(args.excludeAppointmentId ? { id: { not: args.excludeAppointmentId } } : {}),
      },
    });
    verdict = evaluateAvailability({ rules, start: args.start, end: args.end, sameDayCount });
  }
  if (!verdict.ok) {
    throw new TRPCError({
      code: verdict.code === 'INVALID_TIMEZONE' ? 'PRECONDITION_FAILED' : 'BAD_REQUEST',
      message: verdict.message,
    });
  }
}

interface NextSlotInput {
  tenantId: string;
  rules: AvailabilityRules;
  attendeeId: string;
  startFrom: Date;
  durationMinutes: number;
  maxDaysAhead: number;
  bufferMinutesBefore: number;
  bufferMinutesAfter: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * The first free candidate of one batch: days already at the cap are dropped
 * with one bounded read, then conflicts are checked with one repository read.
 */
async function firstFreeInBatch(
  prisma: AvailabilityPrisma,
  useCase: Pick<CheckConflictsUseCase, 'findFirstFreeCandidate'>,
  input: NextSlotInput,
  batch: Array<{ start: Date; end: Date }>
): Promise<{ start: Date; end: Date } | null> {
  const { rules } = input;
  let candidates = batch;
  const cap = rules.maxDailyBookings;
  if (cap !== null) {
    const booked = await prisma.appointment.findMany({
      where: {
        tenantId: input.tenantId,
        status: { in: [...CAP_COUNTED_STATUSES] },
        startTime: {
          gte: capCountWindow(rules, candidates[0].start).startUtc,
          lt: capCountWindow(rules, candidates[candidates.length - 1].start).endUtc,
        },
      },
      select: { startTime: true },
    });
    const perDay = new Map<string, number>();
    for (const b of booked) {
      const day = toZonedParts(b.startTime, rules.timezone).date;
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    candidates = candidates.filter(
      (c) => (perDay.get(toZonedParts(c.start, rules.timezone).date) ?? 0) < cap
    );
    if (candidates.length === 0) return null;
  }

  const result = await useCase.findFirstFreeCandidate({
    tenantId: input.tenantId,
    attendeeId: input.attendeeId,
    candidates,
    bufferMinutesBefore: input.bufferMinutesBefore,
    bufferMinutesAfter: input.bufferMinutesAfter,
  });
  if (result.isFailure) throw mapErrorToTRPCError(result.error);
  return result.value;
}

/**
 * findNextSlot for a configured tenant: candidates come from the saved hours and
 * closures, in batches of `maxFindNextSlotCandidates` so work per read stays
 * bounded while the search still covers the whole requested horizon. Each batch
 * costs at most two reads (cap and conflicts); a batch shorter than the limit is
 * the last one.
 */
export async function findNextSlotWithinAvailability(
  prisma: AvailabilityPrisma,
  useCase: Pick<CheckConflictsUseCase, 'findFirstFreeCandidate'>,
  input: NextSlotInput
): Promise<{ startTime: Date; endTime: Date; durationMinutes: number } | null> {
  const { rules } = input;
  // Same answer as create and reschedule, instead of silently finding no slot.
  if (!isValidTimezone(rules.timezone)) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: INVALID_TIMEZONE_MESSAGE });
  }
  const limit = AVAILABILITY_LIMITS.maxFindNextSlotCandidates;
  const firstFrom = Math.max(input.startFrom.getTime(), Date.now());
  const horizonEnd = firstFrom + input.maxDaysAhead * MS_PER_DAY;
  let from = firstFrom;
  while (from < horizonEnd) {
    const batch = generateCandidates({
      rules,
      from: new Date(from),
      durationMinutes: input.durationMinutes,
      maxDaysAhead: (horizonEnd - from) / MS_PER_DAY,
      limit,
    });
    if (batch.length === 0) return null;
    const slot = await firstFreeInBatch(prisma, useCase, input, batch);
    if (slot) {
      return { startTime: slot.start, endTime: slot.end, durationMinutes: input.durationMinutes };
    }
    if (batch.length < limit) return null;
    from = batch[batch.length - 1].start.getTime() + 1;
  }
  return null;
}
