import { z } from 'zod';
import { emailSchema, phoneSchema, idSchema, paginationSchema } from './common';

// Enums
export const leadSourceSchema = z.enum([
  'WEBSITE',
  'REFERRAL',
  'SOCIAL',
  'EMAIL',
  'COLD_CALL',
  'EVENT',
  'OTHER',
]);

export const leadStatusSchema = z.enum([
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'UNQUALIFIED',
  'CONVERTED',
  'LOST',
]);

export type LeadSource = z.infer<typeof leadSourceSchema>;
export type LeadStatus = z.infer<typeof leadStatusSchema>;

// Create Lead Schema
export const createLeadSchema = z.object({
  email: emailSchema,
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  company: z.string().min(1).max(200).optional(),
  title: z.string().max(100).optional(),
  phone: phoneSchema,
  source: leadSourceSchema.default('WEBSITE'),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

// Update Lead Schema
export const updateLeadSchema = z.object({
  id: idSchema,
  email: emailSchema.optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  company: z.string().min(1).max(200).optional(),
  title: z.string().max(100).optional(),
  phone: phoneSchema,
  source: leadSourceSchema.optional(),
  status: leadStatusSchema.optional(),
});

export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

// Lead Score Schema (for AI scoring)
export const leadScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  factors: z.array(z.object({
    name: z.string(),
    impact: z.number(),
    reasoning: z.string(),
  })),
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
export const leadResponseSchema = z.object({
  id: idSchema,
  email: z.string().email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  company: z.string().nullable(),
  title: z.string().nullable(),
  phone: z.string().nullable(),
  source: leadSourceSchema,
  status: leadStatusSchema,
  score: z.number().int().min(0).max(100),
  ownerId: idSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type LeadResponse = z.infer<typeof leadResponseSchema>;

// Lead List Response Schema
export const leadListResponseSchema = z.object({
  leads: z.array(leadResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
});

export type LeadListResponse = z.infer<typeof leadListResponseSchema>;
