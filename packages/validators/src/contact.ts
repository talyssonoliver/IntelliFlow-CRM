import { z } from 'zod';
import { emailSchema, phoneSchema, idSchema, paginationSchema } from './common';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Create Contact Schema
export const createContactSchema = z.object({
  email: emailSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  title: z.string().max(100).optional(),
  phone: phoneSchema,
  department: z.string().max(100).optional(),
  accountId: idSchema.optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

// Update Contact Schema
export const updateContactSchema = z.object({
  id: idSchema,
  email: emailSchema.optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  title: z.string().max(100).optional(),
  phone: phoneSchema,
  department: z.string().max(100).optional(),
  accountId: idSchema.optional().nullable(),
});

export type UpdateContactInput = z.infer<typeof updateContactSchema>;

// Contact Query Schema
export const contactQuerySchema = paginationSchema.extend({
  search: z.string().max(200).optional(),
  accountId: idSchema.optional(),
  ownerId: idSchema.optional(),
  department: z.string().optional(),
});

export type ContactQueryInput = z.infer<typeof contactQuerySchema>;

// Contact Response Schema
export const contactResponseSchema = z.object({
  id: idSchema,
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  title: z.string().nullable(),
  phone: z.string().nullable(),
  department: z.string().nullable(),
  accountId: idSchema.nullable(),
  ownerId: idSchema,
  leadId: idSchema.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ContactResponse = z.infer<typeof contactResponseSchema>;

// Contact List Response Schema
export const contactListResponseSchema = z.object({
  contacts: z.array(contactResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
});

export type ContactListResponse = z.infer<typeof contactListResponseSchema>;
