/**
 * Ticket Category Validators - PG-173
 *
 * Zod schemas for ticket category CRUD operations.
 */

import { z } from 'zod';

const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

export const createTicketCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  parentId: z.string().optional(),
  color: z.string().regex(hexColorRegex, 'Must be a valid hex color (e.g. #FF0000)').optional(),
  icon: z.string().max(50).optional(),
  slaPolicyId: z.string().optional(),
});
export type CreateTicketCategoryInput = z.infer<typeof createTicketCategorySchema>;

export const updateTicketCategorySchema = createTicketCategorySchema.partial().extend({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
});
export type UpdateTicketCategoryInput = z.infer<typeof updateTicketCategorySchema>;

export const reorderTicketCategorySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        sortOrder: z.number().int().min(0),
      })
    )
    .min(1, 'At least one item required'),
});
export type ReorderTicketCategoryInput = z.infer<typeof reorderTicketCategorySchema>;
