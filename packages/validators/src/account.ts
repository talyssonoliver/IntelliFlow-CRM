import { z } from 'zod';
import { idSchema, paginationSchema, urlSchema, nameSchema } from './common';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Base account fields schema (DRY - used by create and update)
const baseAccountFieldsSchema = z.object({
  name: z.string().min(1).max(200).transform(val => val.trim()), // Company names can be longer
  website: urlSchema, // Uses WebsiteUrl Value Object transformer
  industry: z.string().max(100).transform(val => val.trim()).optional(),
  employees: z.number().int().positive().optional(),
  revenue: z.number().positive().optional(), // Could use moneySchema in future
  description: z.string().max(1000).transform(val => val.trim()).optional(),
});

// Create Account Schema
export const createAccountSchema = baseAccountFieldsSchema;

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

// Update Account Schema - all fields optional except id
export const updateAccountSchema = baseAccountFieldsSchema
  .partial()
  .extend({
    id: idSchema,
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
