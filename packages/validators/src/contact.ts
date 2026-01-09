import { z } from 'zod';
import { emailSchema, phoneSchema, idSchema, paginationSchema, nameSchema } from './common';
import { CONTACT_TYPES } from '@intelliflow/domain';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Enums - derived from domain constants (single source of truth)
export const contactTypeSchema = z.enum(CONTACT_TYPES);
export type ContactType = z.infer<typeof contactTypeSchema>;

// Contact status enum
export const CONTACT_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export const contactStatusSchema = z.enum(CONTACT_STATUSES);
export type ContactStatus = z.infer<typeof contactStatusSchema>;

// Base contact fields schema (DRY - used by create and update)
const baseContactFieldsSchema = z.object({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  title: nameSchema.optional(),
  phone: phoneSchema,
  department: nameSchema.optional(),
  accountId: idSchema.optional(),
  // Extended fields (IFC-089 form support)
  streetAddress: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  zipCode: z.string().max(20).optional(),
  company: z.string().max(200).optional(),
  linkedInUrl: z.string().url().max(500).optional().or(z.literal('')),
  contactType: contactTypeSchema.optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  contactNotes: z.string().max(5000).optional(),
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
  // Extended fields (IFC-089 form support)
  streetAddress: z.string().nullable(),
  city: z.string().nullable(),
  zipCode: z.string().nullable(),
  company: z.string().nullable(),
  linkedInUrl: z.string().nullable(),
  contactType: z.string().nullable(),
  tags: z.array(z.string()),
  contactNotes: z.string().nullable(),
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
