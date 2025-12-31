import { z } from 'zod';
import { emailSchema, phoneSchema, idSchema, paginationSchema, nameSchema } from './common';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Base contact fields schema (DRY - used by create and update)
const baseContactFieldsSchema = z.object({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  title: nameSchema.optional(),
  phone: phoneSchema,
  department: nameSchema.optional(),
  accountId: idSchema.optional(),
});

// Create Contact Schema
export const createContactSchema = baseContactFieldsSchema;

export type CreateContactInput = z.infer<typeof createContactSchema>;

// Update Contact Schema - all fields optional except id
export const updateContactSchema = baseContactFieldsSchema
  .partial()
  .extend({
    id: idSchema,
    accountId: idSchema.optional().nullable(), // Allow unsetting account
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

// Contact Response Schema - uses Value Object transformers
export const contactResponseSchema = z.object({
  id: idSchema,
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  title: nameSchema.nullable(),
  phone: phoneSchema, // Uses PhoneNumber Value Object transformer
  department: nameSchema.nullable(),
  accountId: idSchema.nullable(),
  ownerId: idSchema,
  leadId: idSchema.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ContactResponse = z.infer<typeof contactResponseSchema>;

// Contact List Response Schema - consistent with pagination pattern
export const contactListResponseSchema = z.object({
  data: z.array(contactResponseSchema), // Renamed from 'contacts' to 'data'
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  hasMore: z.boolean(),
});

export type ContactListResponse = z.infer<typeof contactListResponseSchema>;
