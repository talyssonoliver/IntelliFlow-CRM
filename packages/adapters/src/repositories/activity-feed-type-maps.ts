/**
 * Maps from source-specific activity types to the normalized feed types, and the reverse
 * lookup used to filter by feed type inside each source query (before its row limit).
 */
import type { ActivityFeedType } from '@intelliflow/domain';
export const LEAD_ACTIVITY_TYPE_MAP: Record<string, ActivityFeedType> = {
  WEB_FORM: 'SYSTEM',
  EMAIL: 'EMAIL',
  CALL: 'CALL',
  MEETING: 'MEETING',
  NOTE: 'NOTE',
  SCORE_UPDATE: 'SCORE_UPDATE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  QUALIFICATION: 'QUALIFICATION',
};

export const CONTACT_ACTIVITY_TYPE_MAP: Record<string, ActivityFeedType> = {
  EMAIL: 'EMAIL',
  CALL: 'CALL',
  MEETING: 'MEETING',
  CHAT: 'CHAT',
  DOCUMENT: 'DOCUMENT',
  DEAL: 'DEAL',
  TICKET: 'TICKET',
  NOTE: 'NOTE',
};

export const OPPORTUNITY_EVENT_TYPE_MAP: Record<string, ActivityFeedType> = {
  EMAIL: 'EMAIL',
  CALL: 'CALL',
  MEETING: 'MEETING',
  NOTE: 'NOTE',
  TASK: 'TASK',
  STAGE_CHANGE: 'STAGE_CHANGE',
  AGENT_ACTION: 'AGENT_ACTION',
  SYSTEM: 'SYSTEM',
};

export const TICKET_ACTIVITY_TYPE_MAP: Record<string, ActivityFeedType> = {
  CUSTOMER_MESSAGE: 'SYSTEM',
  AGENT_REPLY: 'SYSTEM',
  INTERNAL_NOTE: 'NOTE',
  SYSTEM_EVENT: 'SYSTEM',
  SLA_ALERT: 'SLA_ALERT',
  ASSIGNMENT: 'ASSIGNMENT',
  STATUS_CHANGE: 'STATUS_CHANGE',
};

/**
 * Prisma `where` fragment that keeps only rows whose source type normalizes to one of the
 * requested feed types. Source types missing from the map normalize to SYSTEM, so asking
 * for SYSTEM also keeps them. Returns undefined when no type filter is requested and null
 * when the source can never produce a requested type (skip the query).
 */
export function sourceTypeWhere(
  map: Record<string, ActivityFeedType>,
  types: readonly ActivityFeedType[] | undefined
): Record<string, unknown> | undefined | null {
  if (!types || types.length === 0) return undefined;
  const wanted = new Set<ActivityFeedType>(types);
  const keys = Object.keys(map);
  const clauses: Record<string, unknown>[] = [];
  const matching = keys.filter((key) => wanted.has(map[key]!));
  if (matching.length > 0) clauses.push({ type: { in: matching } });
  if (wanted.has('SYSTEM')) clauses.push({ type: { notIn: keys } });
  return clauses.length > 0 ? { OR: clauses } : null;
}

/** True when a source whose rows all have one fixed feed type can serve the requested types. */
export function sourceServesType(
  fixed: ActivityFeedType,
  types: readonly ActivityFeedType[] | undefined
): boolean {
  return !types || types.length === 0 || types.includes(fixed);
}
