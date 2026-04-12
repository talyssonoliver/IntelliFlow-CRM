import { z } from 'zod';
import { idSchema } from './common';

/**
 * Base Schemas for DRY Composition
 *
 * Following 2025 best practices for modular, composable schemas.
 * Use .extend(), .pick(), .omit() instead of duplicating fields.
 */

// Base entity with audit fields
export const baseEntitySchema = z.object({
  id: idSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Base entity with soft delete
export const softDeletableEntitySchema = baseEntitySchema.extend({
  deletedAt: z.coerce.date().nullable(),
});

// Base entity with tenant isolation
export const tenantEntitySchema = baseEntitySchema.extend({
  tenantId: idSchema,
});

// Base entity with ownership
export const ownedEntitySchema = tenantEntitySchema.extend({
  ownerId: idSchema,
});

// Pagination response wrapper
export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive().max(100),
    hasMore: z.boolean(),
  });

// API success response wrapper
export const apiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    timestamp: z.coerce.date().default(() => new Date()),
  });

// Note: apiErrorSchema, nameSchema, and other field-level schemas
// are exported from common.ts to avoid duplication

// Export types
export type BaseEntity = z.infer<typeof baseEntitySchema>;
export type SoftDeletableEntity = z.infer<typeof softDeletableEntitySchema>;
export type TenantEntity = z.infer<typeof tenantEntitySchema>;
export type OwnedEntity = z.infer<typeof ownedEntitySchema>;
