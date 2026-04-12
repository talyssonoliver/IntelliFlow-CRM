// Canonical enum values for Ticket domain - single source of truth
export const TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_ON_CUSTOMER',
  'WAITING_ON_THIRD_PARTY',
  'RESOLVED',
  'CLOSED',
  'ARCHIVED',
] as const;
export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const SLA_STATUSES = ['ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'PAUSED'] as const;

// Ticket categories - placeholder for IFC-189 migration
// Will be populated when TicketCategory table is integrated
export const TICKET_CATEGORIES = [
  'BILLING',
  'TECHNICAL',
  'SALES',
  'GENERAL',
  'FEATURE_REQUEST',
  'BUG_REPORT',
] as const;

// Derive types from const arrays
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type SLAStatus = (typeof SLA_STATUSES)[number];
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

/**
 * Valid ticket status transitions - state machine definition
 * Key: Current status, Value: Array of valid target statuses
 *
 * State Machine:
 * OPEN → IN_PROGRESS, WAITING_ON_CUSTOMER, WAITING_ON_THIRD_PARTY, RESOLVED, CLOSED
 * IN_PROGRESS → OPEN, WAITING_ON_CUSTOMER, WAITING_ON_THIRD_PARTY, RESOLVED, CLOSED
 * WAITING_ON_CUSTOMER → OPEN, IN_PROGRESS, RESOLVED, CLOSED
 * WAITING_ON_THIRD_PARTY → OPEN, IN_PROGRESS, RESOLVED, CLOSED
 * RESOLVED → OPEN (reopen), CLOSED, ARCHIVED
 * CLOSED → ARCHIVED
 * ARCHIVED → (terminal state - no transitions)
 */
export const VALID_TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'WAITING_ON_THIRD_PARTY', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['OPEN', 'WAITING_ON_CUSTOMER', 'WAITING_ON_THIRD_PARTY', 'RESOLVED', 'CLOSED'],
  WAITING_ON_CUSTOMER: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  WAITING_ON_THIRD_PARTY: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['OPEN', 'CLOSED', 'ARCHIVED'],
  CLOSED: ['ARCHIVED'],
  ARCHIVED: [],
} as const;

/**
 * Check if a status transition is valid
 * @param from Current ticket status
 * @param to Target ticket status
 * @returns true if transition is allowed
 */
export function canTransitionTicketTo(from: TicketStatus, to: TicketStatus): boolean {
  const validTargets = VALID_TICKET_TRANSITIONS[from];
  return validTargets.includes(to);
}

/**
 * Check if a status is a terminal state (no outgoing transitions)
 */
export function isTerminalStatus(status: TicketStatus): boolean {
  return VALID_TICKET_TRANSITIONS[status].length === 0;
}

/**
 * Check if a status is a waiting state (SLA should be paused)
 */
export function isWaitingStatus(status: TicketStatus): boolean {
  return status === 'WAITING_ON_CUSTOMER' || status === 'WAITING_ON_THIRD_PARTY';
}

// =============================================================================
// IFC-067: Ticket Routing Constants
// =============================================================================

/**
 * Maps ticket categories to required agent skill names.
 * Used by TicketRoutingService to find agents with matching skills.
 */
export const TICKET_CATEGORY_SKILL_MAP: Record<TicketCategory, string> = {
  BILLING: 'billing',
  TECHNICAL: 'technical',
  SALES: 'sales',
  GENERAL: 'technical',
  FEATURE_REQUEST: 'product',
  BUG_REPORT: 'technical',
} as const;

/**
 * Priority weights for routing order.
 * Higher weight = higher routing priority.
 */
export const TICKET_PRIORITY_ROUTING_WEIGHT: Record<TicketPriority, number> = {
  CRITICAL: 1000,
  HIGH: 100,
  MEDIUM: 10,
  LOW: 1,
} as const;

/**
 * SLA statuses that trigger escalation routing.
 */
export const SLA_ESCALATION_TRIGGER_STATUSES = ['BREACHED'] as const;
export type SlaEscalationTriggerStatus = (typeof SLA_ESCALATION_TRIGGER_STATUSES)[number];
