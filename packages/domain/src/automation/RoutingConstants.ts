/**
 * Routing Domain Constants
 *
 * PG-132: Smart Lead Routing UI
 *
 * Single source of truth for routing-related enums and constants.
 * Used by validators and UI components.
 */

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
export type RoutingConditionOperator =
  (typeof ROUTING_CONDITION_OPERATORS)[number];

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

export const AGENT_STATUSES = [
  'ONLINE',
  'BUSY',
  'AWAY',
  'OFFLINE',
  'ON_BREAK',
] as const;
export type AgentStatusType = (typeof AGENT_STATUSES)[number];
