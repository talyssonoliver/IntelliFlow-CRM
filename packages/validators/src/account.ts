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
  industry: z
    .string()
    .max(100)
    .transform((val) => val.trim())
    .optional(),
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

// Update Account Schema - all fields optional except id
export const updateAccountSchema = baseAccountFieldsSchema.partial().extend({
  id: idSchema,
  parentAccountId: idSchema.nullable().optional(),
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

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
  website: urlSchema, // Uses WebsiteUrl Value Object transformer
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
  data: z.array(accountResponseSchema), // Renamed from 'accounts' to 'data'
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
