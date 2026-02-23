/**
 * Notification types and interfaces for the Notifications Inbox
 *
 * Re-exports from @intelliflow/validators to maintain single source of truth
 * for notification types, priorities, and schemas.
 *
 * Task: PG-130 — Notifications Inbox Page
 */

export type {
  Notification,
  NotificationType,
  NotificationPriority,
  NotificationEvent,
  NotificationListResponse,
} from '@intelliflow/validators';

export {
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
} from '@intelliflow/validators';

/** Filter state managed by the page orchestrator */
export interface NotificationFiltersState {
  searchQuery: string;
  typeFilter: string;
  priorityFilter: string;
  activeTab: string;
}

/** Type configuration for rendering notification icons and colors */
export interface TypeConfig {
  icon: string;
  bgColor: string;
  iconColor: string;
  ringColor: string;
  label: string;
  group: string;
}

/** Priority configuration for rendering priority indicators */
export interface PriorityConfig {
  borderColor: string;
  badgeBg: string;
  badgeText: string;
  badgeRing: string;
  label: string;
}
