/**
 * Public Booking Router — PG-203 (owner rulings Q1-Q12, runner R1-R7, ADR-083).
 *
 * The app's first UNAUTHENTICATED write: an anonymous visitor books a slot with
 * an event type's host at /book/<bookingHandle>/<slug>.
 *
 *   - Tenant scope comes ONLY from the booking handle (tenants.bookingHandle,
 *     unique), never a tenantId/hostId/leadId from the body (the schemas are
 *     strict). Every later query passes the resolved tenantId.
 *   - Unknown handle or slug, inactive type, firm without saved availability and
 *     a host who left the firm all return the same NOT_FOUND after the same four
 *     reads (no enumeration).
 *   - The booking re-checks the slot inside one transaction that sets
 *     app.current_tenant_id locally, bounds lock waits, and takes a per-tenant
 *     advisory lock, so two PUBLIC bookings of one slot (or of the last slot
 *     under the daily cap) cannot both win. In-app appointments.create does not
 *     take this lock: the host is still never double-booked (the
 *     appointments_no_overlap_per_organizer constraint), but a staff create racing
 *     a public booking can exceed the daily cap by one (ADR-081 best-effort cap;
 *     the locked in-app fix is gh #913).
 *   - Abuse caps are counted from booking_attempts (salted hashes only); the
 *     count and the insert of an attempt run under a per-tenant advisory lock in
 *     their own short transaction, so concurrent requests cannot all pass a cap,
 *     and the attempt stays counted even when the booking itself fails.
 *   - Inside the booking transaction the event type, settings and host are
 *     resolved again after the lock; event-type writes take the same lock, so a
 *     type disabled or re-hosted mid-booking is never booked with stale config.
 *   - An existing lead or contact is never linked or modified from anonymous input
 *     (owner Q11); a new lead is created through LeadService on the booking
 *     transaction, LeadCreated is published on the container's event bus, and the
 *     lead is always AI-scored (owner Q8/Q9).
 *   - Emails and side effects run after commit and never fail the booking.
 *   - Errors are generic: no database message ever reaches the visitor.
 *
 * The appointment is written with tx.appointment.create directly: the repository
 * and ScheduleAppointmentUseCase open their own transaction and do not map the
 * booking columns (ADR-083 exception).
 */
import { TRPCError } from '@trpc/server';
import { tenantUserWhere } from '@intelliflow/db';
import {
  BOOKING_CONSENT_VERSION,
  BOOKING_HORIZON_DAYS,
  CAP_COUNTED_STATUSES,
  PhoneNumber,
  listOpenSlots,
  localDayBoundsUtc,
  splitBookerName,
  toZonedParts,
  type AvailabilityRules,
  type BusyInterval,
  type DaySlots,
  type EventLocationType,
  type EventTypeRequiredField,
  type RepositoryTransaction,
} from '@intelliflow/domain';
import {
  publicBookInputSchema,
  publicBookingLookupSchema,
  publicSlotsInputSchema,
  type PublicBookAnswers,
  type PublicBookResultDto,
  type PublicEventTypeDto,
  type PublicSlotsDto,
} from '@intelliflow/validators';
import { createTRPCRouter, publicProcedure } from '../../trpc';
import type { Context } from '../../context';
import { extractClientIp } from '../public-feedback/public-feedback.router';
import { loadTenantAvailability, type AvailabilityPrisma } from './availability-enforcement';
import {
  assertBookingCaps,
  assertEventTypeBookingCap,
  bookingSlotsLimiter,
  getBookingSalt,
  hashBookingValue,
  normalizeEmailForCap,
  pruneBookingAttempts,
  recordBookingAttempt,
} from './booking-abuse';
import { sendBookingEmails } from './booking-email';
import { enqueueLeadScoring } from '../lead/lead-scoring-enqueue';
import { onAppointmentCreated } from '../legal/appointment-side-effects';

const NOT_AVAILABLE = 'This booking page is not available.';
const SLOT_TAKEN = 'That time is no longer available. Please pick another.';
const TRY_AGAIN = 'Please try again.';
const REQUIRED_MISSING = 'Please complete all required fields.';
const CHECK_DETAILS = 'Please check your details and try again.';
const OUT_OF_WINDOW = 'Choose a date within the booking window.';
const FAILED = 'We could not complete your booking. Please try again.';

/** Placeholder id for the reads that run even when the lookup found nothing (same call shape). */
const NONE = '__none__';
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const TITLE_MAX = 200;

type Db = Context['prisma'];
type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];
type Reader = Db | Tx;

interface Bookable {
  eventType: {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    colorToken: string;
    locationType: EventLocationType;
    locationDetails: string | null;
    appointmentType: string;
    hostUserId: string;
    requiredFields: string[];
    leadSource: string;
    tenant: { name: string; bookingPrivacyUrl: string | null };
  };
  settings: {
    defaultTimezone: string;
    defaultBufferBeforeMinutes: number;
    defaultBufferAfterMinutes: number;
    defaultReminderMinutes: number | null;
  };
}

function notAvailable(): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: NOT_AVAILABLE });
}

/**
 * The single public lookup. Always four reads (the firm by handle, its active
 * event type by slug, the firm's settings, the host's membership), whatever the
 * outcome, so a miss is indistinguishable from any other "not available" case.
 * (Tenant reverse relations are @ignore'd, so the handle cannot be joined in.)
 */
async function resolveBookable(db: Reader, handle: string, slug: string): Promise<Bookable> {
  const tenant = await db.tenant.findUnique({
    where: { bookingHandle: handle },
    select: { id: true, name: true, bookingPrivacyUrl: true },
  });
  const found = await db.eventType.findFirst({
    where: { tenantId: tenant?.id ?? NONE, slug, isActive: true },
    select: {
      id: true,
      tenantId: true,
      name: true,
      description: true,
      durationMinutes: true,
      colorToken: true,
      locationType: true,
      locationDetails: true,
      appointmentType: true,
      hostUserId: true,
      requiredFields: true,
      leadSource: true,
    },
  });
  const eventType =
    found && tenant
      ? { ...found, tenant: { name: tenant.name, bookingPrivacyUrl: tenant.bookingPrivacyUrl } }
      : null;
  const tenantId = eventType?.tenantId ?? NONE;
  const [settings, hostCount] = await Promise.all([
    db.appointmentSettings.findUnique({
      where: { tenantId },
      select: {
        availabilityConfiguredAt: true,
        defaultTimezone: true,
        defaultBufferBeforeMinutes: true,
        defaultBufferAfterMinutes: true,
        defaultReminderMinutes: true,
      },
    }),
    db.user.count({ where: { id: eventType?.hostUserId ?? NONE, ...tenantUserWhere(tenantId) } }),
  ]);
  if (!eventType || !settings?.availabilityConfiguredAt || hostCount === 0) notAvailable();
  return { eventType: eventType as unknown as Bookable['eventType'], settings };
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Open slots for `days` local days from `fromDate`: firm rules minus the host's busy time. */
async function computeSlots(
  db: Reader,
  bookable: Bookable,
  rules: AvailabilityRules,
  fromDate: string,
  days: number,
  now: Date
): Promise<DaySlots[]> {
  const { eventType, settings } = bookable;
  const windowStart = new Date(
    localDayBoundsUtc(fromDate, rules.timezone).startUtc.getTime() - MS_PER_DAY
  );
  const windowEnd = new Date(
    localDayBoundsUtc(addDays(fromDate, days - 1), rules.timezone).endUtc.getTime() + MS_PER_DAY
  );
  const busyRows = await db.appointment.findMany({
    where: {
      tenantId: eventType.tenantId,
      status: { in: [...CAP_COUNTED_STATUSES] },
      startTime: { lt: windowEnd },
      endTime: { gt: windowStart },
      OR: [
        { organizerId: eventType.hostUserId },
        { attendees: { some: { userId: eventType.hostUserId } } },
      ],
    },
    select: { startTime: true, endTime: true, bufferMinutesBefore: true, bufferMinutesAfter: true },
  });
  const busy: BusyInterval[] = busyRows.map((b) => ({
    start: b.startTime,
    end: b.endTime,
    bufferBeforeMinutes: b.bufferMinutesBefore,
    bufferAfterMinutes: b.bufferMinutesAfter,
  }));

  const bookedPerDay: Record<string, number> = {};
  if (rules.maxDailyBookings !== null) {
    const booked = await db.appointment.findMany({
      where: {
        tenantId: eventType.tenantId,
        status: { in: [...CAP_COUNTED_STATUSES] },
        startTime: { gte: windowStart, lt: windowEnd },
      },
      select: { startTime: true },
    });
    for (const b of booked) {
      const day = toZonedParts(b.startTime, rules.timezone).date;
      bookedPerDay[day] = (bookedPerDay[day] ?? 0) + 1;
    }
  }

  return listOpenSlots({
    rules,
    fromDate,
    days,
    durationMinutes: eventType.durationMinutes,
    bufferBeforeMinutes: settings.defaultBufferBeforeMinutes,
    bufferAfterMinutes: settings.defaultBufferAfterMinutes,
    busy,
    bookedPerDay,
    now,
  });
}

async function loadRules(db: Reader, tenantId: string): Promise<AvailabilityRules> {
  const availability = await loadTenantAvailability(db as unknown as AvailabilityPrisma, tenantId);
  if (!availability.configured) notAvailable();
  return availability.rules;
}

function assertRequiredAnswers(eventType: Bookable['eventType'], answers: PublicBookAnswers): void {
  const missing = (eventType.requiredFields as EventTypeRequiredField[]).filter(
    (field) => !answers[field]?.trim()
  );
  if (missing.length > 0) throw new TRPCError({ code: 'BAD_REQUEST', message: REQUIRED_MISSING });
}

function ipHashOf(ctx: Context, salt: string): string {
  return hashBookingValue(extractClientIp(ctx.req as Request | undefined), salt);
}

function bookingAnswers(answers: PublicBookAnswers): PublicBookAnswers | null {
  const out: PublicBookAnswers = {};
  if (answers.phone) out.phone = answers.phone;
  if (answers.company) out.company = answers.company;
  if (answers.notes) out.notes = answers.notes;
  return Object.keys(out).length > 0 ? out : null;
}

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; meta?: { code?: string }; message?: string };
  return (
    e.code === 'P2002' ||
    e.meta?.code === '55P03' ||
    (typeof e.message === 'string' && e.message.includes('lock timeout'))
  );
}

interface LeadOutcome {
  leadId: string | null;
  matchedExistingRecord: boolean;
  created: {
    id: { value: string };
    email: { value: string };
    source: string;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    title?: string | null;
    phone?: { value: string } | null;
  } | null;
}

/**
 * Owner Q11 / R7: the same three reads in every branch; an existing record is
 * never linked or modified unless it is a lead an earlier booking created.
 */
async function resolveLead(
  ctx: Context,
  tx: Tx,
  bookable: Bookable,
  booker: { name: string; email: string; answers: PublicBookAnswers }
): Promise<LeadOutcome> {
  const { tenantId, hostUserId, leadSource } = bookable.eventType;
  const byEmail = { tenantId, email: { equals: booker.email, mode: 'insensitive' as const } };
  const lead = await tx.lead.findFirst({ where: byEmail, select: { id: true } });
  const contact = await tx.contact.findFirst({ where: byEmail, select: { id: true } });
  const priorBookings = await tx.appointment.count({
    where: { tenantId, leadId: lead?.id ?? NONE, bookedVia: 'PUBLIC_LINK' },
  });
  if (lead) {
    return priorBookings > 0
      ? { leadId: lead.id, matchedExistingRecord: false, created: null }
      : { leadId: null, matchedExistingRecord: true, created: null };
  }
  if (contact) return { leadId: null, matchedExistingRecord: true, created: null };

  const { firstName, lastName } = splitBookerName(booker.name);
  const phone =
    booker.answers.phone && PhoneNumber.create(booker.answers.phone).isSuccess
      ? booker.answers.phone
      : undefined;
  const leadService = ctx.services?.lead;
  if (!leadService) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: FAILED });
  const result = await leadService.createLeadInTransaction(
    {
      email: booker.email,
      firstName,
      lastName,
      company: booker.answers.company,
      phone,
      source: leadSource as 'WEBSITE' | 'BOOKING',
      ownerId: hostUserId,
      tenantId,
    },
    tx as unknown as RepositoryTransaction
  );
  if (result.isFailure) throw new TRPCError({ code: 'BAD_REQUEST', message: CHECK_DETAILS });
  return { leadId: result.value.id.value, matchedExistingRecord: false, created: result.value };
}

/** Transaction-local tenant config, a bounded lock wait, then the given per-tenant advisory lock. */
async function lockTenant(
  tx: Tx,
  tenantId: string,
  scope: 'booking' | 'booking-attempts'
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
  await tx.$executeRaw`SELECT set_config('lock_timeout', '2s', true)`;
  const lockKey = `${scope}:${tenantId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}

const OVERLAP_CONSTRAINT = 'appointments_no_overlap_per_organizer';

/**
 * The host's slot was taken by a write that does not take the booking lock (an in-app
 * appointment): the organizer-overlap exclusion constraint (SQLSTATE 23P01) rejected ours.
 */
export function isSlotTakenError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; meta?: Record<string, unknown>; message?: string };
  if (e.code === '23P01' || e.meta?.code === '23P01') return true;
  const text = `${typeof e.message === 'string' ? e.message : ''} ${JSON.stringify(e.meta ?? {})}`;
  return text.includes(OVERLAP_CONSTRAINT);
}

function rethrowBookingError(err: unknown): never {
  if (err instanceof TRPCError) throw err;
  if (isSlotTakenError(err)) throw new TRPCError({ code: 'CONFLICT', message: SLOT_TAKEN });
  if (isRetryable(err)) throw new TRPCError({ code: 'CONFLICT', message: TRY_AGAIN });
  console.error('[public-booking] booking failed', {
    code: (err as { code?: string } | null)?.code ?? 'unknown',
  });
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: FAILED });
}

/** After commit; every step is isolated and nothing here can fail the booking or log PII. */
async function afterBooking(
  ctx: Context,
  bookable: Bookable,
  appointment: { id: string; startTime: Date; endTime: Date } & Record<string, unknown>,
  lead: LeadOutcome,
  booker: { name: string; email: string; answers: PublicBookAnswers }
): Promise<void> {
  const { eventType, settings } = bookable;
  const step = async (label: string, work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      console.error('[public-booking] post-booking step failed', {
        step: label,
        appointmentId: appointment.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  };

  if (lead.created) {
    const created = lead.created;
    // Not awaited: scoring waits on Redis readiness and must never hold up the emails below.
    void step('ai-scoring', () =>
      enqueueLeadScoring({
        leadId: created.id.value,
        tenantId: eventType.tenantId,
        lead: {
          email: created.email.value,
          source: created.source,
          firstName: created.firstName ?? undefined,
          lastName: created.lastName ?? undefined,
          company: created.company ?? undefined,
          title: created.title ?? undefined,
          phone: created.phone?.value,
        },
        correlationId: `lead-create-${created.id.value}`,
      })
    );
    await step('lead-activity', () =>
      ctx.prisma.leadActivity.create({
        data: {
          type: 'NOTE',
          title: 'Lead created from a booking',
          description: `Booked ${eventType.name} on the public booking page`,
          metadata: { source: created.source, eventTypeId: eventType.id },
          timestamp: new Date(),
          userName: 'Public booking',
          leadId: created.id.value,
          tenantId: eventType.tenantId,
        },
      })
    );
  }

  await step('appointment-side-effects', () =>
    onAppointmentCreated(appointment, eventType.hostUserId, { sendIcs: false })
  );

  await step('emails', async () => {
    const host = await ctx.prisma.user.findUnique({
      where: { id: eventType.hostUserId },
      select: { email: true },
    });
    if (!host?.email) return;
    const sender = ctx.adapters?.notificationService;
    if (!sender) return;
    await sendBookingEmails(sender, {
      firmName: eventType.tenant.name,
      eventName: eventType.name,
      startsAt: appointment.startTime,
      endsAt: appointment.endTime,
      timezone: settings.defaultTimezone,
      locationType: eventType.locationType,
      locationDetails: eventType.locationDetails,
      bookerName: booker.name,
      bookerEmail: booker.email,
      answers: booker.answers,
      hostEmail: host.email,
      matchedExistingRecord: lead.matchedExistingRecord,
    });
  });
}

export const publicBookingRouter = createTRPCRouter({
  getEventType: publicProcedure
    .input(publicBookingLookupSchema)
    .query(async ({ ctx, input }): Promise<PublicEventTypeDto> => {
      const { eventType, settings } = await resolveBookable(ctx.prisma, input.handle, input.slug);
      return {
        firmName: eventType.tenant.name,
        eventName: eventType.name,
        durationMinutes: eventType.durationMinutes,
        description: eventType.description,
        locationType: eventType.locationType,
        requiredFields: eventType.requiredFields as EventTypeRequiredField[],
        timezone: settings.defaultTimezone,
        colorToken: eventType.colorToken,
        privacyUrl: eventType.tenant.bookingPrivacyUrl,
      };
    }),

  listSlots: publicProcedure
    .input(publicSlotsInputSchema)
    .query(async ({ ctx, input }): Promise<PublicSlotsDto> => {
      bookingSlotsLimiter.check(ipHashOf(ctx, getBookingSalt()));
      const bookable = await resolveBookable(ctx.prisma, input.handle, input.slug);
      const rules = await loadRules(ctx.prisma, bookable.eventType.tenantId);
      const now = new Date();
      const today = toZonedParts(now, rules.timezone).date;
      if (input.fromDate < today || input.fromDate > addDays(today, BOOKING_HORIZON_DAYS)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: OUT_OF_WINDOW });
      }
      const days = await computeSlots(ctx.prisma, bookable, rules, input.fromDate, input.days, now);
      return {
        timezone: rules.timezone,
        days: days.map((d) => ({
          date: d.date,
          slots: d.slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
        })),
      };
    }),

  book: publicProcedure
    .input(publicBookInputSchema)
    .mutation(async ({ ctx, input }): Promise<PublicBookResultDto> => {
      const start = new Date(input.start);
      if (input.__honeypot) {
        // Bots get a plausible success and no database work.
        return { startsAt: start.toISOString(), endsAt: start.toISOString(), timezone: 'UTC' };
      }
      const salt = getBookingSalt();
      const bookable = await resolveBookable(ctx.prisma, input.handle, input.slug);
      const { eventType, settings } = bookable;
      const tenantId = eventType.tenantId;

      assertRequiredAnswers(eventType, input.answers);

      const now = new Date();
      const keys = {
        tenantId,
        eventTypeId: eventType.id,
        emailHash: hashBookingValue(normalizeEmailForCap(input.email), salt),
        ipHash: ipHashOf(ctx, salt),
      };
      await pruneBookingAttempts(ctx.prisma, tenantId, now);
      try {
        // Count + insert atomically per tenant; committed before the booking so a failed booking still counts.
        await ctx.prisma.$transaction(async (tx) => {
          await lockTenant(tx, tenantId, 'booking-attempts');
          await assertBookingCaps(tx, keys, now);
          await recordBookingAttempt(tx, keys);
        });
      } catch (err) {
        rethrowBookingError(err);
      }

      const end = new Date(start.getTime() + eventType.durationMinutes * MS_PER_MINUTE);
      const booker = { name: input.name, email: input.email, answers: input.answers };
      let outcome: {
        appointment: Awaited<ReturnType<Tx['appointment']['create']>>;
        lead: LeadOutcome;
        bookable: Bookable;
      };
      try {
        outcome = await ctx.prisma.$transaction(async (tx) => {
          await lockTenant(tx, tenantId, 'booking');
          // Re-resolve under the lock: event-type writes take the same lock, so this is current.
          const current = await resolveBookable(tx, input.handle, input.slug);
          if (
            current.eventType.id !== eventType.id ||
            current.eventType.durationMinutes !== eventType.durationMinutes
          ) {
            throw new TRPCError({ code: 'CONFLICT', message: SLOT_TAKEN });
          }
          assertRequiredAnswers(current.eventType, input.answers);
          await assertEventTypeBookingCap(tx, { tenantId, eventTypeId: eventType.id }, now);

          const rules = await loadRules(tx, tenantId);
          const date = toZonedParts(start, rules.timezone).date;
          const [day] = await computeSlots(tx, current, rules, date, 1, now);
          if (!day?.slots.some((s) => s.start.getTime() === start.getTime())) {
            throw new TRPCError({ code: 'CONFLICT', message: SLOT_TAKEN });
          }

          const lead = await resolveLead(ctx, tx, current, booker);
          const fresh = current.eventType;
          const freshSettings = current.settings;
          const appointment = await tx.appointment.create({
            data: {
              tenantId,
              title: `${fresh.name} with ${input.name}`.slice(0, TITLE_MAX),
              description: fresh.description,
              startTime: start,
              endTime: end,
              timezone: rules.timezone,
              appointmentType: fresh.appointmentType as never,
              status: 'SCHEDULED',
              location: fresh.locationDetails,
              organizerId: fresh.hostUserId,
              bufferMinutesBefore: freshSettings.defaultBufferBeforeMinutes,
              bufferMinutesAfter: freshSettings.defaultBufferAfterMinutes,
              reminderMinutes: freshSettings.defaultReminderMinutes,
              eventTypeId: fresh.id,
              leadId: lead.leadId,
              bookerName: input.name,
              bookerEmail: input.email,
              bookingAnswers: bookingAnswers(input.answers) ?? undefined,
              bookedVia: 'PUBLIC_LINK',
              bookingConsentAt: now,
              bookingConsentVersion: BOOKING_CONSENT_VERSION,
            },
            include: { attendees: true, linkedCases: true },
          });
          return { appointment, lead, bookable: current };
        });
      } catch (err) {
        rethrowBookingError(err);
      }

      void afterBooking(ctx, outcome.bookable, outcome.appointment, outcome.lead, booker);
      // The timezone the appointment was committed with (config is re-read under the lock).
      return {
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        timezone: outcome.appointment.timezone ?? outcome.bookable.settings.defaultTimezone,
      };
    }),
});
