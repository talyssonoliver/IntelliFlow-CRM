import { z } from 'zod';
import { idSchema, paginationSchema, moneySchema, percentageSchema, nameSchema } from './common';
import { OPPORTUNITY_STAGES } from '@intelliflow/domain';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Enums - derived from domain constants (single source of truth)
export const opportunityStageSchema = z.enum(OPPORTUNITY_STAGES);

export type OpportunityStage = z.infer<typeof opportunityStageSchema>;

// Base opportunity fields schema (DRY - used by create and update)
const baseOpportunityFieldsSchema = z.object({
  name: z.string().min(1).max(200).transform(val => val.trim()), // Opportunity names can be longer
  value: moneySchema, // Uses Money Value Object transformer
  stage: opportunityStageSchema,
  probability: percentageSchema, // Uses Percentage Value Object transformer
  expectedCloseDate: z.coerce.date().optional(),
  description: z.string().max(1000).transform(val => val.trim()).optional(),
  accountId: idSchema,
  contactId: idSchema.optional(),
});

// Create Opportunity Schema - with defaults
export const createOpportunitySchema = baseOpportunityFieldsSchema.extend({
  stage: opportunityStageSchema.default('PROSPECTING'),
  // Note: probability default handled in domain layer (10% for PROSPECTING)
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

// Update Opportunity Schema - all fields optional except id
export const updateOpportunitySchema = baseOpportunityFieldsSchema
  .partial()
  .extend({
    id: idSchema,
    expectedCloseDate: z.coerce.date().optional().nullable(),
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

// Opportunity Response Schema - uses Value Object transformers
export const opportunityResponseSchema = z.object({
  id: idSchema,
  name: nameSchema,
  value: moneySchema, // Uses Money Value Object transformer
  stage: opportunityStageSchema,
  probability: percentageSchema, // Uses Percentage Value Object transformer
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

// Opportunity List Response Schema - consistent with pagination pattern
export const opportunityListResponseSchema = z.object({
  data: z.array(opportunityResponseSchema), // Renamed from 'opportunities' to 'data'
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  hasMore: z.boolean(),
});

export type OpportunityListResponse = z.infer<typeof opportunityListResponseSchema>;
