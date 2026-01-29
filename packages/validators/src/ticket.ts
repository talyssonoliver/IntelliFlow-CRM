import { z } from 'zod';
import { idSchema, paginationSchema } from './common';
import { TICKET_STATUSES, TICKET_PRIORITIES, SLA_STATUSES } from '@intelliflow/domain';

// Re-export common schemas
export { idSchema } from './common';

// Enums - derived from domain constants (single source of truth)
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);
export const slaStatusSchema = z.enum(SLA_STATUSES);

export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type SLAStatus = z.infer<typeof slaStatusSchema>;

// Create Ticket Schema
export const createTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: ticketPrioritySchema,
  contactName: z.string().min(1).max(100),
  contactEmail: z.string().email(),
  contactId: idSchema.optional(),
  assigneeId: idSchema.optional(),
  slaPolicyId: idSchema,
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

// Update Ticket Schema
export const updateTicketSchema = z.object({
  id: idSchema,
  subject: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  assigneeId: idSchema.optional().nullable(),
});

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

// Ticket Query Schema
export const ticketQuerySchema = paginationSchema.extend({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  assignedToId: idSchema.optional(),
});

export type TicketQueryInput = z.infer<typeof ticketQuerySchema>;

// Add Response Schema
export const addResponseSchema = z.object({
  ticketId: idSchema,
  content: z.string().min(1),
  authorName: z.string().min(1),
  authorRole: z.string().default('Agent'),
});

export type AddResponseInput = z.infer<typeof addResponseSchema>;
