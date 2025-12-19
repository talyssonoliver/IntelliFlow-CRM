import { z } from 'zod';
import { idSchema, paginationSchema } from './common';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Enums
export const opportunityStageSchema = z.enum([
  'PROSPECTING',
  'QUALIFICATION',
  'NEEDS_ANALYSIS',
  'PROPOSAL',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
]);

export type OpportunityStage = z.infer<typeof opportunityStageSchema>;

// Create Opportunity Schema
export const createOpportunitySchema = z.object({
  name: z.string().min(1).max(200),
  value: z.number().positive(),
  stage: opportunityStageSchema.default('PROSPECTING'),
  probability: z.number().int().min(0).max(100).default(0),
  expectedCloseDate: z.coerce.date().optional(),
  description: z.string().max(1000).optional(),
  accountId: idSchema,
  contactId: idSchema.optional(),
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

// Update Opportunity Schema
export const updateOpportunitySchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(200).optional(),
  value: z.number().positive().optional(),
  stage: opportunityStageSchema.optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.coerce.date().optional().nullable(),
  description: z.string().max(1000).optional(),
  accountId: idSchema.optional(),
  contactId: idSchema.optional().nullable(),
});

export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;

// Opportunity Query Schema
export const opportunityQuerySchema = paginationSchema.extend({
  search: z.string().max(200).optional(),
  stage: z.array(opportunityStageSchema).optional(),
  ownerId: idSchema.optional(),
  accountId: idSchema.optional(),
  contactId: idSchema.optional(),
  minValue: z.number().positive().optional(),
  maxValue: z.number().positive().optional(),
  minProbability: z.number().int().min(0).max(100).optional(),
  maxProbability: z.number().int().min(0).max(100).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type OpportunityQueryInput = z.infer<typeof opportunityQuerySchema>;

// Opportunity Response Schema
export const opportunityResponseSchema = z.object({
  id: idSchema,
  name: z.string(),
  value: z.string(), // Decimal as string
  stage: opportunityStageSchema,
  probability: z.number().int(),
  expectedCloseDate: z.coerce.date().nullable(),
  description: z.string().nullable(),
  ownerId: idSchema,
  accountId: idSchema,
  contactId: idSchema.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  closedAt: z.coerce.date().nullable(),
});

export type OpportunityResponse = z.infer<typeof opportunityResponseSchema>;

// Opportunity List Response Schema
export const opportunityListResponseSchema = z.object({
  opportunities: z.array(opportunityResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
});

export type OpportunityListResponse = z.infer<typeof opportunityListResponseSchema>;
