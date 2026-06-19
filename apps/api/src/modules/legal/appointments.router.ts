/**
 * Appointments Router
 *
 * Provides type-safe tRPC endpoints for appointment management:
 * - CRUD operations (create, read, update, delete)
 * - Conflict detection and availability checking
 * - Rescheduling and cancellation
 * - Case linkage
 * - Recurrence support
 *
 * Task: IFC-137 - Appointment Aggregate with conflict detection
 * KPIs: Conflict detection accuracy >95%, scheduling latency <=100ms
 *
 * INTEGRATION: Uses AppointmentDomainService for domain logic
 * - ConflictDetector for sophisticated conflict detection
 * - Buffer time handling
 * - Recurrence pattern generation
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure as baseTenantProcedure } from '../../trpc';
import { AppointmentDomainService } from '../../services';
import {
  AppointmentCreatedEvent,
  AppointmentRescheduledEvent,
  AppointmentCancelledEvent,
  AppointmentId,
  Appointment,
  TimeSlot,
} from '@intelliflow/domain';
import { container } from '../../container';
import { createNotification } from '../notifications/notifications.router';
import { mapDomainErrorToTRPC } from './helpers';
import { safeTimezone } from '../../lib/timezone-utils';

// NOTE: appointments are NOT LEGAL-gated. This router is SHARED with the core
// Calendar feature (CORE_CRM, all tiers): apps/web/.../calendar/(list)/page.tsx
// calls `appointments.list`. Gating it behind the LEGAL add-on would break the
// calendar for every non-Professional tenant. Legal case-appointments reuse the
// same tenant-scoped endpoints.

// Zod schemas for appointment operations
const appointmentTypeSchema = z.enum([
  'MEETING',
  'CALL',
  'HEARING',
  'CONSULTATION',
  'DEPOSITION',
  'OTHER',
]);

const appointmentStatusSchema = z.enum([
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);

const dayOfWeekSchema = z.enum([
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
]);

const recurrenceSchema = z
  .object({
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
    interval: z.number().min(1).optional().default(1),
    daysOfWeek: z.array(dayOfWeekSchema).optional(),
    dayOfMonth: z.number().min(1).max(31).optional(),
    monthOfYear: z.number().min(1).max(12).optional(),
    endDate: z.coerce.date().optional(),
    occurrenceCount: z.number().min(1).optional(),
  })
  .optional();

const ianaTimezoneSchema = z.string().refine(
  (tz) => {
    if (tz === 'UTC' || tz.includes('/')) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  },
  { message: 'Must be a valid IANA timezone (e.g. America/New_York) or UTC' }
);

const createAppointmentSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  timezone: ianaTimezoneSchema.optional(),
  appointmentType: appointmentTypeSchema,
  location: z.string().max(500).optional(),
  attendeeIds: z.array(z.string()).optional().default([]),
  linkedCaseIds: z.array(z.string()).optional().default([]),
  bufferMinutesBefore: z.number().min(0).max(240).optional().default(0),
  bufferMinutesAfter: z.number().min(0).max(240).optional().default(0),
  recurrence: recurrenceSchema,
  reminderMinutes: z.number().min(0).optional(),
  forceOverrideConflicts: z.boolean().optional().default(false),
  calendarId: z.string().optional().nullable(),
});

const updateAppointmentSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  location: z.string().max(500).optional(),
  timezone: ianaTimezoneSchema.optional().nullable(),
  appointmentType: appointmentTypeSchema.optional(),
  notes: z.string().max(5000).optional(),
  reminderMinutes: z.number().min(0).optional(),
  calendarId: z.string().optional().nullable(),
});

const rescheduleSchema = z.object({
  id: z.string(),
  newStartTime: z.coerce.date(),
  newEndTime: z.coerce.date(),
  reason: z.string().max(500).optional(),
  forceOverrideConflicts: z.boolean().optional().default(false),
});

const checkConflictsSchema = z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  attendeeIds: z.array(z.string()).min(1),
  bufferMinutesBefore: z.number().min(0).max(240).optional().default(0),
  bufferMinutesAfter: z.number().min(0).max(240).optional().default(0),
  excludeAppointmentId: z.string().optional(),
});

const checkAvailabilitySchema = z.object({
  attendeeId: z.string(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  minimumSlotMinutes: z.number().min(5).optional().default(30),
});

const findNextSlotSchema = z.object({
  attendeeId: z.string(),
  startFrom: z.coerce.date(),
  durationMinutes: z.number().min(5),
  maxDaysAhead: z.number().min(1).max(365).optional().default(30),
  bufferMinutesBefore: z.number().min(0).max(240).optional().default(0),
  bufferMinutesAfter: z.number().min(0).max(240).optional().default(0),
});

const listAppointmentsSchema = z.object({
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(20),
  status: z.array(appointmentStatusSchema).optional(),
  appointmentType: z.array(appointmentTypeSchema).optional(),
  startTimeFrom: z.coerce.date().optional(),
  startTimeTo: z.coerce.date().optional(),
  caseId: z.string().optional(),
  calendarId: z.string().optional(),
  sortBy: z.enum(['startTime', 'createdAt', 'updatedAt']).optional().default('startTime'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * Returns a Prisma WHERE clause scoping appointments to the current user,
 * or an empty object for admins (who can see all appointments).
 */
function userScopeFilter(user: { userId: string; role: string }) {
  if (user.role === 'ADMIN') return {};
  return {
    OR: [{ organizerId: user.userId }, { attendees: { some: { userId: user.userId } } }],
  };
}

/**
 * Business-hours window (inclusive start, exclusive end) in 24-hour clock,
 * matching the calendar's day boundaries: 07:00 – 19:00.
 * Update both sides in sync if the range changes.
 */
const BUSINESS_HOURS_START = 7;
const BUSINESS_HOURS_END = 19;

type ModuleAccessLike = {
  isModuleEnabled: (tenantId: string, moduleId: string) => Promise<boolean> | boolean;
};

/**
 * Assert the tenant's plan includes the LEGAL module.
 *
 * The appointments router is SHARED with the core calendar (so the router itself
 * stays on plain `tenantProcedure`), but linking appointments to legal CASES is a
 * LEGAL feature. A tenant downgraded out of LEGAL can still hold orphan cases, so
 * the case-linking surface (linkToCase/unlinkFromCase, create-with-linkedCaseIds,
 * list-by-caseId) must re-check entitlement. Mirrors trpc.ts `requireModule` and
 * fails CLOSED (deny if the entitlement service is unavailable or errors).
 */
async function assertLegalEntitlement(ctx: {
  user?: { tenantId?: string | null };
  container?: { get: (name: string) => unknown };
}): Promise<void> {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Tenant context required' });
  }
  const moduleAccess = ctx.container?.get('moduleAccess') as ModuleAccessLike | undefined;
  if (!moduleAccess || typeof moduleAccess.isModuleEnabled !== 'function') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'The LEGAL module is unavailable.' });
  }
  let enabled: unknown;
  try {
    enabled = await moduleAccess.isModuleEnabled(tenantId, 'LEGAL');
  } catch {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Could not verify entitlement for the LEGAL module.',
    });
  }
  if (enabled === false) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Your plan does not include the LEGAL module.',
    });
  }
}

type EntitlementCtx = {
  user?: { tenantId?: string | null };
  container?: { get: (name: string) => unknown };
};

/** Non-throwing LEGAL entitlement check (fails CLOSED to `false`). */
async function hasLegalEntitlement(ctx: EntitlementCtx): Promise<boolean> {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) return false;
  const moduleAccess = ctx.container?.get('moduleAccess') as ModuleAccessLike | undefined;
  if (!moduleAccess || typeof moduleAccess.isModuleEnabled !== 'function') return false;
  try {
    return (await moduleAccess.isModuleEnabled(tenantId, 'LEGAL')) !== false;
  } catch {
    return false;
  }
}

/**
 * Hide legal case-link data (`linkedCases`) from callers without the LEGAL
 * module. Appointments are a shared calendar resource, but a tenant downgraded
 * out of LEGAL can still hold orphan AppointmentCase rows; those must not surface
 * in any appointment read/response. Mutates in place to `[]`. Only consults
 * entitlement when there is actually link data to hide, so the core-calendar
 * hot path (no links) pays nothing.
 */
async function cloakLinkedCases<T extends { linkedCases?: unknown }>(
  ctx: EntitlementCtx,
  appointments: T[]
): Promise<void> {
  const hasLinks = appointments.some(
    (a) => Array.isArray(a.linkedCases) && a.linkedCases.length > 0
  );
  if (!hasLinks) return;
  if (await hasLegalEntitlement(ctx)) return;
  for (const a of appointments) {
    if (Array.isArray(a.linkedCases)) {
      (a as { linkedCases: unknown[] }).linkedCases = [];
    }
  }
}

/** Pull appointment-shaped objects (carrying `linkedCases`) out of any result. */
function collectAppointmentLike(data: unknown): { linkedCases?: unknown }[] {
  if (Array.isArray(data)) {
    return data.filter((x) => x && typeof x === 'object') as { linkedCases?: unknown }[];
  }
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.linkedCases)) return [d as { linkedCases?: unknown }];
  if (Array.isArray(d.appointments)) return d.appointments as { linkedCases?: unknown }[];
  // Nested single appointment, e.g. reschedule returns `{ appointment, previousTime }`.
  if (d.appointment && typeof d.appointment === 'object') {
    return [d.appointment as { linkedCases?: unknown }];
  }
  return [];
}

/**
 * Router-local `tenantProcedure` = the core tenant procedure + a response cloak
 * that strips legal `linkedCases` from any appointment read/response for callers
 * without the LEGAL module. Applied once here so all 9 appointment endpoints are
 * covered with no per-procedure plumbing; non-appointment results (e.g.
 * `{ success }`) pass through untouched.
 */
const tenantProcedure = baseTenantProcedure.use(async ({ ctx, next }) => {
  const result = await next();
  if (result.ok) {
    const appts = collectAppointmentLike(result.data);
    if (appts.length) await cloakLinkedCases(ctx as EntitlementCtx, appts);
  }
  return result;
});

function getLocalHour(date: Date, timezone?: string): number {
  const tz = timezone ?? 'UTC';
  // Use en-GB to get 24-hour format reliably
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(date);
  // en-GB can return "24" for midnight in some engines — normalise
  const hour = parseInt(hourStr, 10);
  return hour === 24 ? 0 : hour;
}

/**
 * Validates that the appointment's start and end fall within business hours
 * (07:00 – 19:00) in the provided timezone. Throws a BAD_REQUEST if outside.
 */
function assertWithinBusinessHours(startTime: Date, endTime: Date, timezone?: string): void {
  const startHour = getLocalHour(startTime, timezone);
  const endHour = getLocalHour(endTime, timezone);
  const startWithinDay = startHour >= BUSINESS_HOURS_START && startHour < BUSINESS_HOURS_END;
  // End boundary: end hour == 19 is OK when minutes are 00 (meeting ends at 19:00 sharp)
  const endMinutes = parseInt(
    new Intl.DateTimeFormat('en-GB', {
      minute: '2-digit',
      timeZone: timezone ?? 'UTC',
    }).format(endTime),
    10
  );
  const endWithinDay =
    (endHour >= BUSINESS_HOURS_START && endHour < BUSINESS_HOURS_END) ||
    (endHour === BUSINESS_HOURS_END && endMinutes === 0);

  if (!startWithinDay || !endWithinDay) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Appointments must start and end between ${String(BUSINESS_HOURS_START).padStart(
        2,
        '0'
      )}:00 and ${String(BUSINESS_HOURS_END).padStart(2, '0')}:00.`,
    });
  }
}

/**
 * Convert a Prisma appointment record to a domain Appointment for ICS/reminder handlers.
 * Uses AppointmentDomainService.toDomainAppointments (handles TimeSlot, Buffer, etc.)
 * and returns the first result, or null if conversion fails.
 */
function toDomainAppointment(dbRecord: any): Appointment | null {
  const results = AppointmentDomainService.toDomainAppointments([
    {
      ...dbRecord,
      bufferMinutesBefore: dbRecord.bufferMinutesBefore ?? 0,
      bufferMinutesAfter: dbRecord.bufferMinutesAfter ?? 0,
      attendees: dbRecord.attendees?.map((a: any) => ({ userId: a.userId ?? a })) ?? [],
    },
  ]);
  return results.length > 0 ? results[0] : null;
}

/**
 * Fire-and-forget: dispatch ICS invitation, schedule reminder, and emit audit event
 * after an appointment is created. Errors are logged but do not block the response.
 */
async function onAppointmentCreated(dbRecord: any, userId: string): Promise<void> {
  try {
    const appointment = toDomainAppointment(dbRecord);
    if (!appointment) return;

    const idResult = AppointmentId.create(dbRecord.id);
    if (idResult.isFailure) return;

    const timeSlotResult = TimeSlot.create(dbRecord.startTime, dbRecord.endTime);
    if (timeSlotResult.isFailure) return;

    const event = new AppointmentCreatedEvent(
      idResult.value,
      dbRecord.title,
      timeSlotResult.value,
      dbRecord.appointmentType,
      userId
    );

    // ICS invitation
    await container.appointmentIcsHandler.handleAppointmentCreated(event, appointment);
    // Schedule reminder
    await container.reminderScheduler.handleAppointmentCreated(event, appointment);
    // Audit trail via event bus
    await container.adapters.eventBus.publish(event);
  } catch (error) {
    console.error('[appointments] onAppointmentCreated side-effect error:', error);
  }
}

/**
 * Fire-and-forget: regenerate ICS, reschedule reminders, emit audit event
 */
async function onAppointmentRescheduled(
  dbRecord: any,
  previousStartTime: Date,
  previousEndTime: Date,
  userId: string,
  reason?: string
): Promise<void> {
  try {
    const appointment = toDomainAppointment(dbRecord);
    if (!appointment) return;

    const idResult = AppointmentId.create(dbRecord.id);
    if (idResult.isFailure) return;

    const prevSlotResult = TimeSlot.create(previousStartTime, previousEndTime);
    const newSlotResult = TimeSlot.create(dbRecord.startTime, dbRecord.endTime);
    if (prevSlotResult.isFailure || newSlotResult.isFailure) return;

    const event = new AppointmentRescheduledEvent(
      idResult.value,
      prevSlotResult.value,
      newSlotResult.value,
      userId,
      reason
    );

    await container.appointmentIcsHandler.handleAppointmentRescheduled(event, appointment);
    await container.reminderScheduler.handleAppointmentRescheduled(event, appointment);
    await container.adapters.eventBus.publish(event);
  } catch (error) {
    console.error('[appointments] onAppointmentRescheduled side-effect error:', error);
  }
}

/**
 * Fire-and-forget: cancel ICS, cancel reminders, emit audit event
 */
async function onAppointmentCancelled(
  dbRecord: any,
  userId: string,
  reason?: string
): Promise<void> {
  try {
    const appointment = toDomainAppointment(dbRecord);
    if (!appointment) return;

    const idResult = AppointmentId.create(dbRecord.id);
    if (idResult.isFailure) return;

    const event = new AppointmentCancelledEvent(idResult.value, userId, reason);

    await container.appointmentIcsHandler.handleAppointmentCancelled(event, appointment);
    await container.reminderScheduler.handleAppointmentCancelled(event, appointment);
    await container.adapters.eventBus.publish(event);
  } catch (error) {
    console.error('[appointments] onAppointmentCancelled side-effect error:', error);
  }
}

export const appointmentsRouter = createTRPCRouter({
  /**
   * Create a new appointment
   *
   * Phase 2e: routed through ScheduleAppointmentUseCase (hexagonal migration).
   * Use case handles domain validation, conflict detection, and persistence.
   */
  create: tenantProcedure.input(createAppointmentSchema).mutation(async ({ ctx, input }) => {
    const startTime = performance.now();

    // Reject appointments outside business hours (07:00 – 19:00).
    assertWithinBusinessHours(input.startTime, input.endTime, input.timezone);

    // Linking the new appointment to legal cases is a LEGAL feature, even on this
    // shared calendar router — require entitlement when caseIds are supplied.
    if (input.linkedCaseIds?.length) {
      await assertLegalEntitlement(ctx);
    }

    const result = await container.scheduleAppointmentUseCase.execute({
      title: input.title,
      description: input.description,
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: input.timezone,
      calendarId: input.calendarId || null,
      appointmentType: input.appointmentType,
      location: input.location,
      organizerId: ctx.user.userId,
      tenantId: ctx.user.tenantId,
      attendeeIds: input.attendeeIds,
      linkedCaseIds: input.linkedCaseIds,
      bufferMinutesBefore: input.bufferMinutesBefore,
      bufferMinutesAfter: input.bufferMinutesAfter,
      recurrence: input.recurrence,
      reminderMinutes: input.reminderMinutes,
      forceOverrideConflicts: input.forceOverrideConflicts,
    });
    if (result.isFailure) throw mapDomainErrorToTRPC(result.error);

    const { appointment: domainAppt, conflictWarnings } = result.value;

    // Use case returns Ok with conflictWarnings when conflicts found and NOT overridden.
    // Convert to the router's existing CONFLICT TRPCError shape.
    if (conflictWarnings && conflictWarnings.length > 0 && !input.forceOverrideConflicts) {
      const conflictDetails =
        conflictWarnings.length > 0
          ? await ctx.prismaWithTenant.appointment.findMany({
              where: { id: { in: conflictWarnings.map((c) => c.appointmentId) } },
              select: { id: true, title: true, startTime: true, endTime: true },
            })
          : [];

      // Log conflict detection for audit/monitoring
      console.warn('[appointments.create] Conflict detected:', {
        attemptedTimeSlot: { start: input.startTime, end: input.endTime },
        conflictCount: conflictWarnings.length,
        attendeeIds: [ctx.user.userId, ...input.attendeeIds],
      });

      throw new TRPCError({
        code: 'CONFLICT',
        message: `Scheduling conflict detected with ${conflictWarnings.length} appointment(s)`,
        cause: {
          conflicts: conflictWarnings.map((c) => {
            const details = conflictDetails.find((d) => d.id === c.appointmentId);
            return {
              id: c.appointmentId,
              title: details?.title ?? 'Unknown',
              startTime: details?.startTime ?? new Date(),
              endTime: details?.endTime ?? new Date(),
              overlapMinutes: c.overlapMinutes,
              conflictType: 'PARTIAL' as const,
            };
          }),
        },
      });
    }

    // Re-fetch via prismaWithTenant to preserve the current Prisma row response shape.
    const appointment = await ctx.prismaWithTenant.appointment.findUnique({
      where: { id: domainAppt.id.value },
      include: {
        attendees: true,
        linkedCases: true,
      },
    });
    if (!appointment) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Appointment ${domainAppt.id.value} disappeared after create`,
      });
    }

    const duration = performance.now() - startTime;
    console.log(`[appointments.create] Use-case scheduled in ${duration.toFixed(2)}ms`);

    // IFC-158: Fire-and-forget ICS, reminders, audit trail
    onAppointmentCreated(appointment, ctx.user.userId).catch((err) =>
      console.error('[appointments.router] Side-effect failed:', err)
    );

    // Notify organizer of scheduled appointment
    createNotification(
      ctx.prismaWithTenant,
      {
        userId: ctx.user.userId,
        tenantId: ctx.user.tenantId,
        type: 'appointment_scheduled',
        title: 'Appointment scheduled',
        body: `Appointment "${input.title}" scheduled for ${input.startTime.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric', timeZone: safeTimezone(ctx.user?.timezone) })}`,
        priority: 'normal',
        entityType: 'appointment',
        entityId: appointment.id,
        entityName: input.title,
        actionUrl: `/calendar/${appointment.id}`,
      },
      ctx.services?.notificationOrchestrator
    ).catch((err) => console.error('[appointments.router] Side-effect failed:', err));

    return appointment;
  }),

  /**
   * Get a single appointment by ID
   */
  getById: tenantProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const appointment = await ctx.prismaWithTenant.appointment.findUnique({
      where: { id: input.id },
      include: {
        attendees: true,
        linkedCases: true,
      },
    });

    if (!appointment) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Appointment with ID ${input.id} not found`,
      });
    }

    return appointment;
  }),

  /**
   * List appointments with filtering
   */
  list: tenantProcedure.input(listAppointmentsSchema).query(async ({ ctx, input }) => {
    const {
      page,
      limit,
      status,
      appointmentType,
      startTimeFrom,
      startTimeTo,
      caseId,
      calendarId,
      sortBy,
      sortOrder,
    } = input;
    const skip = (page - 1) * limit;

    // Filtering appointments by a legal case is a LEGAL feature — require it.
    if (caseId) {
      await assertLegalEntitlement(ctx);
    }

    // Admins see all appointments; regular users only see their own
    const where: any = { ...userScopeFilter(ctx.user) };

    if (status && status.length > 0) {
      where.status = { in: status };
    }

    if (appointmentType && appointmentType.length > 0) {
      where.appointmentType = { in: appointmentType };
    }

    if (startTimeFrom || startTimeTo) {
      where.startTime = {};
      if (startTimeFrom) where.startTime.gte = startTimeFrom;
      if (startTimeTo) where.startTime.lte = startTimeTo;
    }

    if (caseId) {
      where.linkedCases = { some: { caseId } };
    }

    if (calendarId !== undefined) {
      where.calendarId = calendarId;
    }

    const [appointments, total] = await Promise.all([
      ctx.prismaWithTenant.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          attendees: true,
          linkedCases: true,
        },
      }),
      ctx.prismaWithTenant.appointment.count({ where }),
    ]);

    // Enrich attendees with user data for display
    const allUserIds = [
      ...new Set(
        appointments.flatMap((a) => [a.organizerId, ...a.attendees.map((att) => att.userId)])
      ),
    ];
    const users = await ctx.prismaWithTenant.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, name: true, avatarUrl: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enrichedAppointments = appointments.map((a) => ({
      ...a,
      organizer: userMap.get(a.organizerId) ?? null,
      attendees: a.attendees.map((att) => ({
        ...att,
        user: userMap.get(att.userId) ?? null,
      })),
    }));

    return {
      appointments: enrichedAppointments,
      total,
      page,
      limit,
      hasMore: skip + appointments.length < total,
    };
  }),

  /**
   * Update appointment details
   */
  update: tenantProcedure.input(updateAppointmentSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;

    const existing = await ctx.prismaWithTenant.appointment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Appointment with ID ${id} not found`,
      });
    }

    if (existing.status === 'CANCELLED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot update a cancelled appointment',
      });
    }

    const appointment = await ctx.prismaWithTenant.appointment.update({
      where: { id },
      data,
      include: {
        attendees: true,
        linkedCases: true,
      },
    });

    return appointment;
  }),

  /**
   * Reschedule an appointment
   *
   * Phase 2d: routed through RescheduleAppointmentUseCase (hexagonal migration).
   * Uses domain ConflictDetector for sophisticated conflict detection.
   */
  reschedule: tenantProcedure.input(rescheduleSchema).mutation(async ({ ctx, input }) => {
    const startTime = performance.now();

    // Reject rescheduling outside business hours (07:00 – 19:00).
    assertWithinBusinessHours(input.newStartTime, input.newEndTime);

    const result = await container.rescheduleAppointmentUseCase.execute({
      appointmentId: input.id,
      tenantId: ctx.user.tenantId,
      newStartTime: input.newStartTime,
      newEndTime: input.newEndTime,
      rescheduledBy: ctx.user.userId,
      reason: input.reason,
      forceOverrideConflicts: input.forceOverrideConflicts,
    });
    if (result.isFailure) throw mapDomainErrorToTRPC(result.error);

    const { previousTimeSlot, conflictWarnings } = result.value;

    // Use case returns Ok with conflictWarnings when conflicts found and NOT overridden.
    // Convert to the router's existing CONFLICT TRPCError shape.
    if (conflictWarnings && conflictWarnings.length > 0 && !input.forceOverrideConflicts) {
      const conflictDetails =
        conflictWarnings.length > 0
          ? await ctx.prismaWithTenant.appointment.findMany({
              where: { id: { in: conflictWarnings.map((c) => c.appointmentId) } },
              select: { id: true, title: true, startTime: true, endTime: true },
            })
          : [];

      throw new TRPCError({
        code: 'CONFLICT',
        message: `Rescheduling conflict detected with ${conflictWarnings.length} appointment(s)`,
        cause: {
          conflicts: conflictWarnings.map((c) => {
            const details = conflictDetails.find((d) => d.id === c.appointmentId);
            return {
              id: c.appointmentId,
              title: details?.title ?? 'Unknown',
              startTime: details?.startTime ?? new Date(),
              endTime: details?.endTime ?? new Date(),
              overlapMinutes: c.overlapMinutes,
              conflictType: 'PARTIAL' as const,
            };
          }),
        },
      });
    }

    // Re-fetch via prismaWithTenant to preserve the current Prisma row response shape.
    const appointment = await ctx.prismaWithTenant.appointment.findUnique({
      where: { id: input.id },
      include: {
        attendees: true,
        linkedCases: true,
      },
    });
    if (!appointment) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Appointment ${input.id} disappeared after reschedule`,
      });
    }

    const duration = performance.now() - startTime;
    console.log(`[appointments.reschedule] Use-case reschedule in ${duration.toFixed(2)}ms`);

    // IFC-158: Fire-and-forget ICS regeneration, reminder rescheduling, audit trail
    onAppointmentRescheduled(
      appointment,
      previousTimeSlot.startTime,
      previousTimeSlot.endTime,
      ctx.user.userId,
      input.reason
    ).catch((err) => console.error('[appointments.router] Side-effect failed:', err));

    // Notify organizer of rescheduled appointment
    createNotification(
      ctx.prismaWithTenant,
      {
        userId: appointment.organizerId,
        tenantId: ctx.user.tenantId,
        type: 'appointment_rescheduled',
        title: 'Appointment rescheduled',
        body: `Appointment "${appointment.title}" has been rescheduled`,
        priority: 'normal',
        entityType: 'appointment',
        entityId: appointment.id,
        entityName: appointment.title,
        actionUrl: `/calendar/${appointment.id}`,
      },
      ctx.services?.notificationOrchestrator
    ).catch((err) => console.error('[appointments.router] Side-effect failed:', err));

    return {
      appointment,
      previousTime: {
        startTime: previousTimeSlot.startTime,
        endTime: previousTimeSlot.endTime,
      },
    };
  }),

  /**
   * Confirm an appointment
   */
  confirm: tenantProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prismaWithTenant.appointment.findUnique({
      where: { id: input.id },
    });

    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Appointment with ID ${input.id} not found`,
      });
    }

    if (existing.status !== 'SCHEDULED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cannot confirm appointment with status ${existing.status}`,
      });
    }

    const appointment = await ctx.prismaWithTenant.appointment.update({
      where: { id: input.id },
      data: { status: 'CONFIRMED' },
      include: {
        attendees: true,
        linkedCases: true,
      },
    });

    return appointment;
  }),

  /**
   * Complete an appointment
   * Phase 2b: routed through CompleteAppointmentUseCase (hexagonal migration)
   */
  complete: tenantProcedure
    .input(z.object({ id: z.string(), notes: z.string().max(5000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await container.completeAppointmentUseCase.execute({
        appointmentId: input.id,
        tenantId: ctx.user.tenantId,
        completedBy: ctx.user.userId,
        notes: input.notes,
      });
      if (result.isFailure) throw mapDomainErrorToTRPC(result.error);

      const appointment = await ctx.prismaWithTenant.appointment.findUnique({
        where: { id: input.id },
        include: {
          attendees: true,
          linkedCases: true,
        },
      });
      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Appointment ${input.id} disappeared after complete`,
        });
      }

      return appointment;
    }),

  /**
   * Cancel an appointment
   * Phase 2a: routed through CancelAppointmentUseCase (hexagonal migration)
   */
  cancel: tenantProcedure
    .input(z.object({ id: z.string(), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await container.cancelAppointmentUseCase.execute({
        appointmentId: input.id,
        tenantId: ctx.user.tenantId,
        cancelledBy: ctx.user.userId,
        reason: input.reason,
      });
      if (result.isFailure) throw mapDomainErrorToTRPC(result.error);

      const appointment = await ctx.prismaWithTenant.appointment.findUnique({
        where: { id: input.id },
        include: {
          attendees: true,
          linkedCases: true,
        },
      });
      if (!appointment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Appointment ${input.id} disappeared after cancel`,
        });
      }

      // IFC-158: Fire-and-forget ICS cancellation, cancel reminders, audit trail
      onAppointmentCancelled(appointment, ctx.user.userId, input.reason).catch((err) =>
        console.error('[appointments.router] Side-effect failed:', err)
      );

      return appointment;
    }),

  /**
   * Mark appointment as no-show
   */
  markNoShow: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prismaWithTenant.appointment.findUnique({
        where: { id: input.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Appointment with ID ${input.id} not found`,
        });
      }

      if (existing.status !== 'SCHEDULED' && existing.status !== 'CONFIRMED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot mark as no-show for status ${existing.status}`,
        });
      }

      const appointment = await ctx.prismaWithTenant.appointment.update({
        where: { id: input.id },
        data: { status: 'NO_SHOW' },
        include: {
          attendees: true,
          linkedCases: true,
        },
      });

      return appointment;
    }),

  /**
   * Delete an appointment
   */
  delete: tenantProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prismaWithTenant.appointment.findUnique({
      where: { id: input.id },
    });

    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Appointment with ID ${input.id} not found`,
      });
    }

    await ctx.prismaWithTenant.appointment.delete({
      where: { id: input.id },
    });

    return { success: true, id: input.id };
  }),

  /**
   * Check for scheduling conflicts
   * Returns detailed conflict information
   *
   * Phase 2c: routed through CheckConflictsUseCase (hexagonal migration).
   * Uses domain ConflictDetector for sophisticated conflict detection:
   * - O(n) algorithm for performance
   * - Proper buffer time handling
   * - Conflict type classification (EXACT, PARTIAL, BUFFER)
   */
  checkConflicts: tenantProcedure.input(checkConflictsSchema).query(async ({ ctx, input }) => {
    const checkStart = Date.now();

    const result = await container.checkConflictsUseCase.checkConflicts({
      tenantId: ctx.user.tenantId,
      startTime: input.startTime,
      endTime: input.endTime,
      attendeeIds: input.attendeeIds,
      bufferMinutesBefore: input.bufferMinutesBefore,
      bufferMinutesAfter: input.bufferMinutesAfter,
      excludeAppointmentId: input.excludeAppointmentId,
    });
    if (result.isFailure) throw mapDomainErrorToTRPC(result.error);

    // The use case enriches conflicts with title/startTime/endTime from domain entities,
    // but does not include appointmentType (not part of CheckConflictsOutput interface).
    // Post-fetch appointmentType from Prisma to preserve the current response shape.
    const conflictIds = result.value.conflicts.map((c) => c.appointmentId);
    const conflictDetails =
      conflictIds.length > 0
        ? await ctx.prismaWithTenant.appointment.findMany({
            where: { id: { in: conflictIds } },
            select: { id: true, appointmentType: true },
          })
        : [];
    const typeMap = new Map(conflictDetails.map((c) => [c.id, c.appointmentType]));

    const checkDurationMs = Date.now() - checkStart;
    console.log(`[appointments.checkConflicts] Use-case check in ${checkDurationMs.toFixed(2)}ms`);

    return {
      hasConflicts: result.value.hasConflicts,
      conflicts: result.value.conflicts.map((c) => ({
        id: c.appointmentId,
        title: c.title,
        startTime: c.startTime,
        endTime: c.endTime,
        appointmentType: typeMap.get(c.appointmentId) ?? 'OTHER',
        overlapMinutes: c.overlapMinutes,
        conflictType: c.conflictType,
      })),
      checkDurationMs,
    };
  }),

  /**
   * Check availability for an attendee
   * Returns available time slots
   *
   * Phase 2c: routed through CheckConflictsUseCase.checkAvailability (hexagonal migration).
   */
  checkAvailability: tenantProcedure
    .input(checkAvailabilitySchema)
    .query(async ({ ctx, input }) => {
      const checkStart = Date.now();

      const result = await container.checkConflictsUseCase.checkAvailability({
        tenantId: ctx.user.tenantId,
        attendeeId: input.attendeeId,
        startTime: input.startTime,
        endTime: input.endTime,
        minimumSlotMinutes: input.minimumSlotMinutes,
        includeBuffer: true,
      });
      if (result.isFailure) throw mapDomainErrorToTRPC(result.error);

      const checkDurationMs = Date.now() - checkStart;
      console.log(
        `[appointments.checkAvailability] Use-case check in ${checkDurationMs.toFixed(2)}ms`
      );

      return {
        availableSlots: result.value.availableSlots,
        totalAvailableMinutes: result.value.totalAvailableMinutes,
        checkDurationMs,
      };
    }),

  /**
   * Find next available slot
   *
   * Phase 2c: routed through CheckConflictsUseCase.findNextSlot (hexagonal migration).
   * Working hours awareness (9 AM - 5 PM, weekdays), buffer time handling, weekend exclusion.
   */
  findNextSlot: tenantProcedure.input(findNextSlotSchema).query(async ({ ctx, input }) => {
    const searchStart = Date.now();

    const result = await container.checkConflictsUseCase.findNextSlot({
      tenantId: ctx.user.tenantId,
      attendeeId: input.attendeeId,
      startFrom: input.startFrom,
      durationMinutes: input.durationMinutes,
      maxDaysAhead: input.maxDaysAhead,
      bufferMinutesBefore: input.bufferMinutesBefore,
      bufferMinutesAfter: input.bufferMinutesAfter,
      workingHoursStart: 9,
      workingHoursEnd: 17,
    });
    if (result.isFailure) throw mapDomainErrorToTRPC(result.error);

    const searchDurationMs = Date.now() - searchStart;
    const slot = result.value.slot;

    if (slot) {
      console.log(`[appointments.findNextSlot] Use-case found in ${searchDurationMs.toFixed(2)}ms`);
      return {
        slot: {
          startTime: slot.startTime,
          endTime: slot.endTime,
          durationMinutes: slot.durationMinutes,
        },
        searchDurationMs,
      };
    }

    console.log(`[appointments.findNextSlot] No slot found in ${searchDurationMs.toFixed(2)}ms`);
    return {
      slot: null,
      searchDurationMs,
    };
  }),

  /**
   * Link appointment to a case
   */
  linkToCase: tenantProcedure
    .input(z.object({ appointmentId: z.string(), caseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertLegalEntitlement(ctx); // case-linking requires the LEGAL module
      const existing = await ctx.prismaWithTenant.appointment.findUnique({
        where: { id: input.appointmentId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Appointment with ID ${input.appointmentId} not found`,
        });
      }

      // Check if already linked
      const existingLink = await ctx.prismaWithTenant.appointmentCase.findUnique({
        where: {
          appointmentId_caseId: {
            appointmentId: input.appointmentId,
            caseId: input.caseId,
          },
        },
      });

      if (existingLink) {
        return { success: true, message: 'Already linked' };
      }

      await ctx.prismaWithTenant.appointmentCase.create({
        data: {
          tenantId: ctx.user.tenantId,
          appointmentId: input.appointmentId,
          caseId: input.caseId,
        },
      });

      return { success: true };
    }),

  /**
   * Unlink appointment from a case
   */
  unlinkFromCase: tenantProcedure
    .input(z.object({ appointmentId: z.string(), caseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertLegalEntitlement(ctx); // case-linking requires the LEGAL module
      const existing = await ctx.prismaWithTenant.appointmentCase.findUnique({
        where: {
          appointmentId_caseId: {
            appointmentId: input.appointmentId,
            caseId: input.caseId,
          },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Link not found',
        });
      }

      await ctx.prismaWithTenant.appointmentCase.delete({
        where: { id: existing.id },
      });

      return { success: true };
    }),

  /**
   * Add attendee to appointment
   */
  addAttendee: tenantProcedure
    .input(z.object({ appointmentId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prismaWithTenant.appointment.findUnique({
        where: { id: input.appointmentId },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Appointment with ID ${input.appointmentId} not found`,
        });
      }

      // Check if already added
      const existingAttendee = await ctx.prismaWithTenant.appointmentAttendee.findUnique({
        where: {
          appointmentId_userId: {
            appointmentId: input.appointmentId,
            userId: input.userId,
          },
        },
      });

      if (existingAttendee) {
        return { success: true, message: 'Already added' };
      }

      await ctx.prismaWithTenant.appointmentAttendee.create({
        data: {
          tenantId: ctx.user.tenantId,
          appointmentId: input.appointmentId,
          userId: input.userId,
        },
      });

      return { success: true };
    }),

  /**
   * Remove attendee from appointment
   */
  removeAttendee: tenantProcedure
    .input(z.object({ appointmentId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prismaWithTenant.appointmentAttendee.findUnique({
        where: {
          appointmentId_userId: {
            appointmentId: input.appointmentId,
            userId: input.userId,
          },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Attendee not found',
        });
      }

      await ctx.prismaWithTenant.appointmentAttendee.delete({
        where: { id: existing.id },
      });

      return { success: true };
    }),

  /**
   * Get upcoming appointments
   */
  upcoming: tenantProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional().default(10) }))
    .query(async ({ ctx, input }) => {
      const now = new Date();

      const scopeFilter = userScopeFilter(ctx.user);
      const appointments = await ctx.prismaWithTenant.appointment.findMany({
        where: {
          ...scopeFilter,
          startTime: { gte: now },
          status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] },
        },
        take: input.limit,
        orderBy: { startTime: 'asc' },
        include: {
          attendees: true,
          linkedCases: true,
        },
      });

      return appointments;
    }),

  /**
   * Get appointment statistics
   */
  stats: tenantProcedure.query(async ({ ctx }) => {
    const scopeFilter = userScopeFilter(ctx.user);
    const [total, byStatus, byType, upcoming, overdue] = await Promise.all([
      ctx.prismaWithTenant.appointment.count({ where: scopeFilter }),
      ctx.prismaWithTenant.appointment.groupBy({
        by: ['status'],
        where: scopeFilter,
        _count: true,
      }),
      ctx.prismaWithTenant.appointment.groupBy({
        by: ['appointmentType'],
        where: scopeFilter,
        _count: true,
      }),
      ctx.prismaWithTenant.appointment.count({
        where: {
          ...scopeFilter,
          startTime: { gte: new Date() },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
      }),
      ctx.prismaWithTenant.appointment.count({
        where: {
          ...scopeFilter,
          endTime: { lt: new Date() },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
      }),
    ]);

    return {
      total,
      byStatus: byStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      byType: byType.reduce(
        (acc, item) => {
          acc[item.appointmentType] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      upcoming,
      overdue,
    };
  }),
});

// Export type for use in merged router
export type AppointmentsRouter = typeof appointmentsRouter;
