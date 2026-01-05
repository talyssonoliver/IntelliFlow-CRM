import { z } from 'zod';
import { idSchema } from './common';
import { LEAD_STATUSES } from '@intelliflow/domain';
import { TICKET_STATUSES, TICKET_PRIORITIES } from '@intelliflow/domain';

// =============================================================================
// Common Bulk Operation Schemas
// =============================================================================

/** Base schema for bulk operations - array of IDs */
export const bulkIdsSchema = z.object({
  ids: z.array(idSchema).min(1, 'At least one item must be selected').max(100, 'Maximum 100 items per operation'),
});

export type BulkIdsInput = z.infer<typeof bulkIdsSchema>;

/** Result type for bulk operations */
export const bulkOperationResultSchema = z.object({
  successful: z.array(z.string()),
  failed: z.array(
    z.object({
      id: z.string(),
      error: z.string(),
    })
  ),
  totalProcessed: z.number(),
});

export type BulkOperationResult = z.infer<typeof bulkOperationResultSchema>;

// =============================================================================
// Lead Bulk Operation Schemas
// =============================================================================

/** Bulk convert leads to contacts */
export const bulkConvertLeadsSchema = bulkIdsSchema.extend({
  createAccounts: z.boolean().default(false),
});

export type BulkConvertLeadsInput = z.infer<typeof bulkConvertLeadsSchema>;

/** Bulk update lead status */
export const bulkUpdateLeadStatusSchema = bulkIdsSchema.extend({
  status: z.enum(LEAD_STATUSES),
});

export type BulkUpdateLeadStatusInput = z.infer<typeof bulkUpdateLeadStatusSchema>;

/** Bulk archive leads (set status to LOST) */
export const bulkArchiveLeadsSchema = bulkIdsSchema;

export type BulkArchiveLeadsInput = z.infer<typeof bulkArchiveLeadsSchema>;

/** Bulk delete leads */
export const bulkDeleteLeadsSchema = bulkIdsSchema;

export type BulkDeleteLeadsInput = z.infer<typeof bulkDeleteLeadsSchema>;

// =============================================================================
// Contact Bulk Operation Schemas
// =============================================================================

/** Bulk send email to contacts - returns email addresses for mailto: */
export const bulkEmailContactsSchema = bulkIdsSchema;

export type BulkEmailContactsInput = z.infer<typeof bulkEmailContactsSchema>;

/** Bulk create deals for contacts */
export const bulkCreateDealsSchema = bulkIdsSchema.extend({
  dealName: z.string().min(1).max(200).optional(),
  value: z.number().positive().optional(),
});

export type BulkCreateDealsInput = z.infer<typeof bulkCreateDealsSchema>;

/** Bulk export contacts */
export const bulkExportContactsSchema = bulkIdsSchema.extend({
  format: z.enum(['csv', 'json']).default('csv'),
});

export type BulkExportContactsInput = z.infer<typeof bulkExportContactsSchema>;

/** Bulk delete contacts */
export const bulkDeleteContactsSchema = bulkIdsSchema;

export type BulkDeleteContactsInput = z.infer<typeof bulkDeleteContactsSchema>;

// =============================================================================
// Ticket Bulk Operation Schemas
// =============================================================================

/** Bulk assign tickets to a user */
export const bulkAssignTicketsSchema = bulkIdsSchema.extend({
  assigneeId: idSchema,
});

export type BulkAssignTicketsInput = z.infer<typeof bulkAssignTicketsSchema>;

/** Bulk update ticket status */
export const bulkUpdateTicketStatusSchema = bulkIdsSchema.extend({
  status: z.enum(TICKET_STATUSES),
});

export type BulkUpdateTicketStatusInput = z.infer<typeof bulkUpdateTicketStatusSchema>;

/** Bulk resolve tickets */
export const bulkResolveTicketsSchema = bulkIdsSchema.extend({
  resolution: z.string().max(1000).optional(),
});

export type BulkResolveTicketsInput = z.infer<typeof bulkResolveTicketsSchema>;

/** Bulk escalate tickets (set priority to CRITICAL) */
export const bulkEscalateTicketsSchema = bulkIdsSchema.extend({
  reason: z.string().max(500).optional(),
});

export type BulkEscalateTicketsInput = z.infer<typeof bulkEscalateTicketsSchema>;

/** Bulk close tickets */
export const bulkCloseTicketsSchema = bulkIdsSchema;

export type BulkCloseTicketsInput = z.infer<typeof bulkCloseTicketsSchema>;

// =============================================================================
// Document Bulk Operation Schemas
// =============================================================================

/** Bulk download documents */
export const bulkDownloadDocumentsSchema = bulkIdsSchema;

export type BulkDownloadDocumentsInput = z.infer<typeof bulkDownloadDocumentsSchema>;

/** Bulk share documents */
export const bulkShareDocumentsSchema = bulkIdsSchema.extend({
  recipientIds: z.array(idSchema).min(1),
  permission: z.enum(['READ', 'EDIT', 'ADMIN']).default('READ'),
});

export type BulkShareDocumentsInput = z.infer<typeof bulkShareDocumentsSchema>;

/** Bulk archive documents (set status to ARCHIVED) */
export const bulkArchiveDocumentsSchema = bulkIdsSchema;

export type BulkArchiveDocumentsInput = z.infer<typeof bulkArchiveDocumentsSchema>;

/** Bulk delete documents (soft delete - set status to DELETED) */
export const bulkDeleteDocumentsSchema = bulkIdsSchema;

export type BulkDeleteDocumentsInput = z.infer<typeof bulkDeleteDocumentsSchema>;
