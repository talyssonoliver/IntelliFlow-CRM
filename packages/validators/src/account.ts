import { z } from 'zod';
import { idSchema, paginationSchema, urlSchema } from './common';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Create Account Schema
export const createAccountSchema = z.object({
  name: z.string().min(1).max(200),
  website: urlSchema,
  industry: z.string().max(100).optional(),
  employees: z.number().int().positive().optional(),
  revenue: z.number().positive().optional(),
  description: z.string().max(1000).optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

// Update Account Schema
export const updateAccountSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(200).optional(),
  website: urlSchema,
  industry: z.string().max(100).optional(),
  employees: z.number().int().positive().optional(),
  revenue: z.number().positive().optional(),
  description: z.string().max(1000).optional(),
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// Account Query Schema
export const accountQuerySchema = paginationSchema.extend({
  search: z.string().max(200).optional(),
  industry: z.string().optional(),
  ownerId: idSchema.optional(),
  minRevenue: z.number().positive().optional(),
  maxRevenue: z.number().positive().optional(),
  minEmployees: z.number().int().positive().optional(),
  maxEmployees: z.number().int().positive().optional(),
});

export type AccountQueryInput = z.infer<typeof accountQuerySchema>;

// Account Response Schema
export const accountResponseSchema = z.object({
  id: idSchema,
  name: z.string(),
  website: z.string().nullable(),
  industry: z.string().nullable(),
  employees: z.number().nullable(),
  revenue: z.string().nullable(), // Decimal as string
  description: z.string().nullable(),
  ownerId: idSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type AccountResponse = z.infer<typeof accountResponseSchema>;

// Account List Response Schema
export const accountListResponseSchema = z.object({
  accounts: z.array(accountResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
});

export type AccountListResponse = z.infer<typeof accountListResponseSchema>;
