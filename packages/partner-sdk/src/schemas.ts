/**
 * Partner API contract v1 (ADR-070).
 *
 * Zod schemas for every partner procedure input/output and for the tenant-aware
 * `inbound.*` intake procedures. The IntelliFlow API and the Portal both validate
 * against these; `contract/partner-contract.v1.json` is generated from them.
 */

import { z } from 'zod';

export const CONTRACT_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export const PARTNER_SCOPES = [
  'tenants:read',
  'tenants:write',
  'members:write',
  'auth:login-link',
  'usage:read',
] as const;
export const partnerScopeSchema = z.enum(PARTNER_SCOPES);
export type PartnerScope = z.infer<typeof partnerScopeSchema>;

/** Plans a partner may assign. */
export const PARTNER_PLANS = ['PARTNER_FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;
export const planInputSchema = z.enum(PARTNER_PLANS);
/** Plans that can appear in a response (an operator may hand-assign CUSTOM). */
export const planOutputSchema = z.enum([...PARTNER_PLANS, 'CUSTOM']);
export type PartnerPlan = z.infer<typeof planInputSchema>;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// partner.*
// ---------------------------------------------------------------------------

export const provisionTenantInputSchema = z.object({
  externalRef: z.string().uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(60).regex(SLUG_RE).optional(),
  plan: planInputSchema,
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1).max(120).optional(),
});
export const provisionTenantOutputSchema = z.object({
  tenantId: z.string(),
  slug: z.string(),
  plan: planOutputSchema,
  created: z.boolean(),
});

export const getTenantInputSchema = z.object({ externalRef: z.string().uuid() });
export const getTenantOutputSchema = z
  .object({
    tenantId: z.string(),
    slug: z.string(),
    plan: planOutputSchema,
    status: z.string(),
  })
  .nullable();

export const setPlanInputSchema = z.object({ tenantId: z.string().min(1), plan: planInputSchema });
export const setPlanOutputSchema = z.object({ tenantId: z.string(), plan: planOutputSchema });

export const inviteMemberInputSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  role: z.enum(['ADMIN', 'MEMBER']),
});
export const inviteMemberOutputSchema = z.object({ userId: z.string(), created: z.boolean() });

export const issueLoginLinkInputSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  redirectTo: z.string().url().optional(),
});
export const issueLoginLinkOutputSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string(),
});

export const getUsageInputSchema = z.object({ tenantId: z.string().min(1) });

const quotaSchema = z.object({ used: z.number(), limit: z.number().nullable() });
const measuredQuotaSchema = quotaSchema.extend({ measured: z.boolean() });

export const getUsageOutputSchema = z.object({
  tenantId: z.string(),
  plan: planOutputSchema,
  modules: z.array(z.string()),
  quotas: z.object({
    contacts: quotaSchema,
    seats: quotaSchema,
    emailsPerMonth: measuredQuotaSchema,
    aiSpendCentsPerMonth: measuredQuotaSchema,
  }),
  asOf: z.string(),
});

// ---------------------------------------------------------------------------
// inbound.*
// ---------------------------------------------------------------------------

/** Marketing attribution captured on the Portal and stored on the Lead. */
export const attributionSchema = z.object({
  utmSource: z.string().trim().max(200).optional(),
  utmMedium: z.string().trim().max(200).optional(),
  utmCampaign: z.string().trim().max(200).optional(),
  utmContent: z.string().trim().max(200).optional(),
  utmTerm: z.string().trim().max(200).optional(),
  clickId: z.string().trim().max(500).optional(),
  referrer: z.string().trim().max(2000).optional(),
  landingPath: z.string().trim().max(2000).optional(),
});
export type Attribution = z.infer<typeof attributionSchema>;

/** Mirrors `inbound.createLead` (inbound.router.ts) plus `attribution` and `externalRef`. */
export const inboundCreateLeadInputSchema = z.object({
  /** Idempotency key (the Portal's submission id). */
  submissionId: z.string().min(1),
  /** Portal tenant id; routes the lead to the partner-sourced IntelliFlow tenant. */
  externalRef: z.string().uuid().optional(),
  email: z.string().email(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  website: z.string().trim().max(500).optional(),
  location: z.string().trim().max(200).optional(),
  extraTags: z.array(z.string().max(50)).max(20).optional(),
  submissionPayload: z.record(z.string(), z.unknown()).optional(),
  attribution: attributionSchema.optional(),
});
export const inboundCreateLeadOutputSchema = z.object({
  leadId: z.string(),
  tenantId: z.string(),
  submissionId: z.string(),
  created: z.boolean(),
});

/** Mirrors `inbound.logCallBooking`. */
export const inboundLogCallBookingInputSchema = z.object({
  submissionId: z.string().min(1),
  externalRef: z.string().uuid().optional(),
  email: z.string().email(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  location: z.string().trim().max(200).optional(),
  website: z.string().trim().max(500).optional(),
  /** 'YYYY-MM-DD' */
  callDate: z.string(),
  /** 'HH:MM' (24-hour) */
  callTime: z.string(),
  durationMinutes: z.number().int().positive().optional(),
  notes: z.string().max(5000).optional(),
  extraTags: z.array(z.string().max(50)).max(20).optional(),
  attribution: attributionSchema.optional(),
});
export const inboundLogCallBookingOutputSchema = z.object({
  leadId: z.string(),
  tenantId: z.string(),
  submissionId: z.string(),
  leadCreated: z.boolean(),
  appointmentId: z.string().nullable(),
  taskId: z.string().nullable(),
});

/** `inbound.logSupportTicket` - the shape the Portal already sends (crm.ts). */
export const inboundLogSupportTicketInputSchema = z.object({
  /** Portal inbox thread id: idempotency key and cross-reference. */
  requestId: z.string().min(1),
  externalRef: z.string().uuid().optional(),
  email: z.string().email(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  company: z.string().trim().max(200).optional(),
  category: z.string().trim().min(1).max(50),
  subject: z.string().trim().min(1).max(300),
  message: z.string().min(1).max(10000),
  source: z.string().trim().max(50).optional(),
  extraTags: z.array(z.string().max(50)).max(20).optional(),
});
export const inboundLogSupportTicketOutputSchema = z.object({
  ticketId: z.string(),
  tenantId: z.string(),
  requestId: z.string(),
  created: z.boolean(),
});

// ---------------------------------------------------------------------------
// Registry (drives the client, the generated contract and the contract tests)
// ---------------------------------------------------------------------------

export type ProcedureKind = 'query' | 'mutation';

export const PROCEDURES = {
  'partner.provisionTenant': {
    kind: 'mutation',
    scope: 'tenants:write',
    input: provisionTenantInputSchema,
    output: provisionTenantOutputSchema,
  },
  'partner.getTenant': {
    kind: 'query',
    scope: 'tenants:read',
    input: getTenantInputSchema,
    output: getTenantOutputSchema,
  },
  'partner.setPlan': {
    kind: 'mutation',
    scope: 'tenants:write',
    input: setPlanInputSchema,
    output: setPlanOutputSchema,
  },
  'partner.inviteMember': {
    kind: 'mutation',
    scope: 'members:write',
    input: inviteMemberInputSchema,
    output: inviteMemberOutputSchema,
  },
  'partner.issueLoginLink': {
    kind: 'mutation',
    scope: 'auth:login-link',
    input: issueLoginLinkInputSchema,
    output: issueLoginLinkOutputSchema,
  },
  'partner.getUsage': {
    kind: 'query',
    scope: 'usage:read',
    input: getUsageInputSchema,
    output: getUsageOutputSchema,
  },
  'inbound.createLead': {
    kind: 'mutation',
    scope: null,
    input: inboundCreateLeadInputSchema,
    output: inboundCreateLeadOutputSchema,
  },
  'inbound.logCallBooking': {
    kind: 'mutation',
    scope: null,
    input: inboundLogCallBookingInputSchema,
    output: inboundLogCallBookingOutputSchema,
  },
  'inbound.logSupportTicket': {
    kind: 'mutation',
    scope: null,
    input: inboundLogSupportTicketInputSchema,
    output: inboundLogSupportTicketOutputSchema,
  },
} as const;

export type ProcedureName = keyof typeof PROCEDURES;
export type ProcedureInput<N extends ProcedureName> = z.input<(typeof PROCEDURES)[N]['input']>;
export type ProcedureOutput<N extends ProcedureName> = z.output<(typeof PROCEDURES)[N]['output']>;
