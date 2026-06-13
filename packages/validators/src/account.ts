import { z } from 'zod';
import { idSchema, paginationSchema, urlSchema, nameSchema } from './common';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Base account fields schema (DRY - used by create and update)
const baseAccountFieldsSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .transform((val) => val.trim()), // Company names can be longer
  website: urlSchema, // Uses WebsiteUrl Value Object transformer
  // IFC-270 B-08: trim before min(1) so a whitespace-only industry is rejected
  // rather than persisted as "" once the combined update forwards it to the
  // domain (matches the dedicated updateAccountIndustrySchema). Omit the field
  // entirely to leave industry unset.
  industry: z.string().trim().min(1).max(100).optional(),
  employees: z.number().int().positive().optional(),
  revenue: z.number().positive().optional(), // Could use moneySchema in future
  description: z
    .string()
    .max(1000)
    .transform((val) => val.trim())
    .optional(),
});

// Create Account Schema
export const createAccountSchema = baseAccountFieldsSchema.extend({
  parentAccountId: idSchema.optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

// Update Account Schema - all fields optional except id.
// IFC-270 B-08: parentAccountId is intentionally NOT accepted here — hierarchy
// changes go through the dedicated account.setParent procedure (cycle detection,
// max-depth and parent-existence are enforced there). Accepting it on update
// would silently no-op (it cannot be applied safely via updateAccountInfo).
export const updateAccountSchema = baseAccountFieldsSchema.partial().extend({
  id: idSchema,
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// IFC-270 B-10/11/12: dedicated single-field command schemas for the
// updateRevenue / updateEmployeeCount / categorizeIndustry router procedures.
// revenue: positive() — matches createAccountSchema/updateAccountSchema and
// avoids feeding 0 to the persistence layer, which currently coerces 0 to null
// via a truthiness check (PrismaAccountRepository.save — tracked follow-up).
// employees > 0; industry 1..100 chars (trimmed before the non-empty check).
export const updateAccountRevenueSchema = z.object({
  id: idSchema,
  revenue: z.number().positive(),
});
export type UpdateAccountRevenueInput = z.infer<typeof updateAccountRevenueSchema>;

export const updateAccountEmployeeCountSchema = z.object({
  id: idSchema,
  employees: z.number().int().positive(),
});
export type UpdateAccountEmployeeCountInput = z.infer<typeof updateAccountEmployeeCountSchema>;

export const updateAccountIndustrySchema = z.object({
  id: idSchema,
  // trim BEFORE min(1) so a whitespace-only industry ("   ") is rejected rather
  // than being transformed into an empty string and persisted.
  industry: z.string().trim().min(1).max(100),
});
export type UpdateAccountIndustryInput = z.infer<typeof updateAccountIndustrySchema>;

// IFC-269 B-04: Whitelist of safe sortable Account columns
export const ACCOUNT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'revenue',
  'employees',
  'industry',
] as const;
export type AccountSortField = (typeof ACCOUNT_SORT_FIELDS)[number];

// Account Query Schema
export const accountQuerySchema = paginationSchema.extend({
  search: z.string().max(200).optional(),
  industry: z.string().optional(),
  ownerId: idSchema.optional(),
  minRevenue: z.number().positive().optional(),
  maxRevenue: z.number().positive().optional(),
  minEmployees: z.number().int().positive().optional(),
  maxEmployees: z.number().int().positive().optional(),
  sortBy: z.enum(ACCOUNT_SORT_FIELDS).default('createdAt'),
});

export type AccountQueryInput = z.infer<typeof accountQuerySchema>;

// Account Response Schema - uses Value Object transformers
export const accountResponseSchema = z.object({
  id: idSchema,
  name: nameSchema,
  // IFC-270 B-13: responses serialize website as a plain string via
  // mapAccountToResponse (WebsiteUrl.toValue()), so the response contract is
  // string | null — NOT the urlSchema input transformer, which would coerce it
  // back into a WebsiteUrl value object and misreport the AccountResponse type.
  website: z.url().nullable(),
  industry: z.string().nullable(),
  employees: z.number().nullable(),
  revenue: z.string().nullable(), // Decimal as string (future: moneySchema)
  description: z.string().nullable(),
  ownerId: idSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type AccountResponse = z.infer<typeof accountResponseSchema>;

// Account List Response Schema - consistent with pagination pattern
export const accountListResponseSchema = z.object({
  // IFC-270 B-09: key is `accounts` to match the account.list router response
  // (`return { accounts, … }`) and every frontend consumer (`data?.accounts`).
  accounts: z.array(accountResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  hasMore: z.boolean(),
});

export type AccountListResponse = z.infer<typeof accountListResponseSchema>;

// =========================================================================
// IFC-185: Input/Output schemas for new Account router endpoints
// =========================================================================

// Import existing status/stage schemas from their canonical locations
import { contactStatusSchema } from './contact';
import { opportunityStageSchema } from './opportunity';

// Re-export for convenience when importing from account module
export { contactStatusSchema as accountContactStatusSchema } from './contact';
export { opportunityStageSchema as accountOpportunityStageSchema } from './opportunity';

// Activity type enum for filtering (account-specific)
export const accountActivityTypeSchema = z.enum([
  'CONTACT_CREATED',
  'CONTACT_UPDATED',
  'OPPORTUNITY_CREATED',
  'OPPORTUNITY_UPDATED',
  'STAGE_CHANGED',
  'EMAIL_SENT',
  'CALL_MADE',
  'MEETING_SCHEDULED',
  'NOTE_ADDED',
]);

export type AccountActivityType = z.infer<typeof accountActivityTypeSchema>;

// -------------------------------------------------------------------------
// getContacts endpoint schemas
// -------------------------------------------------------------------------

export const getAccountContactsInputSchema = z.object({
  accountId: idSchema,
  limit: z.number().int().min(1).max(100).default(20),
  cursor: idSchema.optional(),
  status: z.array(contactStatusSchema).optional(),
});

export type GetAccountContactsInput = z.infer<typeof getAccountContactsInputSchema>;

export const accountContactSchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
  phone: z.string().optional(),
  status: contactStatusSchema,
  createdAt: z.coerce.date(),
});

export const getAccountContactsOutputSchema = z.object({
  contacts: z.array(accountContactSchema),
  nextCursor: idSchema.optional(),
  total: z.number().int().nonnegative(),
});

export type GetAccountContactsOutput = z.infer<typeof getAccountContactsOutputSchema>;

// -------------------------------------------------------------------------
// getOpportunities endpoint schemas
// -------------------------------------------------------------------------

export const getAccountOpportunitiesInputSchema = z.object({
  accountId: idSchema,
  limit: z.number().int().min(1).max(100).default(20),
  cursor: idSchema.optional(),
  stage: z.array(opportunityStageSchema).optional(),
});

export type GetAccountOpportunitiesInput = z.infer<typeof getAccountOpportunitiesInputSchema>;

export const accountOpportunitySchema = z.object({
  id: idSchema,
  name: z.string(),
  stage: opportunityStageSchema,
  value: z.number(),
  probability: z.number().min(0).max(100),
  expectedCloseDate: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
});

export const opportunitySummarySchema = z.object({
  totalValue: z.number(),
  weightedValue: z.number(),
  stageBreakdown: z.record(z.string(), z.number()),
});

export const getAccountOpportunitiesOutputSchema = z.object({
  opportunities: z.array(accountOpportunitySchema),
  nextCursor: idSchema.optional(),
  total: z.number().int().nonnegative(),
  summary: opportunitySummarySchema,
});

export type GetAccountOpportunitiesOutput = z.infer<typeof getAccountOpportunitiesOutputSchema>;

// -------------------------------------------------------------------------
// getActivity endpoint schemas
// -------------------------------------------------------------------------

export const getAccountActivityInputSchema = z.object({
  accountId: idSchema,
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.iso.datetime().optional(),
  types: z.array(accountActivityTypeSchema).optional(),
});

export type GetAccountActivityInput = z.infer<typeof getAccountActivityInputSchema>;

export const accountActivitySchema = z.object({
  id: z.string(),
  type: accountActivityTypeSchema,
  description: z.string(),
  entityType: z.enum(['CONTACT', 'OPPORTUNITY']),
  entityId: idSchema,
  entityName: z.string(),
  performedBy: z
    .object({
      id: idSchema,
      name: z.string(),
    })
    .optional(),
  createdAt: z.coerce.date(),
});

export const getAccountActivityOutputSchema = z.object({
  activities: z.array(accountActivitySchema),
  nextCursor: z.iso.datetime().optional(),
});

export type GetAccountActivityOutput = z.infer<typeof getAccountActivityOutputSchema>;

// -------------------------------------------------------------------------
// Hierarchy endpoint schemas (PG-134)
// -------------------------------------------------------------------------

export const setParentSchema = z.object({
  accountId: idSchema,
  parentAccountId: idSchema.nullable(),
});

export type SetParentInput = z.infer<typeof setParentSchema>;

export const getHierarchyInputSchema = z.object({
  accountId: idSchema,
  maxDepth: z.number().int().min(1).max(5).default(5),
});

export type GetHierarchyInput = z.infer<typeof getHierarchyInputSchema>;

export const assignOwnerSchema = z.object({
  id: idSchema,
  ownerId: idSchema,
});

export type AssignOwnerInput = z.infer<typeof assignOwnerSchema>;

// IFC-311: Reassign endpoints
export const reassignAccountSchema = z.object({
  id: idSchema,
  ownerId: idSchema,
});
export type ReassignAccountInput = z.infer<typeof reassignAccountSchema>;

export const bulkReassignAccountsSchema = z.object({
  ids: z.array(idSchema).min(1).max(100),
  ownerId: idSchema,
});
export type BulkReassignAccountsInput = z.infer<typeof bulkReassignAccountsSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// IFC-312 — AI chain tRPC procedure schemas
// ═══════════════════════════════════════════════════════════════════════════

export const accountSuggestTagsInputSchema = z.object({ accountId: idSchema });
export type AccountSuggestTagsInput = z.infer<typeof accountSuggestTagsInputSchema>;

export const accountTagSuggestionSchema = z.object({
  label: z.string().min(1).max(40),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(200),
});
export type AccountTagSuggestion = z.infer<typeof accountTagSuggestionSchema>;

export const accountSuggestTagsOutputSchema = z.array(accountTagSuggestionSchema);
export type AccountSuggestTagsOutput = z.infer<typeof accountSuggestTagsOutputSchema>;

// IFC-312 audit fix F3: addTags procedure. Spec §4.3.4 assumed account.addTags
// existed but it was never implemented. tags: String[] array on Account.
export const accountAddTagsInputSchema = z.object({
  accountId: idSchema,
  tags: z.array(z.string().min(1).max(40)).min(1).max(10),
});
export type AccountAddTagsInput = z.infer<typeof accountAddTagsInputSchema>;

export const accountAddTagsOutputSchema = z.object({
  tags: z.array(z.string()),
});
export type AccountAddTagsOutput = z.infer<typeof accountAddTagsOutputSchema>;

export const accountGenerateInsightInputSchema = z.object({ accountId: idSchema });
export type AccountGenerateInsightInput = z.infer<typeof accountGenerateInsightInputSchema>;

export const accountGenerateInsightOutputSchema = z.object({ enqueued: z.boolean() });
export type AccountGenerateInsightOutput = z.infer<typeof accountGenerateInsightOutputSchema>;

export const accountScoreInputSchema = z.object({ accountId: idSchema });
export type AccountScoreInput = z.infer<typeof accountScoreInputSchema>;

export const accountScoreOutputSchema = z.object({ enqueued: z.boolean() });
export type AccountScoreOutput = z.infer<typeof accountScoreOutputSchema>;

export const accountGetAiInsightInputSchema = z.object({ accountId: idSchema });
export type AccountGetAiInsightInput = z.infer<typeof accountGetAiInsightInputSchema>;

export const accountAiInsightSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  healthSummary: z.string().nullable(),
  nextBestAction: z.string().nullable(),
  keySignals: z.unknown().nullable(),
  churnRisk: z.string(),
  engagementScore: z.number(),
  sentimentTrend: z.string().nullable(),
  recommendations: z.unknown().nullable(),
  modelVersion: z.string(),
  generatedAt: z.date(),
  source: z.string(),
});
export type AccountAiInsightOutput = z.infer<typeof accountAiInsightSchema>;

export const accountGetAiInsightOutputSchema = z.object({
  insight: accountAiInsightSchema.nullable(),
});
export type AccountGetAiInsightOutput = z.infer<typeof accountGetAiInsightOutputSchema>;
