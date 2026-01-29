import { z } from 'zod';
import { PhoneNumber, Money, WebsiteUrl, DateRange, Percentage } from '@intelliflow/domain';

// Common ID schemas
// Use UUID as the standard ID format (database-compatible)
export const idSchema = z.string().uuid();

// Keep cuid for legacy compatibility if needed
export const cuidSchema = z.string().cuid();

// Alias for clarity
export const uuidSchema = idSchema;

// Common string schemas
export const emailSchema = z.string().email('Invalid email address').toLowerCase().trim();

// Name validation with consistent rules (used across all entities)
export const nameSchema = z
  .string()
  .min(1)
  .max(100)
  .transform((val) => val.trim());

// Phone schema - transforms to PhoneNumber Value Object
export const phoneSchema = z
  .string()
  .optional()
  .nullable()
  .transform((val, ctx) => {
    if (!val) return undefined;

    const result = PhoneNumber.create(val);

    if (result.isFailure) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.error.message,
      });
      return z.NEVER;
    }

    return result.value;
  });

// Money schema - transforms to Money Value Object
export const moneySchema = z
  .object({
    amount: z.number().min(0, 'Amount must be non-negative'),
    currency: z.string().default('USD'),
  })
  .transform((val, ctx) => {
    const result = Money.create(val.amount, val.currency);

    if (result.isFailure) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.error.message,
      });
      return z.NEVER;
    }

    return result.value;
  });

// Percentage schema - transforms to Percentage Value Object
export const percentageSchema = z
  .number()
  .transform((val, ctx) => {
    const result = Percentage.create(val);

    if (result.isFailure) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.error.message,
      });
      return z.NEVER;
    }

    return result.value;
  });

// URL schema - transforms to WebsiteUrl Value Object
export const urlSchema = z
  .string()
  .optional()
  .nullable()
  .transform((val, ctx) => {
    if (!val) return undefined;

    const result = WebsiteUrl.create(val);

    if (result.isFailure) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.error.message,
      });
      return z.NEVER;
    }

    return result.value;
  });

// Pagination schemas
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// Date range schema - transforms to DateRange Value Object
export const dateRangeSchema = z
  .object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  })
  .transform((val, ctx) => {
    const result = DateRange.create(val.start, val.end);

    if (result.isFailure) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.error.message,
      });
      return z.NEVER;
    }

    return result.value;
  });

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
