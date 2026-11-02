import { z } from 'zod';
import { PhoneNumber, Money, WebsiteUrl, DateRange, Percentage } from '@intelliflow/domain';

// Common ID schemas
// Prisma uses @default(cuid()) while seed data uses deterministic UUIDs.
// Accept both formats so runtime-created and seeded entities both pass validation.
export const uuidSchema = z.uuid();
export const cuidSchema = z.string().check(z.regex(/^c[a-z0-9]{8,}$/, 'Invalid CUID'));
export const idSchema = z.union([uuidSchema, cuidSchema]);
export { recordIdSchema, MAX_RECORD_ID_LENGTH } from './record-id';

/** A user id, or a `system:<name>` actor for automated decisions (PG-198). */
export const actorIdSchema = z.union([
  idSchema,
  z.string().check(z.regex(/^system:[a-z][a-z-]*$/, 'Invalid system actor')),
]);

// Common string schemas
export const emailSchema = z
  .string()
  .email('Invalid email address')
  .transform((v) => v.toLowerCase().trim());

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
        code: 'custom',
        message: result.error.message,
      });
      return z.NEVER;
    }

    return result.value;
  });

// Phone schema for PATCH-style updates (IFC-412). `phoneSchema` above collapses
// both "not provided" and an explicit `null` to `undefined` — correct for
// create (there is nothing to clear), but on update it destroys the signal
// that the caller wants to CLEAR the phone rather than leave it untouched.
// Here: key omitted/`undefined` -> leave unchanged; `null` (or blank string,
// defensively) -> clear; a non-blank string -> validate + set.
export const phoneUpdateSchema = z
  .string()
  .nullable()
  .optional()
  .transform((val, ctx) => {
    if (val === undefined || val === null) return val;
    if (!val.trim()) return null;

    const result = PhoneNumber.create(val);

    if (result.isFailure) {
      ctx.addIssue({
        code: 'custom',
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
    currency: z.string().default('GBP'),
  })
  .transform((val, ctx) => {
    const result = Money.create(val.amount, val.currency);

    if (result.isFailure) {
      ctx.addIssue({
        code: 'custom',
        message: result.error.message,
      });
      return z.NEVER;
    }

    return result.value;
  });

// Percentage schema - transforms to Percentage Value Object
export const percentageSchema = z.number().transform((val, ctx) => {
  const result = Percentage.create(val);

  if (result.isFailure) {
    ctx.addIssue({
      code: 'custom',
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
        code: 'custom',
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
        code: 'custom',
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
  filters: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    .optional(),
});

export type SearchInput = z.infer<typeof searchSchema>;

// API response schemas
export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema,
    message: z.string().optional(),
    timestamp: z.iso.datetime(),
  });

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  timestamp: z.iso.datetime(),
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
