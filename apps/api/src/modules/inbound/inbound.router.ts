/**
 * Inbound Router — cross-repo intake from leangency-portal.
 *
 * Four procedures (callers: leangency-portal for 1-3, and the outbound
 * prospecting system `client-acquisition-leangency` (COA) for 4):
 *
 * 1. `createLead` — /discover form submissions from leangency.com.
 *    Each successful submission lands as a Lead in this CRM.
 *
 * 2. `logCallBooking` — discovery-call bookings from the portal.
 *    Dedupes or creates the Lead, then attaches an Appointment, a
 *    reminder Task, and a LeadActivity for the booking event.
 *
 * 3. `logSupportTicket` — client support requests from the portal inbox.
 *    Creates a Ticket in the bound tenant.
 *
 * 4. `syncPipelineLead` — COA hands its contacted leads into this CRM, the
 *    single source of truth for the sales funnel (S-0204). Dedupes by
 *    (tenant, email) so a site lead and a COA lead for the same person are
 *    ONE record, then moves its status forward only (never back, never out of
 *    CONVERTED/LOST), stepping through LeadService so domain events fire.
 *    The sync NEVER sets CONVERTED: conversion runs a workflow that creates or
 *    links a Contact, so a COA win stops at NEGOTIATING, is tagged `coa-won`
 *    and noted, and a human converts it in the CRM.
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
 *   - logSupportTicket: the creating TicketActivity carries
 *     systemEventData.requestId (the portal inbox thread id).
 *   - syncPipelineLead: a NOTE LeadActivity carries metadata.syncKey
 *     `coa-sync:<coaLeadId>:<coaStage>:<status>`; a repeat of the same stage is a no-op.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure } from '../../trpc';
import type { Prisma } from '@intelliflow/db';
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
  /** Full original payload — stored as JSON metadata on a NOTE LeadActivity. */
  submissionPayload: z.record(z.string(), z.unknown()).optional(),
  /**
   * Portal tenant externalRef (uuid). Accepted but ignored for now.
   * TODO(ADR-070): resolve the tenant by Tenant.externalRef once that column
   * lands; until then the tenant comes from LEANGENCY_TENANT_ID.
   */
  externalRef: z.string().uuid().optional(),
  /** Marketing attribution — stored with the submission record until Lead columns exist. */
  attribution: z
    .object({
      utmSource: z.string().max(512).optional(),
      utmMedium: z.string().max(512).optional(),
      utmCampaign: z.string().max(512).optional(),
      utmContent: z.string().max(512).optional(),
      utmTerm: z.string().max(512).optional(),
      clickId: z.string().max(512).optional(),
      referrer: z.string().max(512).optional(),
      landingPath: z.string().max(512).optional(),
    })
    .optional(),
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
// logSupportTicket — Input Schema & Output Interface
// ============================================================================

/**
 * Input for `inbound.logSupportTicket`. Mirrors the payload built by
 * `forwardSupportTicketToIntelliFlow` in leangency-portal
 * (src/lib/integrations/crm.ts). `requestId` is the portal inbox thread id.
 */
export const inboundSupportTicketSchema = z.object({
  /** Portal inbox thread id — idempotency key. */
  requestId: z.string().min(1).max(200),
  email: z.string().email(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  /** Tenant slug of the reporting client. */
  company: z.string().trim().max(200).optional(),
  /** 'bug' | 'change' | 'question' (free-form tolerated). */
  category: z.string().trim().max(50).optional(),
  subject: z.string().trim().min(1).max(500),
  message: z.string().max(20000),
  source: z.string().trim().max(50).optional(),
  extraTags: z.array(z.string().max(50)).max(20).optional(),
});

export type InboundSupportTicketInput = z.infer<typeof inboundSupportTicketSchema>;

export interface InboundSupportTicketOutput {
  readonly ticketId: string;
  /** False when the requestId was already ingested (idempotent retry). */
  readonly created: boolean;
}

// ============================================================================
// syncPipelineLead — Input Schema & Output Interface
// ============================================================================

const PIPELINE_TARGET_STATUSES = [
  'CONTACTED',
  'QUALIFIED',
  'NEGOTIATING',
  'CONVERTED',
  'LOST',
] as const;

/**
 * Input for `inbound.syncPipelineLead`. Sent by COA (client-acquisition-leangency)
 * when a prospecting lead moves through its pipeline. `status` is already mapped
 * to the CRM funnel by the caller; `coaStage` is the raw COA stage (audit only).
 */
export const inboundPipelineLeadSchema = z.object({
  /** COA Lead id — identity on the COA side. */
  coaLeadId: z.string().min(1).max(200),
  /** Dedup key in this CRM (tenant + email). */
  email: z.string().email(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  website: z.string().trim().max(500).optional(),
  location: z.string().trim().max(200).optional(),
  /** Target funnel status. */
  status: z.enum(PIPELINE_TARGET_STATUSES),
  /** Raw COA crmStage — audit note only. */
  coaStage: z.string().max(50),
  /** When COA moved the lead (ISO datetime). */
  stageChangedAt: z.string().datetime(),
});

export type InboundPipelineLeadInput = z.infer<typeof inboundPipelineLeadSchema>;

type PipelineLeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'NEGOTIATING'
  | 'UNQUALIFIED'
  | 'CONVERTED'
  | 'LOST';

export interface InboundPipelineLeadOutput {
  readonly leadId: string;
  readonly tenantId: string;
  /** True when this call created the Lead; false when it already existed. */
  readonly created: boolean;
  readonly previousStatus: PipelineLeadStatus;
  readonly status: PipelineLeadStatus;
  /** True when at least one status transition was applied. */
  readonly changed: boolean;
  /**
   * True when COA reported the lead as won (status CONVERTED) but the CRM lead
   * is not CONVERTED: the sync caps at NEGOTIATING and tags `coa-won`; a human
   * converts it. Always present so a COA-side consumer can rely on it.
   */
  readonly conversionPending: boolean;
  /**
   * True when COA reported the lead qualified (or further) but the CRM's own
   * qualification rule (minimum score) refused it: the sync stops at CONTACTED,
   * tags `coa-qualified` and notes the refusal. Always present.
   */
  readonly qualificationPending: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

const SUPPORT_EVENT_TYPE = 'portal_support_request';
const SUBMISSION_TAG_PREFIX = 'submission:';
const PORTAL_TAG = 'portal-discover';
const BOOKING_TAG = 'portal-call-booking';
const BOOKING_EXTERNAL_ID_PREFIX = 'booking:';

const COA_PIPELINE_TAG = 'coa-pipeline';
const COA_LEAD_TAG_PREFIX = 'coa-lead:';
const COA_SYNC_USER = 'System (COA sync)';
const COA_WON_TAG = 'coa-won';
const COA_QUALIFIED_TAG = 'coa-qualified';

/** Forward-only rank. LOST / CONVERTED are terminal for the pipeline route. */
const PIPELINE_RANK: Record<string, number> = {
  NEW: 0,
  UNQUALIFIED: 0,
  CONTACTED: 1,
  QUALIFIED: 2,
  NEGOTIATING: 3,
  CONVERTED: 4,
};

/**
 * The funnel ladder walked one valid LeadService transition at a time. It stops
 * at NEGOTIATING on purpose: CONVERTED is never applied by the sync (see
 * `planPipelineSteps`).
 */
const PIPELINE_LADDER: readonly PipelineLeadStatus[] = ['CONTACTED', 'QUALIFIED', 'NEGOTIATING'];

/**
 * Decide the ordered list of statuses to move through. Empty = no change.
 * Never resurrects CONVERTED/LOST and never downgrades. A COA win (target
 * CONVERTED) is capped at NEGOTIATING: converting runs a workflow that creates
 * or links a Contact and emits LeadConvertedEvent, which a status walk through
 * changeLeadStatus would skip, leaving a converted lead with no Contact.
 */
function planPipelineSteps(current: string, target: PipelineLeadStatus): PipelineLeadStatus[] {
  if (current === 'CONVERTED' || current === 'LOST') return [];
  if (target === 'LOST') return ['LOST'];
  const cappedTarget = target === 'CONVERTED' ? 'NEGOTIATING' : target;
  const currentRank = PIPELINE_RANK[current];
  const targetRank = PIPELINE_RANK[cappedTarget];
  if (currentRank === undefined || targetRank === undefined) return [];
  if (targetRank <= currentRank) return [];
  return PIPELINE_LADDER.filter((s) => {
    const r = PIPELINE_RANK[s] as number;
    return r > currentRank && r <= targetRank;
  });
}

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
  if (
    parts.length !== 2 ||
    parts[0]?.toLowerCase() !== 'bearer' ||
    !secretsMatch(parts[1], secret)
  ) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid bearer token' });
  }
}

/** Constant-time compare; hashing first makes both buffers the same length. */
function secretsMatch(candidate: string | undefined, secret: string): boolean {
  const a = createHash('sha256')
    .update(candidate ?? '')
    .digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
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

/**
 * Persist the raw submission (payload + attribution) as a NOTE LeadActivity so
 * repeat submissions leave a trace. Best-effort: the lead is already safe, so a
 * failure is logged, never thrown.
 */
async function recordSubmission(
  ctx: Context,
  input: InboundLeadInput,
  leadId: string,
  tenantId: string,
  repeat: boolean
): Promise<void> {
  try {
    await ctx.prisma.leadActivity.create({
      data: {
        type: 'NOTE',
        title: repeat
          ? `Repeat portal submission ${input.submissionId}`
          : `Portal submission ${input.submissionId}`,
        description: repeat
          ? 'Submission from an email that already had a lead'
          : 'Original portal /discover submission',
        timestamp: new Date(),
        userName: 'System (portal)',
        leadId,
        tenantId,
        metadata: {
          source: 'portal-discover-submission',
          submissionId: input.submissionId,
          repeat,
          ...(input.submissionPayload ? { submissionPayload: input.submissionPayload } : {}),
          ...(input.attribution ? { attribution: input.attribution } : {}),
        } as Prisma.InputJsonObject,
      },
    });
  } catch (err) {
    console.warn('[inbound.createLead] submission record failed:', {
      leadId,
      submissionId: input.submissionId,
      error: err instanceof Error ? err.message : err,
    });
  }
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
    /** Source stamped on a NEWLY created lead. Defaults to 'WEBSITE'. */
    source?: 'WEBSITE' | 'EMAIL';
  }
): Promise<{ leadId: string; leadCreated: boolean }> {
  const leadService = getLeadService(ctx);
  // The Email value object stores addresses trimmed and lowercased, so a
  // lookup with the caller's casing ('Sam@x.com') would miss the stored
  // 'sam@x.com', createLead would then refuse it as a duplicate, and the
  // race lookup below would miss it again: a failed merge, not a merge.
  const email = input.email.trim().toLowerCase();

  // Fast path: lead already exists?
  const existing = await ctx.prisma.lead.findFirst({
    where: { tenantId: input.tenantId, email },
    select: { id: true },
  });
  if (existing) {
    return { leadId: existing.id, leadCreated: false };
  }

  const result = await leadService.createLead({
    email,
    firstName: input.firstName,
    lastName: input.lastName,
    company: input.company,
    phone: input.phone,
    source: input.source ?? 'WEBSITE',
    location: input.location,
    website: input.website,
    tags: input.tags,
    ownerId: input.ownerId,
    tenantId: input.tenantId,
  });

  if (result.isFailure) {
    const { message } = result.error;
    // Any failure may be a race: another request created the lead between the
    // check above and createLead. That shows up as the service's duplicate
    // refusal, or as a persistence failure when the unique index rejects the
    // insert. Re-read before deciding what this failure means.
    const raceExisting = await ctx.prisma.lead.findFirst({
      where: { tenantId: input.tenantId, email },
      select: { id: true },
    });
    if (raceExisting) {
      return { leadId: raceExisting.id, leadCreated: false };
    }
    // No lead exists, so the failure is real. An infrastructure failure is the
    // server's, and retryable: a 4xx would make a server-to-server caller drop
    // it for good. Only a genuine input or domain refusal is the caller's.
    const code = (result.error as { code?: string }).code;
    if (code === 'PERSISTENCE_ERROR' || code === 'EXTERNAL_SERVICE_ERROR') {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message, cause: result.error });
    }
    throw new TRPCError({ code: 'BAD_REQUEST', message });
  }

  return { leadId: result.value.id.value, leadCreated: true };
}

/**
 * Read the existing lead's status and add any missing COA tags (best-effort,
 * logged on failure). Returns the lead's current status.
 */
async function mergeCoaTags(
  ctx: Context,
  leadId: string,
  tenantId: string,
  coaTags: string[],
  coaLeadId: string
): Promise<PipelineLeadStatus> {
  const existing = await ctx.prisma.lead.findFirst({
    where: { id: leadId, tenantId },
    select: { id: true, status: true, tags: true },
  });
  const have: string[] = Array.isArray(existing?.tags) ? (existing.tags as string[]) : [];
  await appendMissingTags(ctx, leadId, tenantId, have, coaTags, coaLeadId);
  return (existing?.status as PipelineLeadStatus | undefined) ?? 'NEW';
}

/**
 * Append the tags not in `have` (best-effort, logged on failure) with the
 * tenant-scoped, de-duplicating UPDATE.
 */
async function appendMissingTags(
  ctx: Context,
  leadId: string,
  tenantId: string,
  have: string[],
  tags: string[],
  coaLeadId: string
): Promise<void> {
  const missing = tags.filter((t) => !have.includes(t));
  if (missing.length > 0) {
    try {
      // Idempotent at write time: the `missing` list was decided from a read
      // that a concurrent sync may already have outdated, and Prisma's `push`
      // never dedupes, so two syncs would store the same tag twice. Merge the
      // distinct values inside one UPDATE (order-preserving) instead. Scoped by
      // id AND tenant on the same client every other query in this router uses.
      await ctx.prisma.$executeRaw`
        UPDATE "leads"
        SET "tags" = ARRAY(
          SELECT u.tag
          FROM unnest("tags" || ${missing}::text[]) WITH ORDINALITY AS u(tag, ord)
          GROUP BY u.tag
          ORDER BY MIN(u.ord)
        )
        WHERE "id" = ${leadId} AND "tenantId" = ${tenantId}
      `;
    } catch (err) {
      console.warn('[inbound.syncPipelineLead] tag merge failed:', {
        leadId,
        coaLeadId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}

/** True when COA reported a win the CRM has not converted (the sync never does). */
function isConversionPending(requested: PipelineLeadStatus, status: PipelineLeadStatus): boolean {
  return requested === 'CONVERTED' && status !== 'CONVERTED';
}

/**
 * Tag a COA win `coa-won` so a human converts it in the CRM. Skipped when the
 * lead is already CONVERTED. Same idempotent, tenant-scoped append as the COA
 * tags; reads the current tags so a lead already carrying it is not rewritten.
 */
async function tagCoaWon(
  ctx: Context,
  input: InboundPipelineLeadInput,
  leadId: string,
  tenantId: string,
  status: PipelineLeadStatus
): Promise<void> {
  if (input.status !== 'CONVERTED' || status === 'CONVERTED') return;
  await appendCoaTag(ctx, input, leadId, tenantId, COA_WON_TAG);
}

/** Tag a lead COA reported qualified that the CRM score gate refused. */
async function tagCoaQualified(
  ctx: Context,
  input: InboundPipelineLeadInput,
  leadId: string,
  tenantId: string,
  refusal: QualificationRefusal | null
): Promise<void> {
  if (!refusal) return;
  await appendCoaTag(ctx, input, leadId, tenantId, COA_QUALIFIED_TAG);
}

async function appendCoaTag(
  ctx: Context,
  input: InboundPipelineLeadInput,
  leadId: string,
  tenantId: string,
  tag: string
): Promise<void> {
  const lead = await ctx.prisma.lead.findFirst({
    where: { id: leadId, tenantId },
    select: { tags: true },
  });
  const have: string[] = Array.isArray(lead?.tags) ? (lead.tags as string[]) : [];
  await appendMissingTags(ctx, leadId, tenantId, have, [tag], input.coaLeadId);
}

function describePipelineSync(
  input: InboundPipelineLeadInput,
  from: PipelineLeadStatus,
  to: PipelineLeadStatus,
  refusal: QualificationRefusal | null
): string {
  let text = `COA lead ${input.coaLeadId} moved to ${input.coaStage} at ${input.stageChangedAt}; CRM status ${from} → ${to}`;
  if (isConversionPending(input.status, to)) {
    text += `. COA reported this lead as WON (${input.coaStage} at ${input.stageChangedAt}); the sync does not convert leads, so it is capped at ${to} and tagged ${COA_WON_TAG}: convert it in the CRM`;
  }
  if (refusal) {
    const numbers =
      refusal.score !== undefined && refusal.minScore !== undefined
        ? ` (score ${refusal.score}, minimum ${refusal.minScore})`
        : '';
    text += `. COA reported this lead qualified, but the CRM score gate refused the qualification${numbers}; the sync stopped at ${to} and tagged ${COA_QUALIFIED_TAG}: qualify it in the CRM once it scores high enough`;
  }
  return text;
}

/** Audit NOTE + idempotency marker for a COA pipeline sync. Best-effort. */
async function recordPipelineSync(
  ctx: Context,
  input: InboundPipelineLeadInput,
  leadId: string,
  tenantId: string,
  from: PipelineLeadStatus,
  to: PipelineLeadStatus,
  syncKey: string,
  refusal: QualificationRefusal | null
): Promise<void> {
  try {
    // Existence check + insert must be atomic per syncKey: two concurrent
    // requests both pass the early `prior` lookup, so serialise them on a
    // transaction-scoped advisory lock (released at commit) and re-check on
    // `tx`. Only the marker is locked (short, no external calls); the status
    // walk stays outside because its compare-and-set writes refuse stale
    // moves, so a duplicated walk is a harmless no-op.
    await ctx.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${syncKey}, 0))`;
      const existing = await tx.leadActivity.findFirst({
        where: { leadId, tenantId, metadata: { path: ['syncKey'], equals: syncKey } },
        select: { id: true },
      });
      if (existing) return;
      await tx.leadActivity.create({
        data: {
          type: 'NOTE',
          title: `COA pipeline: ${input.coaStage} → ${input.status}`,
          description: describePipelineSync(input, from, to, refusal),
          timestamp: new Date(),
          userName: COA_SYNC_USER,
          leadId,
          tenantId,
          metadata: {
            source: 'coa-pipeline-sync',
            coaLeadId: input.coaLeadId,
            coaStage: input.coaStage,
            status: input.status,
            stageChangedAt: input.stageChangedAt,
            ...(isConversionPending(input.status, to)
              ? { coaWon: true, conversionPending: true, appliedStatus: to }
              : {}),
            ...(refusal
              ? {
                  qualificationPending: true,
                  ...(refusal.score !== undefined ? { qualificationScore: refusal.score } : {}),
                  ...(refusal.minScore !== undefined
                    ? { qualificationMinScore: refusal.minScore }
                    : {}),
                }
              : {}),
            syncKey,
          } as Prisma.InputJsonObject,
        },
      });
    });
  } catch (err) {
    console.warn('[inbound.syncPipelineLead] audit note failed:', {
      leadId,
      syncKey,
      error: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * Re-read the lead's status after a refused step. A throwing re-read is an
 * infrastructure failure: log the cause and surface a retryable 500 rather
 * than letting a raw error escape.
 */
async function rereadStatusAfterFailure(
  ctx: Context,
  leadId: string,
  tenantId: string,
  step: PipelineLeadStatus,
  stepError: { message: string }
): Promise<{ status: string } | null> {
  try {
    return await ctx.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: { status: true },
    });
  } catch (err) {
    console.error('[inbound.syncPipelineLead] status re-read failed:', {
      leadId,
      step,
      stepError: stepError.message,
      error: err instanceof Error ? err.message : err,
    });
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Lead status could not be confirmed after a failed update',
      cause: err,
    });
  }
}

/** Why the CRM refused to qualify a lead COA reported as qualified. */
interface QualificationRefusal {
  readonly score?: number;
  readonly minScore?: number;
}

/**
 * The real qualify operation refused on the minimum-score rule. Detected by the
 * error's `reason` discriminator (LeadScoreBelowMinimumError, code
 * VALIDATION_ERROR), never by its message.
 */
function asScoreRefusal(error: unknown): QualificationRefusal | null {
  const e = error as { reason?: unknown; score?: unknown; minScore?: unknown } | null;
  if (e?.reason !== 'LEAD_SCORE_BELOW_MINIMUM') return null;
  return {
    score: typeof e.score === 'number' ? e.score : undefined,
    minScore: typeof e.minScore === 'number' ? e.minScore : undefined,
  };
}

interface PipelineWalk {
  readonly status: PipelineLeadStatus;
  readonly moved: boolean;
  readonly refusal: QualificationRefusal | null;
}

/**
 * Apply one ladder step. QUALIFIED goes through the real qualify operation (it
 * enforces the minimum score, emits LeadQualifiedEvent and compare-and-sets the
 * status); every other step is a plain status change.
 */
function applyPipelineStep(
  leadService: ReturnType<typeof getLeadService>,
  leadId: string,
  step: PipelineLeadStatus,
  input: InboundPipelineLeadInput
) {
  return step === 'QUALIFIED'
    ? leadService.qualifyLead(
        leadId,
        COA_SYNC_USER,
        `COA lead ${input.coaLeadId} reached ${input.coaStage} at ${input.stageChangedAt}`
      )
    : leadService.changeLeadStatus(leadId, step, COA_SYNC_USER);
}

/**
 * Forward-only walk. A score refusal of the QUALIFIED step stops the walk where
 * it is (no later step, no direct status set); a concurrent move re-reads and
 * replans; anything else surfaces as before.
 */
async function walkPipeline(
  ctx: Context,
  leadService: ReturnType<typeof getLeadService>,
  input: InboundPipelineLeadInput,
  leadId: string,
  tenantId: string,
  currentStatus: PipelineLeadStatus
): Promise<PipelineWalk> {
  let pending = planPipelineSteps(currentStatus, input.status);
  let status: PipelineLeadStatus = currentStatus;
  let moved = false;
  let replans = 0;
  while (pending.length > 0) {
    const step = pending[0] as PipelineLeadStatus;
    const result = await applyPipelineStep(leadService, leadId, step, input);
    if (result.isFailure) {
      const refusal = step === 'QUALIFIED' ? asScoreRefusal(result.error) : null;
      if (refusal) return { status, moved, refusal };
      // A concurrent sync of the same lead may have moved it first, which
      // turns this step into an invalid transition or a compare-and-set
      // conflict. Re-read: if the lead moved, replan from where it is now.
      const now = await rereadStatusAfterFailure(ctx, leadId, tenantId, step, result.error);
      if (now && now.status !== status && replans < 3) {
        replans += 1;
        status = now.status as PipelineLeadStatus;
        pending = planPipelineSteps(now.status, input.status);
        continue;
      }
      throwStepFailure(leadId, step, result.error);
    }
    status = step;
    moved = true;
    pending = pending.slice(1);
  }
  return { status, moved, refusal: null };
}

/**
 * A refusal the lead's own movement cannot explain. Infrastructure failures are
 * retryable server errors (COA must not treat them as permanent); only a
 * refused transition is a client error.
 */
function throwStepFailure(
  leadId: string,
  step: PipelineLeadStatus,
  error: { code?: string; message: string }
): never {
  if (error.code === 'PERSISTENCE_ERROR' || error.code === 'EXTERNAL_SERVICE_ERROR') {
    console.error('[inbound.syncPipelineLead] status update failed:', {
      leadId,
      step,
      error: error.message,
    });
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
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
            await recordSubmission(ctx, input, existing.id, tenantId, true);
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

      if (input.submissionPayload || input.attribution) {
        await recordSubmission(ctx, input, result.value.id.value, tenantId, false);
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

  /**
   * Create a support Ticket from a portal client problem/change report.
   *
   * Behaviour:
   *   - 401 UNAUTHORIZED — missing or wrong bearer
   *   - 500 INTERNAL     — env not configured (secret / tenant / user / service)
   *   - 200              — ticket created (`created: true`)
   *   - 200              — repeat `requestId` returns the existing ticket (`created: false`)
   *
   * Idempotency: the creating SYSTEM_EVENT TicketActivity stores
   * `systemEventData.requestId`; Ticket has no external-id column.
   */
  logSupportTicket: publicProcedure
    .input(inboundSupportTicketSchema)
    .mutation(async ({ ctx, input }): Promise<InboundSupportTicketOutput> => {
      assertAuthorised(ctx);
      const { tenantId } = getInboundBinding();
      const ticketService = ctx.services?.ticket;
      if (!ticketService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ticket service not available',
        });
      }

      // Serialize per requestId: without the lock two concurrent retries both miss the lookup
      // and create duplicate tickets. The ticket and its marker are written on the SAME
      // transaction client, so they commit or roll back together; the lock is released at
      // commit. A marker failure therefore rethrows (rolling the ticket back) instead of
      // leaving a ticket with no marker for the next retry to duplicate.
      const lockKey = `support:${input.requestId}`;
      return ctx.prisma.$transaction(
        async (tx): Promise<InboundSupportTicketOutput> => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

          const prior = await tx.ticketActivity.findFirst({
            where: {
              tenantId,
              systemEventType: SUPPORT_EVENT_TYPE,
              systemEventData: { path: ['requestId'], equals: input.requestId },
            },
            select: { ticketId: true },
          });
          if (prior) {
            return { ticketId: prior.ticketId, created: false } as InboundSupportTicketOutput;
          }

          const defaultSla = await tx.sLAPolicy.findFirst({
            where: { tenantId, isDefault: true },
            select: { id: true },
          });
          const contactName =
            [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || input.email;

          let ticket: { id: string };
          try {
            ticket = await ticketService.create(
              {
                subject: input.subject.slice(0, 200),
                description: input.message,
                priority: input.category === 'bug' ? 'HIGH' : 'MEDIUM',
                contactName: contactName.slice(0, 100),
                contactEmail: input.email,
                slaPolicyId: defaultSla?.id,
                tenantId,
              },
              tx
            );
          } catch (err) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: err instanceof Error ? err.message : 'Failed to create ticket',
            });
          }

          try {
            await tx.ticketActivity.create({
              data: {
                ticketId: ticket.id,
                tenantId,
                type: 'SYSTEM_EVENT',
                content: `Portal support request ${input.requestId}`,
                authorName: 'System (portal)',
                authorRole: 'System',
                channel: 'PORTAL',
                systemEventType: SUPPORT_EVENT_TYPE,
                systemEventData: {
                  requestId: input.requestId,
                  ...(input.category ? { category: input.category } : {}),
                  ...(input.company ? { tenantSlug: input.company } : {}),
                  ...(input.source ? { source: input.source } : {}),
                  ...(input.extraTags ? { tags: input.extraTags } : {}),
                },
              },
            });
          } catch (err) {
            // Without this marker a retry would create a duplicate ticket, so the ticket
            // must not survive on its own: rethrow and let the transaction roll back.
            console.error('[inbound.logSupportTicket] idempotency marker failed:', {
              ticketId: ticket.id,
              requestId: input.requestId,
              error: err instanceof Error ? err.message : err,
            });
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to record the support request; please retry',
            });
          }

          return { ticketId: ticket.id, created: true };
        },
        { maxWait: 10_000, timeout: 30_000 }
      );
    }),

  /**
   * Sync a COA (outbound prospecting) lead into the CRM funnel.
   *
   * Behaviour:
   *   - 401 UNAUTHORIZED — missing or wrong bearer
   *   - 500 INTERNAL     — env not configured (secret / tenant / user / service)
   *   - 400 BAD_REQUEST  — LeadService refused a status step (invalid transition)
   *   - 500 INTERNAL     — persistence/infrastructure failure (retryable)
   *   - QUALIFIED is reached via LeadService.qualifyLead (minimum-score rule,
   *     LeadQualifiedEvent, compare-and-set). A score refusal stops the walk at
   *     CONTACTED, tags `coa-qualified`, notes it, and reports `qualificationPending`.
   *   - 200              — lead upserted by (tenant, email); status moved forward
   *                         only, never to CONVERTED (a COA win stops at NEGOTIATING,
   *                         is tagged `coa-won`, and reports `conversionPending`);
   *                         `changed` says whether anything moved.
   *
   * Idempotency: the audit NOTE LeadActivity carries metadata.syncKey
   * `coa-sync:<coaLeadId>:<coaStage>:<status>`. A repeat of that key returns early with
   * changed:false before any status call. Tags and the audit note are
   * best-effort (logged, not thrown).
   */
  syncPipelineLead: publicProcedure
    .input(inboundPipelineLeadSchema)
    .mutation(async ({ ctx, input }): Promise<InboundPipelineLeadOutput> => {
      assertAuthorised(ctx);
      const { tenantId, ownerId } = getInboundBinding();
      const leadService = getLeadService(ctx);

      const coaTags = [COA_PIPELINE_TAG, `${COA_LEAD_TAG_PREFIX}${input.coaLeadId}`];

      // --- Step 1: upsert by (tenant, email) ---------------------------------
      const { leadId, leadCreated } = await upsertLeadByEmail(ctx, {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        company: input.company,
        phone: input.phone,
        location: input.location,
        website: input.website,
        tags: coaTags,
        ownerId,
        tenantId,
        source: 'EMAIL',
      });

      let currentStatus: PipelineLeadStatus = 'NEW';
      if (!leadCreated) {
        currentStatus = await mergeCoaTags(ctx, leadId, tenantId, coaTags, input.coaLeadId);
      }

      // --- Step 3: idempotency ------------------------------------------------
      // coaStage is in the key: MEETING_BOOKED and a later PROPOSAL_READY both map to
      // NEGOTIATING, and the second must still get its own audit note.
      // stageChangedAt is in it too: COA sends the time of the latest event INTO
      // the stage, so a retry of the same entry is still deduplicated, while a
      // lead that genuinely re-enters the stage later (after being reopened)
      // gets a new transition instead of being suppressed for ever.
      // The key uses the REQUESTED status, not the capped one: it names COA's
      // event (a retry sends the identical payload, so it dedupes identically),
      // and keying on the capped value would collide a won event with a genuine
      // NEGOTIATING entry made at the same stage and time.
      const syncKey = `coa-sync:${input.coaLeadId}:${input.coaStage}:${input.status}:${input.stageChangedAt}`;
      const prior = await ctx.prisma.leadActivity.findFirst({
        where: { leadId, tenantId, metadata: { path: ['syncKey'], equals: syncKey } },
        select: { id: true, metadata: true },
      });
      if (prior) {
        const priorMeta = prior.metadata as { qualificationPending?: unknown } | null;
        return {
          leadId,
          tenantId,
          created: leadCreated,
          previousStatus: currentStatus,
          status: currentStatus,
          changed: false,
          conversionPending: isConversionPending(input.status, currentStatus),
          qualificationPending: priorMeta?.qualificationPending === true,
        };
      }

      // --- Step 2: forward-only walk through LeadService ----------------------
      const { status, moved, refusal } = await walkPipeline(
        ctx,
        leadService,
        input,
        leadId,
        tenantId,
        currentStatus
      );

      await tagCoaWon(ctx, input, leadId, tenantId, status);
      await tagCoaQualified(ctx, input, leadId, tenantId, refusal);

      // Always record THIS request's audit note and syncKey marker so a retry of
      // the same key short-circuits, even when another writer did the moving or
      // the qualification was refused; recordPipelineSync is idempotent per
      // syncKey because the early `prior` lookup above skips a repeat.
      await recordPipelineSync(
        ctx,
        input,
        leadId,
        tenantId,
        currentStatus,
        status,
        syncKey,
        refusal
      );

      return {
        leadId,
        tenantId,
        created: leadCreated,
        previousStatus: currentStatus,
        status,
        changed: moved,
        conversionPending: isConversionPending(input.status, status),
        qualificationPending: refusal !== null,
      };
    }),
});
