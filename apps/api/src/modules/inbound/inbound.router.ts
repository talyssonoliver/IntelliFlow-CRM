/**
 * Inbound Router — cross-repo intake from leangency-portal /discover form.
 *
 * The public Leangency portal (leangency.com /discover) captures discovery
 * questionnaires from prospective clients. Each successful submission is
 * forwarded here so the prospect lands as a Lead in this CRM.
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
 * Idempotency: the portal supplies a stable `submissionId` (Supabase row
 * id from `discover_submissions`). We tag the Lead with
 * `submission:<id>` so retries can be deduped via existing tag queries.
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
// Helpers
// ============================================================================

const SUBMISSION_TAG_PREFIX = 'submission:';
const PORTAL_TAG = 'portal-discover';

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
});
