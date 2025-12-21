import { z } from 'zod';

// Common ID schemas
// Use UUID as the standard ID format (database-compatible)
export const idSchema = z.string().uuid();

// Keep cuid for legacy compatibility if needed
export const cuidSchema = z.string().cuid();

// Alias for clarity
export const uuidSchema = idSchema;

// Common string schemas
export const emailSchema = z.string().email('Invalid email address').toLowerCase().trim();

// Phone schema - accepts E.164 format or common formats with dashes/spaces
export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9][\d\s\-()]{1,18}$/, 'Invalid phone number format')
  .transform((val) => val.replace(/[\s\-()]/g, '')) // Normalize to digits only
  .optional();

export const urlSchema = z.string().url('Invalid URL').optional();

// Pagination schemas
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// Date range schema
export const dateRangeSchema = z
  .object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  })
  .refine((data) => data.start <= data.end, { message: 'Start date must be before end date' });

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

// Search/filter schema
export const searchSchema = z.object({
  query: z.string().min(1).max(200).optional(),
  filters: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
});

export type SearchInput = z.infer<typeof searchSchema>;

// API response schemas
export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema,
    message: z.string().optional(),
    timestamp: z.string().datetime(),
  });

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
  timestamp: z.string().datetime(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

// Metadata schema (for audit trails)
export const metadataSchema = z.object({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
  version: z.number().int().nonnegative().optional(),
});

export type Metadata = z.infer<typeof metadataSchema>;
