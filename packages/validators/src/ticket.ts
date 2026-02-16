import { z } from 'zod';
import { idSchema, paginationSchema } from './common';
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  SLA_STATUSES,
  TICKET_CATEGORIES,
  canTransitionTicketTo,
} from '@intelliflow/domain';

// Re-export common schemas
export { idSchema } from './common';

// Enums - derived from domain constants (single source of truth)
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);
export const slaStatusSchema = z.enum(SLA_STATUSES);
export const ticketCategorySchema = z.enum(TICKET_CATEGORIES);

export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type SLAStatus = z.infer<typeof slaStatusSchema>;
export type TicketCategory = z.infer<typeof ticketCategorySchema>;

// Re-export transition helper for use in API layer
export { canTransitionTicketTo };

// Create Ticket Schema
export const createTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: ticketPrioritySchema,
  category: ticketCategorySchema.optional(), // Optional until IFC-189 migration
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
  category: ticketCategorySchema.optional(),
  assigneeId: idSchema.optional().nullable(),
});

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

// Ticket Query Schema
export const ticketQuerySchema = paginationSchema.extend({
  search: z.string().max(200).optional(),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  category: ticketCategorySchema.optional(),
  slaStatus: slaStatusSchema.optional(),
  assignedToId: idSchema.optional(),
  contactId: idSchema.optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'slaResolutionDue']).default('createdAt'),
});

export type TicketQueryInput = z.infer<typeof ticketQuerySchema>;

// Stats Input Schema — time window for stats filtering
export const statsInputSchema = z.object({
  timeWindow: z.enum(['24h', '7d', '30d', 'all']).default('all'),
});

export type StatsInput = z.infer<typeof statsInputSchema>;

// Add Response Schema
export const addResponseSchema = z.object({
  ticketId: idSchema,
  content: z.string().min(1),
  authorName: z.string().min(1),
  authorRole: z.string().default('Agent'),
});

export type AddResponseInput = z.infer<typeof addResponseSchema>;

// Status Transition Schema - validates that a transition is allowed
export const statusTransitionSchema = z
  .object({
    ticketId: idSchema,
    fromStatus: ticketStatusSchema,
    toStatus: ticketStatusSchema,
    changedBy: z.string().min(1),
    reason: z.string().optional(),
  })
  .refine((data) => canTransitionTicketTo(data.fromStatus, data.toStatus), {
    message: 'Invalid status transition',
    path: ['toStatus'],
  });

export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>;

// SLA Pause/Resume Schema
export const slaPauseSchema = z.object({
  ticketId: idSchema,
  reason: z.string().min(1),
  pausedBy: z.string().min(1),
});

export type SlaPauseInput = z.infer<typeof slaPauseSchema>;

export const slaResumeSchema = z.object({
  ticketId: idSchema,
  resumedBy: z.string().min(1),
});

export type SlaResumeInput = z.infer<typeof slaResumeSchema>;
