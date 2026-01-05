/**
 * Timeline Validation Schemas
 *
 * Zod schemas for timeline events, derived from domain constants (single source of truth).
 *
 * Task: IFC-159 - Timeline Enrichment with Documents, Communications, Agent Actions
 */

import { z } from 'zod';
import {
  TIMELINE_EVENT_TYPES,
  AGENT_ACTION_STATUSES,
  TIMELINE_PRIORITIES,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  TIMELINE_EVENT_TYPE_LABELS,
  TIMELINE_EVENT_TYPE_ICONS,
  AGENT_ACTION_STATUS_LABELS,
} from '@intelliflow/domain';

// Re-export label/icon maps from domain for convenience
export {
  TIMELINE_EVENT_TYPE_LABELS,
  TIMELINE_EVENT_TYPE_ICONS,
  AGENT_ACTION_STATUS_LABELS,
} from '@intelliflow/domain';

// =============================================================================
// Enum Schemas - derived from domain constants (single source of truth)
// =============================================================================

export const timelineEventTypeSchema = z.enum(TIMELINE_EVENT_TYPES);
export const agentActionStatusSchema = z.enum(AGENT_ACTION_STATUSES);
export const timelinePrioritySchema = z.enum(TIMELINE_PRIORITIES);
export const communicationChannelSchema = z.enum(COMMUNICATION_CHANNELS);
export const communicationDirectionSchema = z.enum(COMMUNICATION_DIRECTIONS);

// Export types derived from schemas
export type TimelineEventType = z.infer<typeof timelineEventTypeSchema>;
export type AgentActionStatus = z.infer<typeof agentActionStatusSchema>;
export type TimelinePriority = z.infer<typeof timelinePrioritySchema>;
export type CommunicationChannel = z.infer<typeof communicationChannelSchema>;
export type CommunicationDirection = z.infer<typeof communicationDirectionSchema>;

// =============================================================================
// Actor Schema
// =============================================================================

/**
 * Actor who performed an action (user or AI agent)
 */
export const timelineActorSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  isAgent: z.boolean().optional(),
});

export type TimelineActor = z.infer<typeof timelineActorSchema>;

// =============================================================================
// Detail Schemas
// =============================================================================

/**
 * Agent action details for AI-initiated actions
 */
export const agentActionDetailsSchema = z.object({
  actionId: z.string(),
  agentName: z.string(),
  proposedChanges: z.unknown(),
  confidence: z.number().min(0).max(1),
  status: agentActionStatusSchema,
  expiresAt: z.coerce.date().nullable().optional(),
});

export type AgentActionDetails = z.infer<typeof agentActionDetailsSchema>;

/**
 * Document attachment details
 */
export const documentDetailsSchema = z.object({
  documentId: z.string(),
  filename: z.string(),
  version: z.number().optional(),
  mimeType: z.string().optional(),
});

export type DocumentDetails = z.infer<typeof documentDetailsSchema>;

/**
 * Communication (email, call, etc.) details
 */
export const communicationDetailsSchema = z.object({
  channel: communicationChannelSchema,
  direction: communicationDirectionSchema,
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
});

export type CommunicationDetails = z.infer<typeof communicationDetailsSchema>;

/**
 * Appointment details
 */
export const appointmentDetailsSchema = z.object({
  appointmentId: z.string(),
  appointmentType: z.string(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  location: z.string().nullable().optional(),
  status: z.string(),
});

export type AppointmentDetails = z.infer<typeof appointmentDetailsSchema>;

/**
 * Task details
 */
export const taskDetailsSchema = z.object({
  taskId: z.string(),
  status: z.string(),
  dueDate: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
});

export type TaskDetails = z.infer<typeof taskDetailsSchema>;

// =============================================================================
// Main Timeline Event Schema
// =============================================================================

/**
 * Unified timeline event
 *
 * Represents any event that can appear in the timeline,
 * with type-specific details in optional fields.
 */
export const timelineEventSchema = z.object({
  /** Unique event identifier (prefixed with type, e.g., "task-123") */
  id: z.string(),

  /** Event type for routing to appropriate renderer */
  type: timelineEventTypeSchema,

  /** Event title/summary */
  title: z.string(),

  /** Optional detailed description */
  description: z.string().nullable().optional(),

  /** When the event occurred/is scheduled */
  timestamp: z.coerce.date(),

  /** Event priority (for tasks and deadlines) */
  priority: timelinePrioritySchema.nullable().optional(),

  /** Type of entity this event relates to */
  entityType: z.string().nullable().optional(),

  /** ID of the related entity */
  entityId: z.string().nullable().optional(),

  /** Agent action details (when type is 'agent_action') */
  agentAction: agentActionDetailsSchema.nullable().optional(),

  /** Document details (when type is 'document' or 'document_version') */
  document: documentDetailsSchema.nullable().optional(),

  /** Communication details (when type is 'communication', 'email', or 'call') */
  communication: communicationDetailsSchema.nullable().optional(),

  /** Appointment details (when type is 'appointment') */
  appointment: appointmentDetailsSchema.nullable().optional(),

  /** Task details (when type is 'task', 'task_completed', or 'task_overdue') */
  task: taskDetailsSchema.nullable().optional(),

  /** Actor who performed the action */
  actor: timelineActorSchema.nullable().optional(),

  /** Additional metadata */
  metadata: z.record(z.unknown()).nullable().optional(),

  /** Whether the event is overdue */
  isOverdue: z.boolean().optional(),
});

export type TimelineEvent = z.infer<typeof timelineEventSchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Response from timeline.getEvents
 */
export const timelineEventsResponseSchema = z.object({
  events: z.array(timelineEventSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
  queryDurationMs: z.number(),
});

export type TimelineEventsResponse = z.infer<typeof timelineEventsResponseSchema>;

/**
 * Response from timeline.getStats
 */
export const timelineStatsResponseSchema = z.object({
  tasks: z.object({
    total: z.number(),
    completed: z.number(),
    overdue: z.number(),
    pending: z.number(),
  }),
  appointments: z.object({
    upcoming: z.number(),
  }),
  agentActions: z.object({
    pendingApproval: z.number(),
  }),
  queryDurationMs: z.number(),
});

export type TimelineStatsResponse = z.infer<typeof timelineStatsResponseSchema>;

/**
 * Deadline item from timeline.getUpcomingDeadlines
 */
export const deadlineItemSchema = z.object({
  id: z.string(),
  type: z.enum(['task', 'appointment']),
  title: z.string(),
  dueDate: z.coerce.date(),
  priority: timelinePrioritySchema.nullable(),
  isOverdue: z.boolean(),
});

export type DeadlineItem = z.infer<typeof deadlineItemSchema>;

/**
 * Response from timeline.getUpcomingDeadlines
 */
export const upcomingDeadlinesResponseSchema = z.object({
  deadlines: z.array(deadlineItemSchema),
  total: z.number(),
  queryDurationMs: z.number(),
});

export type UpcomingDeadlinesResponse = z.infer<typeof upcomingDeadlinesResponseSchema>;

/**
 * Pending agent action from timeline.getPendingAgentActions
 */
export const pendingAgentActionSchema = z.object({
  id: z.string(),
  actionId: z.string(),
  agentName: z.string(),
  actionType: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  proposedChanges: z.unknown(),
  confidence: z.number(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable(),
  entityType: z.string(),
  entityId: z.string(),
});

export type PendingAgentAction = z.infer<typeof pendingAgentActionSchema>;

/**
 * Response from timeline.getPendingAgentActions
 */
export const pendingAgentActionsResponseSchema = z.object({
  actions: z.array(pendingAgentActionSchema),
  total: z.number(),
  queryDurationMs: z.number(),
});

export type PendingAgentActionsResponse = z.infer<typeof pendingAgentActionsResponseSchema>;

// =============================================================================
// Query Parameters Schema
// =============================================================================

/**
 * Query parameters for fetching timeline events
 */
export const timelineQueryParamsSchema = z.object({
  dealId: z.string().optional(),
  caseId: z.string().optional(),
  opportunityId: z.string().optional(),
  contactId: z.string().optional(),
  accountId: z.string().optional(),
  eventTypes: z.array(timelineEventTypeSchema).optional(),
  excludeTypes: z.array(timelineEventTypeSchema).optional(),
  priorities: z.array(timelinePrioritySchema).optional(),
  agentActionStatus: z.array(agentActionStatusSchema).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  page: z.number().optional(),
  limit: z.number().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  includeCompleted: z.boolean().optional(),
  search: z.string().optional(),
});

export type TimelineQueryParams = z.infer<typeof timelineQueryParamsSchema>;
