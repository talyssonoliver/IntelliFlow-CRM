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

// ============================================
// Pipeline Stage Configuration
// ============================================

/**
 * Default display names for opportunity stages
 */
export const DEFAULT_STAGE_NAMES: Record<string, string> = {
  PROSPECTING: 'Prospecting',
  QUALIFICATION: 'Qualification',
  NEEDS_ANALYSIS: 'Needs Analysis',
  VALUE_PROPOSITION: 'Value Proposition',
  ID_DECISION_MAKERS: 'Decision Makers',
  PERCEPTION_ANALYSIS: 'Perception Analysis',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
};

/**
 * Default colors for opportunity stages (hex values)
 */
export const DEFAULT_STAGE_COLORS: Record<string, string> = {
  PROSPECTING: '#94a3b8',
  QUALIFICATION: '#60a5fa',
  NEEDS_ANALYSIS: '#38bdf8',
  VALUE_PROPOSITION: '#2dd4bf',
  ID_DECISION_MAKERS: '#a78bfa',
  PERCEPTION_ANALYSIS: '#f472b6',
  PROPOSAL: '#fb923c',
  NEGOTIATION: '#facc15',
  CLOSED_WON: '#22c55e',
  CLOSED_LOST: '#ef4444',
};

/**
 * Default probabilities for opportunity stages (0-100)
 */
export const DEFAULT_STAGE_PROBABILITIES: Record<string, number> = {
  PROSPECTING: 10,
  QUALIFICATION: 20,
  NEEDS_ANALYSIS: 30,
  VALUE_PROPOSITION: 40,
  ID_DECISION_MAKERS: 50,
  PERCEPTION_ANALYSIS: 60,
  PROPOSAL: 70,
  NEGOTIATION: 80,
  CLOSED_WON: 100,
  CLOSED_LOST: 0,
};

/**
 * Protected stages that cannot be deactivated (terminal pipeline stages)
 * These stages represent final outcomes and must always be available
 */
export const PROTECTED_STAGES = ['CLOSED_WON', 'CLOSED_LOST'] as const;
export type ProtectedStage = (typeof PROTECTED_STAGES)[number];

/**
 * Validates that protected stages are not being deactivated
 * @param stageKey - The stage key to validate
 * @param isActive - The new active state
 * @throws Error if attempting to deactivate a protected stage
 */
export function validateStageDeactivation(stageKey: string, isActive: boolean): void {
  if (PROTECTED_STAGES.includes(stageKey as ProtectedStage) && !isActive) {
    throw new Error(`Cannot deactivate terminal stage: ${stageKey}`);
  }
}

/**
 * Schema for updating a single pipeline stage configuration
 */
export const updatePipelineStageConfigSchema = z.object({
  stage: opportunityStageSchema,
  displayName: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color').optional(),
  probability: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdatePipelineStageConfigInput = z.infer<typeof updatePipelineStageConfigSchema>;

/**
 * Schema for batch updating pipeline configuration
 */
export const updatePipelineConfigSchema = z.object({
  stages: z.array(updatePipelineStageConfigSchema).min(1, 'At least one stage required'),
});

export type UpdatePipelineConfigInput = z.infer<typeof updatePipelineConfigSchema>;
