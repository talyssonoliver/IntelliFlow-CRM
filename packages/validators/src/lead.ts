import { z } from 'zod';
import { emailSchema, phoneSchema, idSchema, paginationSchema, nameSchema } from './common';
import { LEAD_STATUSES, LEAD_SOURCES, LEAD_ACTIVITY_TYPES } from '@intelliflow/domain';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Enums - derived from domain constants (single source of truth)
export const leadSourceSchema = z.enum(LEAD_SOURCES);
export const leadStatusSchema = z.enum(LEAD_STATUSES);
export const leadActivityTypeSchema = z.enum(LEAD_ACTIVITY_TYPES);

export type LeadSource = z.infer<typeof leadSourceSchema>;
export type LeadStatus = z.infer<typeof leadStatusSchema>;
export type LeadActivityType = z.infer<typeof leadActivityTypeSchema>;

// Base lead fields schema (DRY - used by create and update)
const baseLeadFieldsSchema = z.object({
  email: emailSchema,
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  company: z
    .string()
    .min(1)
    .max(200)
    .transform((val) => val.trim())
    .optional(),
  title: nameSchema.optional(),
  phone: phoneSchema,
  source: leadSourceSchema,
  // Lead 360 fields
  location: z.string().max(200).optional(),
  website: z.string().max(200).optional(),
  avatarUrl: z.string().check(z.url()).max(500).optional(),
  lastContactedAt: z.coerce.date().optional(),
  estimatedValue: z.number().int().min(0).optional(), // In cents
  tags: z.array(z.string().max(50)).max(20).optional(),
});

// Create Lead Schema - uses base fields with source default
export const createLeadSchema = baseLeadFieldsSchema.extend({
  source: leadSourceSchema.default('WEBSITE'),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

// Update Lead Schema - omits immutable fields (email, source)
// Status can be updated directly here to support archive-style actions (e.g. status: 'LOST').
// Bulk/lifecycle transitions still go through dedicated endpoints (qualify, convert, bulkUpdateStatus).
export const updateLeadSchema = baseLeadFieldsSchema
  .omit({ email: true, source: true })
  .partial()
  .extend({ id: idSchema, status: leadStatusSchema.optional() });

export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

// Lead Score Schema (for AI scoring)
export const leadScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  factors: z.array(
    z.object({
      name: z.string(),
      impact: z.number(),
      reasoning: z.string(),
    })
  ),
  modelVersion: z.string(),
  /** Fix #15: human-review gate flag — set true when confidence < threshold */
  requiresReview: z.boolean().optional(),
});

export type LeadScoreInput = z.infer<typeof leadScoreSchema>;

// Update Lead Score Schema
export const updateLeadScoreSchema = z.object({
  leadId: idSchema,
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  modelVersion: z.string(),
});

export type UpdateLeadScoreInput = z.infer<typeof updateLeadScoreSchema>;

// Qualify Lead Schema
export const qualifyLeadSchema = z.object({
  leadId: idSchema,
  reason: z.string().min(10).max(500),
});

export type QualifyLeadInput = z.infer<typeof qualifyLeadSchema>;

// Convert Lead Schema
export const convertLeadSchema = z.object({
  leadId: idSchema,
  createAccount: z.boolean().default(true),
  accountName: z.string().min(1).max(200).optional(),
  notes: z.string().max(1000).optional(),
});

export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;

// Convert Lead to Deal Schema (IFC-062: Lead to Deal conversion)
export const convertLeadToDealSchema = z.object({
  leadId: idSchema,
  dealValue: z.number().int().positive(),
  dealName: z.string().min(1).max(200).trim().optional(),
  accountName: z.string().min(1).max(200).trim().optional(),
  createContact: z.boolean().default(true),
  expectedCloseDate: z.coerce.date().optional(),
});

export type ConvertLeadToDealInput = z.infer<typeof convertLeadToDealSchema>;

// Sortable fields allowlist — only safe, indexed, user-meaningful columns
export const LEAD_SORTABLE_FIELDS = [
  'createdAt', 'updatedAt', 'firstName', 'lastName',
  'company', 'email', 'score', 'status', 'source',
  'lastContactedAt', 'estimatedValue',
] as const;

// Lead Query Schema
export const leadQuerySchema = paginationSchema.extend({
  status: z.array(leadStatusSchema).optional(),
  source: z.array(leadSourceSchema).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  maxScore: z.number().int().min(0).max(100).optional(),
  search: z.string().max(200).optional(),
  ownerId: idSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sortBy: z.enum(LEAD_SORTABLE_FIELDS).optional(),
});

export type LeadQueryInput = z.infer<typeof leadQuerySchema>;

// Lead Response Schema (for API responses)
// Uses Value Object transformers for type-safe domain objects
export const leadResponseSchema = z.object({
  id: idSchema,
  email: emailSchema,
  firstName: nameSchema.nullable(),
  lastName: nameSchema.nullable(),
  company: z.string().nullable(),
  title: nameSchema.nullable(),
  phone: phoneSchema, // Uses PhoneNumber Value Object transformer
  source: leadSourceSchema,
  status: leadStatusSchema,
  score: z.number().int().min(0).max(100),
  scoreConfidence: z.number().nullable(),
  scoreTier: z.enum(['HOT', 'WARM', 'COLD']).nullable(),
  ownerId: idSchema,
  tenantId: idSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type LeadResponse = z.infer<typeof leadResponseSchema>;

// Lead Detail Response Schema — extends base with Lead 360 relation fields
// Used by getById which includes full relation data
export const leadDetailResponseSchema = leadResponseSchema.extend({
  owner: z.object({
    id: idSchema,
    email: z.string(),
    name: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    role: z.string(),
  }).nullable().optional(),
  activities: z.array(z.any()).optional(),
  notes: z.array(z.any()).optional(),
  files: z.array(z.any()).optional(),
  aiInsight: z.any().nullable().optional(),
  tasks: z.array(z.any()).optional(),
});

export type LeadDetailResponse = z.infer<typeof leadDetailResponseSchema>;

// Lead List Response Schema - uses paginatedResponseSchema pattern
export const leadListResponseSchema = z.object({
  data: z.array(leadResponseSchema), // Renamed from 'leads' to 'data' for consistency
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  hasMore: z.boolean(),
});

export type LeadListResponse = z.infer<typeof leadListResponseSchema>;

// Vector search result schema (validates Supabase RPC response)
export const leadSearchResultSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  company: z.string().nullable(),
  similarity: z.number(),
});

export type LeadSearchResultValidated = z.infer<typeof leadSearchResultSchema>;
