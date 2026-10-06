/**
 * Routing Domain Constants
 *
 * PG-132: Smart Lead Routing UI
 *
 * Single source of truth for routing-related enums and constants.
 * Used by validators and UI components.
 */

import {
  SLA_STATUSES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_ROUTING_WEIGHT,
  TICKET_STATUSES,
  type TicketPriority,
} from '../support/TicketConstants';

export const ROUTING_REASONS = [
  'rule_match',
  'skill_match',
  'load_balance',
  'manual',
  'escalation',
] as const;
export type RoutingReason = (typeof ROUTING_REASONS)[number];

export const ROUTING_CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'in',
  'not_in',
  'contains',
] as const;
export type RoutingConditionOperator = (typeof ROUTING_CONDITION_OPERATORS)[number];

export const ROUTING_CONDITION_FIELDS = [
  'leadScore',
  'leadSource',
  'leadStatus',
  'estimatedValue',
  'location',
  'tags',
] as const;
export type RoutingConditionField = (typeof ROUTING_CONDITION_FIELDS)[number];

export const ROUTING_ACTION_TYPES = [
  'assign_to_user',
  'assign_to_team',
  'assign_by_skill',
  'notify',
  'escalate',
] as const;
export type RoutingActionType = (typeof ROUTING_ACTION_TYPES)[number];

export const AGENT_STATUSES = ['ONLINE', 'BUSY', 'AWAY', 'OFFLINE', 'ON_BREAK'] as const;
export type AgentStatusType = (typeof AGENT_STATUSES)[number];

// =============================================================================
// IFC-067: Ticket Routing Constants
// =============================================================================

/**
 * Condition fields for ticket routing rules.
 */
export const TICKET_ROUTING_CONDITION_FIELDS = [
  'ticketPriority',
  'ticketCategory',
  'ticketStatus',
  'isSlaBreached',
  'slaStatus',
] as const;
export type TicketRoutingConditionField = (typeof TICKET_ROUTING_CONDITION_FIELDS)[number];

/**
 * Ticket routing strategy types.
 */
export const TICKET_ROUTING_STRATEGIES = [
  'rule_match',
  'skill_match',
  'load_balance',
  'escalation',
] as const;
export type TicketRoutingStrategy = (typeof TICKET_ROUTING_STRATEGIES)[number];

/**
 * Ticket routing failure reason codes.
 */
export const TICKET_ROUTING_FAILURE_REASONS = [
  'no_eligible_agents',
  'no_skill_match',
  'engine_error',
] as const;
export type TicketRoutingFailureReason = (typeof TICKET_ROUTING_FAILURE_REASONS)[number];

// =============================================================================
// Ticket automation rules (stored in routing_rules with ruleType = 'TICKET')
// =============================================================================

/**
 * Discriminator for the shared routing_rules table. Lead routing and ticket
 * routing keep different vocabularies, so each reads only its own rows.
 */
export const ROUTING_RULE_TYPES = ['LEAD', 'TICKET'] as const;
export type RoutingRuleType = (typeof ROUTING_RULE_TYPES)[number];

/**
 * Operators for ticket rule conditions. `in`/`not_in` take a list of values;
 * `gte`/`lte` compare priority by routing weight and apply to ticketPriority only.
 */
export const TICKET_ROUTING_CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'in',
  'not_in',
  'gte',
  'lte',
] as const;
export type TicketRoutingConditionOperator = (typeof TICKET_ROUTING_CONDITION_OPERATORS)[number];

/**
 * Actions the ticket routing engine executes when a rule matches.
 */
export const TICKET_ROUTING_ACTION_TYPES = ['assign_to_user', 'assign_to_skill'] as const;
export type TicketRoutingActionType = (typeof TICKET_ROUTING_ACTION_TYPES)[number];

/**
 * Closed set of values each ticket condition field may be compared against.
 */
export const TICKET_ROUTING_FIELD_VALUES: Record<TicketRoutingConditionField, readonly string[]> = {
  ticketPriority: TICKET_PRIORITIES,
  ticketCategory: TICKET_CATEGORIES,
  ticketStatus: TICKET_STATUSES,
  isSlaBreached: ['true', 'false'],
  slaStatus: SLA_STATUSES,
};

export interface TicketRoutingCondition {
  field: TicketRoutingConditionField;
  operator: TicketRoutingConditionOperator;
  value: string | string[];
}

export type TicketRoutingContext = Record<TicketRoutingConditionField, string>;

/**
 * Evaluate ticket rule conditions (logical AND) against a ticket's facts.
 * An empty condition list never matches: a rule must say what it applies to.
 */
export function evaluateTicketRoutingConditions(
  conditions: readonly TicketRoutingCondition[],
  context: Partial<TicketRoutingContext>
): boolean {
  if (conditions.length === 0) return false;
  return conditions.every((condition) => {
    const actual = context[condition.field];
    if (actual === undefined) return false;
    const expected = condition.value;
    switch (condition.operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      case 'gte':
      case 'lte': {
        const actualWeight = TICKET_PRIORITY_ROUTING_WEIGHT[actual as TicketPriority];
        const expectedWeight = TICKET_PRIORITY_ROUTING_WEIGHT[expected as TicketPriority];
        if (actualWeight === undefined || expectedWeight === undefined) return false;
        return condition.operator === 'gte'
          ? actualWeight >= expectedWeight
          : actualWeight <= expectedWeight;
      }
    }
  });
}
