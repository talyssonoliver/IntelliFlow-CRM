/**
 * Inbound Router — cross-repo intake from leangency-portal.
 *
 * Two procedures:
 *
 * 1. `createLead` — /discover form submissions from leangency.com.
 *    Each successful submission lands as a Lead in this CRM.
 *
 * 2. `logCallBooking` — discovery-call bookings from the portal.
 *    Dedupes or creates the Lead, then attaches an Appointment, a
 *    reminder Task, and a LeadActivity for the booking event.
 *
 * Auth: shared bearer `PORTAL_INTERNAL_SECRET` (server-to-server only).
 * The portal sends the SAME secret to two destinations (this CRM and the
 * lead-discovery pipeline at `client-acquisition-leangency`) — they MUST
 * match the value configured on the portal.
 *
 * Tenant binding (env-driven, single-tenant for now):
 *   - LEANGENCY_TENANT_ID       — tenant that owns inbound leads
 *   - LEANGENCY_SYSTEM_USER_ID  — user assigned as Lead owner
 *
 * Both must be set or this route returns 503. Easy to extend later by
 * resolving tenant from `sourceName` in the payload instead.
 *
 * Idempotency:
 *   - createLead: Lead tagged with `submission:<id>`.
 *   - logCallBooking: Appointment.externalCalendarId stores `booking:<submissionId>`.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure } from '../../trpc';
import type { Context } from '../../context';

// ============================================================================
// Input Schema
// ============================================================================

/**
 * Mirrors the leangency-portal `DiscoverFormData` shape, mapped to the
 * fields createLeadSchema accepts. The portal sends what it has; missing
 * fields are passed through as undefined.
 */
export const inboundLeadSchema = z.object({
  /** Supabase `discover_submissions.id` — required for idempotency. */
  submissionId: z.string().min(1),
  /** Contact email — the only field createLeadSchema requires. */
  email: z.string().email(),
  /** Optional name fields. Portal sends `fullName` which we split client-side. */
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  /** Maps from portal `brandName`. */
  company: z.string().trim().max(200).optional(),
  /** Portal `phone`. */
  phone: z.string().trim().max(50).optional(),
  /** Portal `currentWebsite` or `domainName` (caller picks). */
  website: z.string().trim().max(500).optional(),
  /** Portal `location`. */
  location: z.string().trim().max(200).optional(),
  /** Optional additional tags to attach to the Lead. */
  extraTags: z.array(z.string().max(50)).max(20).optional(),
  /** Full original payload — stored as JSON metadata on the create-activity log. */
  submissionPayload: z.record(z.string(), z.unknown()).optional(),
});

export type InboundLeadInput = z.infer<typeof inboundLeadSchema>;

export interface InboundLeadOutput {
  readonly leadId: string;
  readonly tenantId: string;
  readonly submissionId: string;
  /** Indicates whether a new Lead was created (false on idempotent retry). */
  readonly created: boolean;
}

// ============================================================================
// logCallBooking — Input Schema & Output Interface
// ============================================================================

/**
 * Input for `inbound.logCallBooking`.
 *
 * The portal sends this when a prospect books a discovery call.
 * `submissionId` is the booking's stable identifier (used as the
 * idempotency key — stored in Appointment.externalCalendarId as
 * `booking:<submissionId>`).
 */
export const inboundCallBookingSchema = z.object({
  /** The booking's stable id — idempotency key. */
  submissionId: z.string().min(1),
  /** Contact email — lead dedup key. */
  email: z.string().email(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  location: z.string().trim().max(200).optional(),
  website: z.string().trim().max(500).optional(),
  /** Call date as 'YYYY-MM-DD'. */
  callDate: z.string(),
  /** Call start time as 'HH:MM' (24-hour). */
  callTime: z.string(),
  /** Duration in minutes. Defaults to 30. */
  durationMinutes: z.number().int().positive().optional(),
  /** Free-form notes / message from the prospect. */
  notes: z.string().max(5000).optional(),
  /** Optional additional tags to attach to the Lead. */
  extraTags: z.array(z.string().max(50)).max(20).optional(),
});

export type InboundCallBookingInput = z.infer<typeof inboundCallBookingSchema>;

export interface InboundCallBookingOutput {
  readonly leadId: string;
  readonly tenantId: string;
  readonly submissionId: string;
  /** True when the Lead was newly created; false when deduped by email. */
  readonly leadCreated: boolean;
  /** ID of the created Appointment, or null if it failed (best-effort). */
  readonly appointmentId: string | null;
  /** ID of the created reminder Task, or null if it failed (best-effort). */
  readonly taskId: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

const SUBMISSION_TAG_PREFIX = 'submission:';
const PORTAL_TAG = 'portal-discover';
const BOOKING_TAG = 'portal-call-booking';
const BOOKING_EXTERNAL_ID_PREFIX = 'booking:';

function assertAuthorised(ctx: Context): void {
  const secret = process.env.PORTAL_INTERNAL_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'PORTAL_INTERNAL_SECRET not configured (require 16+ chars)',
    });
  }

  const headerValue =
    ctx.req?.headers.get('Authorization') ?? ctx.req?.headers.get('authorization');
  if (!headerValue) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing Authorization header' });
  }

  const parts = headerValue.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer' || parts[1] !== secret) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid bearer token' });
  }
}

function getInboundBinding(): { tenantId: string; ownerId: string } {
  const tenantId = process.env.LEANGENCY_TENANT_ID?.trim();
  const ownerId = process.env.LEANGENCY_SYSTEM_USER_ID?.trim();
  if (!tenantId || !ownerId) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'LEANGENCY_TENANT_ID / LEANGENCY_SYSTEM_USER_ID not configured',
    });
  }
  return { tenantId, ownerId };
}

function getLeadService(ctx: Context) {
  if (!ctx.services?.lead) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Lead service not available',
    });
  }
  return ctx.services.lead;
}

// ============================================================================
// Router
// ============================================================================

// ============================================================================
// Internal helper — upsert a Lead by email for inbound routes
// ============================================================================

/**
 * Parse a 'YYYY-MM-DD' date string and a 'HH:MM' time string into a UTC Date.
 * Treats the combined value as a UTC wall-clock time (the portal always sends UTC).
 */
function parseCallDateTime(callDate: string, callTime: string): Date {
  const iso = `${callDate}T${callTime}:00.000Z`;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Invalid callDate/callTime: '${callDate}' / '${callTime}'. Expected YYYY-MM-DD and HH:MM.`,
    });
  }
  return new Date(ts);
}

/**
 * Upsert a Lead by email for an inbound booking.
 * Returns `{ leadId, leadCreated }`.
 */
async function upsertLeadByEmail(
  ctx: Context,
  input: {
    email: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    phone?: string;
    location?: string;
    website?: string;
    tags: string[];
    ownerId: string;
    tenantId: string;
  }
): Promise<{ leadId: string; leadCreated: boolean }> {
  const leadService = getLeadService(ctx);

  // Fast path: lead already exists?
  const existing = await ctx.prisma.lead.findFirst({
    where: { tenantId: input.tenantId, email: input.email },
    select: { id: true },
  });
  if (existing) {
    return { leadId: existing.id, leadCreated: false };
  }

  const result = await leadService.createLead({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    company: input.company,
    phone: input.phone,
    source: 'WEBSITE',
    location: input.location,
    website: input.website,
    tags: input.tags,
    ownerId: input.ownerId,
    tenantId: input.tenantId,
  });

  if (result.isFailure) {
    const message = result.error.message;
    if (/already exists/i.test(message)) {
      // Race: another request created the lead between our check and create
      const raceExisting = await ctx.prisma.lead.findFirst({
        where: { tenantId: input.tenantId, email: input.email },
        select: { id: true },
      });
      if (raceExisting) {
        return { leadId: raceExisting.id, leadCreated: false };
      }
    }
    throw new TRPCError({ code: 'BAD_REQUEST', message });
  }

  return { leadId: result.value.id.value, leadCreated: true };
}

export const inboundRouter = createTRPCRouter({
  /**
   * Create a Lead from a portal /discover submission.
   *
   * Behaviour:
   *   - 401 UNAUTHORIZED  — missing or wrong bearer
   *   - 500 INTERNAL      — env not configured (secret / tenant / user / service)
   *   - 200               — created (returns leadId, created: true)
   *   - 200               — idempotent retry with same submissionId
   *                          returns existing leadId, created: false
   *
   * The portal stores the returned `leadId` on its Supabase
   * `discover_submissions.crm_lead_id` column for downstream correlation.
   */
  createLead: publicProcedure
    .input(inboundLeadSchema)
    .mutation(async ({ ctx, input }): Promise<InboundLeadOutput> => {
      assertAuthorised(ctx);
      const { tenantId, ownerId } = getInboundBinding();
      const leadService = getLeadService(ctx);

      // Idempotency: check for an existing Lead with the same email + the
      // submissionId tag. We use the email index first (cheap) and fall
      // through to tag match. (LeadService.createLead also rejects
      // duplicate emails, so this guards against accidental dedupe loss.)
      const submissionTag = `${SUBMISSION_TAG_PREFIX}${input.submissionId}`;
      try {
        const existing = await ctx.prisma.lead.findFirst({
          where: {
            tenantId,
            email: input.email,
            tags: { has: submissionTag },
          },
          select: { id: true },
        });
        if (existing) {
          return {
            leadId: existing.id,
            tenantId,
            submissionId: input.submissionId,
            created: false,
          };
        }
      } catch (e) {
        // If the dedup query fails (e.g. tags isn't a string[] yet),
        // fall through to LeadService which has its own email-dedup.
        console.warn('[inbound] dedup lookup failed:', e instanceof Error ? e.message : e);
      }

      const tags = [PORTAL_TAG, submissionTag, ...(input.extraTags ?? [])];

      const result = await leadService.createLead({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        company: input.company,
        phone: input.phone,
        source: 'WEBSITE',
        location: input.location,
        website: input.website,
        tags,
        ownerId,
        tenantId,
      });

      if (result.isFailure) {
        // If LeadService rejected for duplicate email, return the existing
        // lead (best-effort lookup). Otherwise surface as BAD_REQUEST.
        const message = result.error.message;
        if (/already exists/i.test(message)) {
          const existing = await ctx.prisma.lead.findFirst({
            where: { tenantId, email: input.email },
            select: { id: true },
          });
          if (existing) {
            return {
              leadId: existing.id,
              tenantId,
              submissionId: input.submissionId,
              created: false,
            };
          }
        }
        throw new TRPCError({ code: 'BAD_REQUEST', message });
      }

      return {
        leadId: result.value.id.value,
        tenantId,
        submissionId: input.submissionId,
        created: true,
      };
    }),

  /**
   * Log a discovery-call booking from the leangency portal.
   *
   * Behaviour:
   *   - 401 UNAUTHORIZED — missing or wrong bearer
   *   - 500 INTERNAL     — env not configured (secret / tenant / user / service)
   *   - 400 BAD_REQUEST  — invalid callDate/callTime or domain validation failure
   *   - 200              — lead upserted, appointment + task + activity attached
   *                         (appointment/task ids null if best-effort create failed)
   *   - 200              — idempotent retry (same submissionId) returns existing ids
   *
   * Idempotency: Appointment.externalCalendarId is set to `booking:<submissionId>`.
   * A second call with the same submissionId returns early once it finds that
   * appointment, attaching `leadCreated: false`.
   *
   * Steps 5–7 (Appointment, Task, LeadActivity) are best-effort relative to the
   * lead upsert: creation failures are logged as warnings but do not throw.
   */
  logCallBooking: publicProcedure
    .input(inboundCallBookingSchema)
    .mutation(async ({ ctx, input }): Promise<InboundCallBookingOutput> => {
      assertAuthorised(ctx);
      const { tenantId, ownerId } = getInboundBinding();

      // --- Step 2: compute call start/end -----------------------------------------
      const durationMs = (input.durationMinutes ?? 30) * 60 * 1000;
      const startTime = parseCallDateTime(input.callDate, input.callTime);
      const endTime = new Date(startTime.getTime() + durationMs);

      // --- Step 3: upsert Lead by email -------------------------------------------
      const bookingTag = `booking:${input.submissionId}`;
      const tags = [PORTAL_TAG, BOOKING_TAG, bookingTag, ...(input.extraTags ?? [])];

      const { leadId, leadCreated } = await upsertLeadByEmail(ctx, {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        company: input.company,
        phone: input.phone,
        location: input.location,
        website: input.website,
        tags,
        ownerId,
        tenantId,
      });

      // --- Step 4: idempotency — check if appointment already exists ---------------
      const externalId = `${BOOKING_EXTERNAL_ID_PREFIX}${input.submissionId}`;
      const existingAppointment = await ctx.prisma.appointment.findFirst({
        where: { tenantId, externalCalendarId: externalId },
        select: {
          id: true,
          // Retrieve task linked via the externalCalendarId-prefixed title search below
        },
      });

      if (existingAppointment) {
        // Also look up the companion task for completeness
        const existingTask = await ctx.prisma.task.findFirst({
          where: {
            tenantId,
            leadId,
            title: {
              startsWith: 'Discovery call —',
            },
          },
          select: { id: true },
        });

        return {
          leadId,
          tenantId,
          submissionId: input.submissionId,
          leadCreated: false,
          appointmentId: existingAppointment.id,
          taskId: existingTask?.id ?? null,
        };
      }

      // --- Steps 5–7: best-effort artifact creation --------------------------------
      const displayName =
        [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || input.email;

      let appointmentId: string | null = null;
      let taskId: string | null = null;

      // Step 5: Create Appointment
      try {
        const appointment = await ctx.prisma.appointment.create({
          data: {
            title: `Discovery call — ${displayName}`,
            description: input.notes ?? null,
            notes: input.notes ?? null,
            startTime,
            endTime,
            appointmentType: 'CALL',
            status: 'SCHEDULED',
            tenantId,
            organizerId: ownerId,
            externalCalendarId: externalId,
          },
          select: { id: true },
        });
        appointmentId = appointment.id;
      } catch (err) {
        console.warn('[inbound.logCallBooking] Appointment create failed:', {
          leadId,
          submissionId: input.submissionId,
          error: err instanceof Error ? err.message : err,
        });
      }

      // Step 6: Create reminder Task
      try {
        const notesSuffix = input.notes ? `\n\n${input.notes}` : '';
        const task = await ctx.prisma.task.create({
          data: {
            title: `Discovery call — ${displayName}`,
            description: `Scheduled discovery call with ${displayName}${notesSuffix}`,
            dueDate: startTime,
            priority: 'HIGH',
            status: 'PENDING',
            tenantId,
            ownerId,
            leadId,
          },
          select: { id: true },
        });
        taskId = task.id;
      } catch (err) {
        console.warn('[inbound.logCallBooking] Task create failed:', {
          leadId,
          submissionId: input.submissionId,
          error: err instanceof Error ? err.message : err,
        });
      }

      // Step 7: Create LeadActivity
      try {
        await ctx.prisma.leadActivity.create({
          data: {
            type: 'MEETING',
            title: `Discovery call booked — ${displayName}`,
            description: `Discovery call booked for ${input.callDate} at ${input.callTime} UTC (${input.durationMinutes ?? 30} min)`,
            timestamp: new Date(),
            userName: 'System (portal)',
            leadId,
            tenantId,
            metadata: {
              source: 'discovery-call-booking',
              submissionId: input.submissionId,
              callDate: input.callDate,
              callTime: input.callTime,
              durationMinutes: input.durationMinutes ?? 30,
              ...(input.notes ? { notes: input.notes } : {}),
              ...(appointmentId ? { appointmentId } : {}),
              ...(taskId ? { taskId } : {}),
            },
          },
        });
      } catch (err) {
        console.warn('[inbound.logCallBooking] LeadActivity create failed:', {
          leadId,
          submissionId: input.submissionId,
          error: err instanceof Error ? err.message : err,
        });
      }

      return {
        leadId,
        tenantId,
        submissionId: input.submissionId,
        leadCreated,
        appointmentId,
        taskId,
      };
    }),
});
