import { z } from 'zod';
import { TICKET_CATEGORIES, ROUTING_REASONS, TICKET_ROUTING_STRATEGIES } from '@intelliflow/domain';

// =============================================================================
// IFC-067: Ticket Routing Validation Schemas
// =============================================================================

/**
 * Agent candidate schema — canonical location for shared use
 * by both AI chain and routing service.
 */
export const agentCandidateSchema = z.object({
  agentId: z.string(),
  name: z.string(),
  skills: z.array(z.string()),
  currentLoad: z.number().min(0),
  maxCapacity: z.number().min(1),
  status: z.enum(['ONLINE', 'BUSY', 'AWAY', 'OFFLINE', 'ON_BREAK']),
});
export type AgentCandidate = z.infer<typeof agentCandidateSchema>;

/**
 * Input schema for the AI routing chain.
 */
export const ticketRoutingInputSchema = z.object({
  ticketId: z.string(),
  tenantId: z.string(),
  subject: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  agentCandidates: z.array(agentCandidateSchema).min(1).max(10),
  sentimentUrgencyScore: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TicketRoutingInput = z.infer<typeof ticketRoutingInputSchema>;

/**
 * Output schema for the AI routing chain result.
 */
export const ticketRoutingResultSchema = z.object({
  inferredCategory: z.enum(TICKET_CATEGORIES),
  assigneeId: z.string(),
  assigneeName: z.string(),
  reason: z.string().max(300),
  matchedSkills: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  escalationRisk: z.enum(['low', 'medium', 'high']),
  routingMethod: z.enum(TICKET_ROUTING_STRATEGIES),
  executionTimeMs: z.number(),
  modelVersion: z.string(),
  isFallback: z.boolean(),
});
export type TicketRoutingResult = z.infer<typeof ticketRoutingResultSchema>;

/**
 * Input for the autoRoute mutation.
 */
export const autoRouteInputSchema = z.object({
  ticketId: z.string(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  reason: z.enum(ROUTING_REASONS).optional(),
});
export type AutoRouteInput = z.infer<typeof autoRouteInputSchema>;

/**
 * Input for the suggestAssignee query.
 */
export const suggestAssigneeInputSchema = z.object({
  ticketId: z.string(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  limit: z.number().min(1).max(10).default(5),
});
export type SuggestAssigneeInput = z.infer<typeof suggestAssigneeInputSchema>;
