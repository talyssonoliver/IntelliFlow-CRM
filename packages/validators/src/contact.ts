import { z } from 'zod';
import { emailSchema, phoneSchema, idSchema, paginationSchema, nameSchema } from './common';
import { CONTACT_TYPES, CONTACT_STATUSES, CONTACT_INTERACTION_TYPES } from '@intelliflow/domain';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Enums - derived from domain constants (single source of truth)
export const contactTypeSchema = z.enum(CONTACT_TYPES);
export type ContactType = z.infer<typeof contactTypeSchema>;

export const contactStatusSchema = z.enum(CONTACT_STATUSES);
export type ContactStatus = z.infer<typeof contactStatusSchema>;

// IFC-192: Contact interaction types
export const contactInteractionTypeSchema = z.enum(CONTACT_INTERACTION_TYPES);
export type ContactInteractionType = z.infer<typeof contactInteractionTypeSchema>;

// IFC-192: Log activity input schema
export const logActivitySchema = z.object({
  contactId: idSchema,
  type: contactInteractionTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});
export type LogActivityInput = z.infer<typeof logActivitySchema>;

// Base contact fields schema (DRY - used by create and update)
const baseContactFieldsSchema = z.object({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  title: nameSchema.optional(),
  phone: phoneSchema,
  department: nameSchema.optional(),
  status: contactStatusSchema.optional(),
  accountId: idSchema.optional(),
  // Extended fields (IFC-089 form support)
  streetAddress: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  zipCode: z.string().max(20).optional(),
  company: z.string().max(200).optional(),
  linkedInUrl: z.string().check(z.url()).max(500).optional().or(z.literal('')),
  contactType: contactTypeSchema.optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  contactNotes: z.string().max(5000).optional(),
});

// Create Contact Schema
export const createContactSchema = baseContactFieldsSchema;

export type CreateContactInput = z.infer<typeof createContactSchema>;

// Update Contact Schema - all fields optional except id
// Email is omitted: use updateContactEmail service method for email changes
export const updateContactSchema = baseContactFieldsSchema.omit({ email: true }).partial().extend({
  id: idSchema,
  accountId: idSchema.optional().nullable(), // Allow unsetting account
});

export type UpdateContactInput = z.infer<typeof updateContactSchema>;

// IFC-310 EC-004: Dedicated email-change mutation with duplicate detection.
// Email updates go through this path so the duplicate-detection runtime can
// branch on exact-email collision (auto-merge) or flag them (notification).
export const updateContactEmailSchema = z.object({
  id: idSchema,
  email: emailSchema,
});
export type UpdateContactEmailInput = z.infer<typeof updateContactEmailSchema>;

// IFC-254 R-10: Whitelist of safe sortable Contact columns
export const CONTACT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'firstName',
  'lastName',
  'email',
  'status',
  'company',
  'department',
  'lastContactedAt',
] as const;

// Contact Query Schema
export const contactQuerySchema = paginationSchema.extend({
  search: z.string().max(200).optional(),
  accountId: idSchema.optional(),
  ownerId: idSchema.optional(),
  department: z.string().optional(),
  status: contactStatusSchema.optional(),
  sortBy: z.enum(CONTACT_SORT_FIELDS).default('createdAt'),
});

export type ContactQueryInput = z.infer<typeof contactQuerySchema>;

// Contact Response Schema - uses Value Object transformers
export const contactResponseSchema = z.object({
  id: idSchema,
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  title: nameSchema.nullable(),
  phone: z.string().nullable(), // Plain string for response (VO transform only in input schemas)
  department: nameSchema.nullable(),
  status: contactStatusSchema,
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
  lastContactedAt: z.coerce.date().nullable(), // IFC-192
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ContactResponse = z.infer<typeof contactResponseSchema>;

// Contact List Response Schema - consistent with pagination pattern
export const contactListResponseSchema = z.object({
  contacts: z.array(contactResponseSchema), // Matches router return key
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  hasMore: z.boolean(),
});

export type ContactListResponse = z.infer<typeof contactListResponseSchema>;

// Vector search result schema (validates Supabase RPC response)
export const contactSearchResultSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  similarity: z.number(),
});

export type ContactSearchResultValidated = z.infer<typeof contactSearchResultSchema>;

// Add Note Schema (mirrors lead.addNote)
export const addContactNoteSchema = z.object({
  contactId: idSchema,
  content: z.string().min(1).max(5000),
});
export type AddContactNoteInput = z.infer<typeof addContactNoteSchema>;

// IFC-184: Link/Unlink Lead Schemas
export const linkToLeadSchema = z.object({
  contactId: idSchema,
  leadId: idSchema,
});

export type LinkToLeadInput = z.infer<typeof linkToLeadSchema>;

export const unlinkFromLeadSchema = z.object({
  contactId: idSchema,
});

export type UnlinkFromLeadInput = z.infer<typeof unlinkFromLeadSchema>;

// IFC-184: Contact Timeline Schema
export const contactTimelineSchema = z.object({
  contactId: idSchema,
  eventTypes: z
    .array(z.enum(['activity', 'note', 'task', 'appointment', 'email', 'call', 'status_change']))
    .optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ContactTimelineInput = z.infer<typeof contactTimelineSchema>;

// Contact Timeline Event Type
export const contactTimelineEventTypeSchema = z.enum([
  'activity',
  'note',
  'task',
  'appointment',
  'email',
  'call',
  'meeting',
  'status_change',
]);

export type ContactTimelineEventType = z.infer<typeof contactTimelineEventTypeSchema>;

// Contact Timeline Event Schema
export const contactTimelineEventSchema = z.object({
  id: z.string(),
  type: contactTimelineEventTypeSchema,
  timestamp: z.coerce.date(),
  title: z.string(),
  description: z.string().optional(),
  actor: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ContactTimelineEvent = z.infer<typeof contactTimelineEventSchema>;

// Contact Timeline Response Schema
export const contactTimelineResponseSchema = z.object({
  events: z.array(contactTimelineEventSchema),
  totalCount: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
  durationMs: z.number().optional(),
  meetsKpi: z.boolean().optional(),
});

// IFC-311: Reassign endpoints
export const reassignContactSchema = z.object({
  id: idSchema,
  ownerId: idSchema,
});
export type ReassignContactInput = z.infer<typeof reassignContactSchema>;

export const bulkReassignContactsSchema = z.object({
  ids: z.array(idSchema).min(1).max(100),
  ownerId: idSchema,
});
export type BulkReassignContactsInput = z.infer<typeof bulkReassignContactsSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// IFC-312 — AI chain tRPC procedure schemas
// ═══════════════════════════════════════════════════════════════════════════

export const contactSuggestTagsInputSchema = z.object({ contactId: idSchema });
export type ContactSuggestTagsInput = z.infer<typeof contactSuggestTagsInputSchema>;

export const contactTagSuggestionSchema = z.object({
  label: z.string().min(1).max(40),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(200),
});
export type ContactTagSuggestion = z.infer<typeof contactTagSuggestionSchema>;

export const contactSuggestTagsOutputSchema = z.array(contactTagSuggestionSchema);
export type ContactSuggestTagsOutput = z.infer<typeof contactSuggestTagsOutputSchema>;

export const contactGenerateInsightInputSchema = z.object({ contactId: idSchema });
export type ContactGenerateInsightInput = z.infer<typeof contactGenerateInsightInputSchema>;

export const contactGenerateInsightOutputSchema = z.object({ enqueued: z.boolean() });
export type ContactGenerateInsightOutput = z.infer<typeof contactGenerateInsightOutputSchema>;

export const contactDraftReplyInputSchema = z.object({
  contactId: idSchema,
  emailThreadId: z.string().max(200).optional(),
  userInstructions: z.string().max(2000).optional(),
});
export type ContactDraftReplyInput = z.infer<typeof contactDraftReplyInputSchema>;

export const contactDraftReplyOutputSchema = z.object({
  draftId: z.string(),
  requiresReview: z.boolean(),
});
export type ContactDraftReplyOutput = z.infer<typeof contactDraftReplyOutputSchema>;

export const contactListReplyDraftsInputSchema = z.object({
  contactId: idSchema,
  limit: z.number().int().min(1).max(50).default(5),
});
export type ContactListReplyDraftsInput = z.infer<typeof contactListReplyDraftsInputSchema>;

export const contactReplyDraftSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  draftSubject: z.string(),
  draftBody: z.string(),
  tone: z.string().nullable(),
  status: z.enum(['DRAFT', 'DISMISSED', 'SENT']),
  confidence: z.number(),
  modelVersion: z.string(),
  createdAt: z.date(),
});
export type ContactReplyDraft = z.infer<typeof contactReplyDraftSchema>;

export const contactListReplyDraftsOutputSchema = z.object({
  drafts: z.array(contactReplyDraftSchema),
});
export type ContactListReplyDraftsOutput = z.infer<typeof contactListReplyDraftsOutputSchema>;
