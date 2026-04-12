/**
 * Activity Feed Constants
 * IFC-069: Unified Activity Feed Service
 *
 * Single source of truth for activity feed type enums.
 * Validators layer derives Zod schemas from these const arrays.
 */

/** Sources of activity items in the unified feed */
export const ACTIVITY_FEED_SOURCES = [
  'LEAD_ACTIVITY',
  'CONTACT_ACTIVITY',
  'OPPORTUNITY_EVENT',
  'TICKET_ACTIVITY',
  'EMAIL',
  'CALL',
  'CHAT',
] as const;

export type ActivityFeedSource = (typeof ACTIVITY_FEED_SOURCES)[number];

/** Normalized activity types across all sources */
export const ACTIVITY_FEED_TYPES = [
  'EMAIL',
  'CALL',
  'MEETING',
  'NOTE',
  'TASK',
  'CHAT',
  'DOCUMENT',
  'DEAL',
  'TICKET',
  'STAGE_CHANGE',
  'STATUS_CHANGE',
  'SCORE_UPDATE',
  'QUALIFICATION',
  'AGENT_ACTION',
  'SLA_ALERT',
  'ASSIGNMENT',
  'SYSTEM',
] as const;

export type ActivityFeedType = (typeof ACTIVITY_FEED_TYPES)[number];

/** Entity types that can be associated with feed items */
export const ACTIVITY_FEED_ENTITY_TYPES = [
  'LEAD',
  'CONTACT',
  'OPPORTUNITY',
  'TICKET',
  'ACCOUNT',
  'TASK',
  'CASE',
  'DOCUMENT',
] as const;

export type ActivityFeedEntityType = (typeof ACTIVITY_FEED_ENTITY_TYPES)[number];

/** Time windows for activity feed stats aggregation */
export const ACTIVITY_FEED_TIME_WINDOWS = ['24h', '7d', '30d', 'all'] as const;

export type ActivityFeedTimeWindow = (typeof ACTIVITY_FEED_TIME_WINDOWS)[number];

/** Default feed page size */
export const ACTIVITY_FEED_DEFAULT_LIMIT = 20;

/** Maximum feed page size */
export const ACTIVITY_FEED_MAX_LIMIT = 100;
