import { z } from 'zod';
import { emailSchema, phoneSchema, idSchema, paginationSchema, nameSchema } from './common';
import { LEAD_STATUSES, LEAD_SOURCES } from '@intelliflow/domain';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Enums - derived from domain constants (single source of truth)
export const leadSourceSchema = z.enum(LEAD_SOURCES);
export const leadStatusSchema = z.enum(LEAD_STATUSES);

export type LeadSource = z.infer<typeof leadSourceSchema>;
export type LeadStatus = z.infer<typeof leadStatusSchema>;

// Base lead fields schema (DRY - used by create and update)
const baseLeadFieldsSchema = z.object({
  email: emailSchema,
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  company: z.string().min(1).max(200).transform(val => val.trim()).optional(),
  title: nameSchema.optional(),
  phone: phoneSchema,
  source: leadSourceSchema,
});

// Create Lead Schema - uses base fields with source default
export const createLeadSchema = baseLeadFieldsSchema.extend({
  source: leadSourceSchema.default('WEBSITE'),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

// Update Lead Schema - extends base with id and status, all fields optional
export const updateLeadSchema = baseLeadFieldsSchema
  .partial()
  .extend({
    id: idSchema,
    status: leadStatusSchema.optional(),
  });

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
  ownerId: idSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type LeadResponse = z.infer<typeof leadResponseSchema>;

// Lead List Response Schema - uses paginatedResponseSchema pattern
export const leadListResponseSchema = z.object({
  data: z.array(leadResponseSchema), // Renamed from 'leads' to 'data' for consistency
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  hasMore: z.boolean(),
});

export type LeadListResponse = z.infer<typeof leadListResponseSchema>;
