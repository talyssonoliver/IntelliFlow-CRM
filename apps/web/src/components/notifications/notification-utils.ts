/**
 * Notification utility functions for icon/color/label configuration
 *
 * Extracted from page.tsx — all 36 notification types with grouped categories.
 * Priority configs use domain-aligned values: high, normal, low (no urgent/medium).
 *
 * Task: PG-130 — Notifications Inbox Page
 */

import type { NotificationType, NotificationPriority, TypeConfig, PriorityConfig } from './types';
import type { FilterOption } from '@/components/shared';

const TYPE_CONFIGS: Record<string, TypeConfig> = {
  // Lead notifications
  lead_assigned: {
    icon: 'person_add',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    ringColor: 'ring-blue-100 dark:ring-blue-800',
    label: 'Lead Assigned',
    group: 'Lead',
  },
  lead_scored: {
    icon: 'trending_up',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    iconColor: 'text-purple-600 dark:text-purple-400',
    ringColor: 'ring-purple-100 dark:ring-purple-800',
    label: 'Lead Scored',
    group: 'Lead',
  },
  lead_converted: {
    icon: 'check_circle',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    ringColor: 'ring-emerald-100 dark:ring-emerald-800',
    label: 'Lead Converted',
    group: 'Lead',
  },
  lead_activity: {
    icon: 'history',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    ringColor: 'ring-blue-100 dark:ring-blue-800',
    label: 'Lead Activity',
    group: 'Lead',
  },
  // Deal notifications
  deal_assigned: {
    icon: 'assignment_ind',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    ringColor: 'ring-emerald-100 dark:ring-emerald-800',
    label: 'Deal Assigned',
    group: 'Deal',
  },
  deal_stage_changed: {
    icon: 'swap_horiz',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    ringColor: 'ring-blue-100 dark:ring-blue-800',
    label: 'Stage Changed',
    group: 'Deal',
  },
  deal_won: {
    icon: 'emoji_events',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    ringColor: 'ring-emerald-100 dark:ring-emerald-800',
    label: 'Deal Won',
    group: 'Deal',
  },
  deal_lost: {
    icon: 'cancel',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    iconColor: 'text-red-600 dark:text-red-400',
    ringColor: 'ring-red-100 dark:ring-red-800',
    label: 'Deal Lost',
    group: 'Deal',
  },
  deal_at_risk: {
    icon: 'warning',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    ringColor: 'ring-amber-100 dark:ring-amber-800',
    label: 'Deal At Risk',
    group: 'Deal',
  },
  // Task notifications
  task_assigned: {
    icon: 'assignment_ind',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    ringColor: 'ring-amber-100 dark:ring-amber-800',
    label: 'Task Assigned',
    group: 'Task',
  },
  task_due_soon: {
    icon: 'schedule',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    iconColor: 'text-orange-600 dark:text-orange-400',
    ringColor: 'ring-orange-100 dark:ring-orange-800',
    label: 'Due Soon',
    group: 'Task',
  },
  task_overdue: {
    icon: 'warning',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    iconColor: 'text-red-600 dark:text-red-400',
    ringColor: 'ring-red-100 dark:ring-red-800',
    label: 'Overdue',
    group: 'Task',
  },
  task_completed: {
    icon: 'task_alt',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    ringColor: 'ring-emerald-100 dark:ring-emerald-800',
    label: 'Completed',
    group: 'Task',
  },
  task_comment: {
    icon: 'chat_bubble',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    ringColor: 'ring-blue-100 dark:ring-blue-800',
    label: 'Comment',
    group: 'Task',
  },
  // Calendar/Appointment notifications
  appointment_scheduled: {
    icon: 'event_available',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    ringColor: 'ring-emerald-100 dark:ring-emerald-800',
    label: 'Scheduled',
    group: 'Calendar',
  },
  appointment_reminder: {
    icon: 'event',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    iconColor: 'text-purple-600 dark:text-purple-400',
    ringColor: 'ring-purple-100 dark:ring-purple-800',
    label: 'Reminder',
    group: 'Calendar',
  },
  appointment_cancelled: {
    icon: 'event_busy',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    iconColor: 'text-red-600 dark:text-red-400',
    ringColor: 'ring-red-100 dark:ring-red-800',
    label: 'Cancelled',
    group: 'Calendar',
  },
  appointment_rescheduled: {
    icon: 'update',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    ringColor: 'ring-amber-100 dark:ring-amber-800',
    label: 'Rescheduled',
    group: 'Calendar',
  },
  // AI notifications
  ai_insight: {
    icon: 'psychology',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    ringColor: 'ring-indigo-100 dark:ring-indigo-800',
    label: 'AI Insight',
    group: 'AI',
  },
  ai_action_pending: {
    icon: 'pending_actions',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    ringColor: 'ring-amber-100 dark:ring-amber-800',
    label: 'Action Pending',
    group: 'AI',
  },
  ai_action_approved: {
    icon: 'check_circle',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    ringColor: 'ring-emerald-100 dark:ring-emerald-800',
    label: 'Action Approved',
    group: 'AI',
  },
  ai_action_rejected: {
    icon: 'cancel',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    iconColor: 'text-red-600 dark:text-red-400',
    ringColor: 'ring-red-100 dark:ring-red-800',
    label: 'Action Rejected',
    group: 'AI',
  },
  ai_recommendation: {
    icon: 'lightbulb',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    ringColor: 'ring-amber-100 dark:ring-amber-800',
    label: 'Recommendation',
    group: 'AI',
  },
  // Team notifications
  team_mention: {
    icon: 'alternate_email',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    iconColor: 'text-orange-600 dark:text-orange-400',
    ringColor: 'ring-orange-100 dark:ring-orange-800',
    label: 'Mention',
    group: 'Team',
  },
  team_message: {
    icon: 'chat',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    ringColor: 'ring-blue-100 dark:ring-blue-800',
    label: 'Message',
    group: 'Team',
  },
  team_announcement: {
    icon: 'campaign',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    iconColor: 'text-purple-600 dark:text-purple-400',
    ringColor: 'ring-purple-100 dark:ring-purple-800',
    label: 'Announcement',
    group: 'Team',
  },
  // System notifications
  system_alert: {
    icon: 'info',
    bgColor: 'bg-slate-100 dark:bg-slate-700',
    iconColor: 'text-slate-600 dark:text-slate-400',
    ringColor: 'ring-slate-100 dark:ring-slate-700',
    label: 'Alert',
    group: 'System',
  },
  system_maintenance: {
    icon: 'build',
    bgColor: 'bg-slate-100 dark:bg-slate-700',
    iconColor: 'text-slate-600 dark:text-slate-400',
    ringColor: 'ring-slate-100 dark:ring-slate-700',
    label: 'Maintenance',
    group: 'System',
  },
  system_update: {
    icon: 'system_update',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    ringColor: 'ring-blue-100 dark:ring-blue-800',
    label: 'Update',
    group: 'System',
  },
  // Document notifications
  document_shared: {
    icon: 'share',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    ringColor: 'ring-blue-100 dark:ring-blue-800',
    label: 'Shared',
    group: 'Document',
  },
  document_comment: {
    icon: 'comment',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    iconColor: 'text-purple-600 dark:text-purple-400',
    ringColor: 'ring-purple-100 dark:ring-purple-800',
    label: 'Comment',
    group: 'Document',
  },
  document_approval_needed: {
    icon: 'approval',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    ringColor: 'ring-amber-100 dark:ring-amber-800',
    label: 'Approval Needed',
    group: 'Document',
  },
  // Ticket notifications
  ticket_assigned: {
    icon: 'assignment_ind',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    iconColor: 'text-orange-600 dark:text-orange-400',
    ringColor: 'ring-orange-100 dark:ring-orange-800',
    label: 'Ticket Assigned',
    group: 'Ticket',
  },
  ticket_created: {
    icon: 'confirmation_number',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    iconColor: 'text-orange-600 dark:text-orange-400',
    ringColor: 'ring-orange-100 dark:ring-orange-800',
    label: 'Ticket Created',
    group: 'Ticket',
  },
  ticket_escalated: {
    icon: 'priority_high',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    iconColor: 'text-red-600 dark:text-red-400',
    ringColor: 'ring-red-100 dark:ring-red-800',
    label: 'Ticket Escalated',
    group: 'Ticket',
  },
  // Case notifications
  case_assigned: {
    icon: 'gavel',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    ringColor: 'ring-indigo-100 dark:ring-indigo-800',
    label: 'Case Assigned',
    group: 'Case',
  },
  case_status_changed: {
    icon: 'swap_horiz',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    ringColor: 'ring-blue-100 dark:ring-blue-800',
    label: 'Case Status Changed',
    group: 'Case',
  },
  case_closed: {
    icon: 'check_circle',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    ringColor: 'ring-emerald-100 dark:ring-emerald-800',
    label: 'Case Closed',
    group: 'Case',
  },
  // Contact notifications
  contact_stale: {
    icon: 'person_off',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    ringColor: 'ring-amber-100 dark:ring-amber-800',
    label: 'Stale Contact',
    group: 'Contact',
  },
  // Email notifications
  email_received: {
    icon: 'mail',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
    ringColor: 'ring-blue-100 dark:ring-blue-800',
    label: 'Received',
    group: 'Email',
  },
  email_opened: {
    icon: 'drafts',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    ringColor: 'ring-emerald-100 dark:ring-emerald-800',
    label: 'Opened',
    group: 'Email',
  },
  email_replied: {
    icon: 'reply',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    iconColor: 'text-purple-600 dark:text-purple-400',
    ringColor: 'ring-purple-100 dark:ring-purple-800',
    label: 'Replied',
    group: 'Email',
  },
};

const DEFAULT_CONFIG: TypeConfig = {
  icon: 'info',
  bgColor: 'bg-slate-100 dark:bg-slate-700',
  iconColor: 'text-slate-600 dark:text-slate-400',
  ringColor: 'ring-slate-100 dark:ring-slate-700',
  label: 'Notification',
  group: 'System',
};

const PRIORITY_CONFIGS: Record<NotificationPriority, PriorityConfig> = {
  high: {
    borderColor: 'bg-red-500',
    badgeBg: 'bg-red-50 dark:bg-red-900/30',
    badgeText: 'text-red-700 dark:text-red-300',
    badgeRing: 'ring-red-600/10 dark:ring-red-500/20',
    label: 'High',
  },
  normal: {
    borderColor: 'bg-primary',
    badgeBg: 'bg-blue-50 dark:bg-blue-900/30',
    badgeText: 'text-blue-700 dark:text-blue-300',
    badgeRing: 'ring-blue-600/10 dark:ring-blue-500/20',
    label: 'Normal',
  },
  low: {
    borderColor: 'bg-slate-300 dark:bg-slate-600',
    badgeBg: 'bg-slate-50 dark:bg-slate-800',
    badgeText: 'text-slate-700 dark:text-slate-300',
    badgeRing: 'ring-slate-600/10 dark:ring-slate-500/20',
    label: 'Low',
  },
};

/**
 * Groups existing notification types into proactive alert subcategories.
 * Frontend-only derivation used for labeling/filtering — no DB change.
 */
export const PROACTIVE_ALERT_CATEGORIES = {
  'Time-Based': ['appointment_reminder', 'task_due_soon'],
  'Status-Based': [
    'task_overdue',
    'deal_at_risk',
    'contact_stale',
    'ticket_escalated',
    'case_status_changed',
  ],
  Threshold: ['lead_scored'],
  Compliance: ['document_approval_needed'],
} as const;

/**
 * Returns the proactive alert subcategory ('Time-Based' | 'Status-Based' |
 * 'Threshold' | 'Compliance') for a notification type, or undefined when
 * the type is not a proactive alert.
 */
export function getProactiveAlertCategory(type: string): string | undefined {
  for (const [category, types] of Object.entries(PROACTIVE_ALERT_CATEGORIES)) {
    if ((types as readonly string[]).includes(type)) return category;
  }
  return undefined;
}

/** Get icon/color/label configuration for a notification type */
export function getTypeConfig(type: string): TypeConfig {
  return TYPE_CONFIGS[type] || DEFAULT_CONFIG;
}

/** Get priority styling configuration */
export function getPriorityConfig(priority: string): PriorityConfig | undefined {
  return (PRIORITY_CONFIGS as Record<string, PriorityConfig>)[priority];
}

/** Format a date string into relative time (e.g., "5 min ago") */
export function formatRelativeTime(
  dateInput: string | Date,
  timezone: string = 'Europe/London'
): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Future dates or very recent → "Just now"
  if (diffMs < 60000) return 'Just now';

  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}

/** Group all notification types by category */
export function getTypesByGroup(): Record<string, NotificationType[]> {
  const groups: Record<string, NotificationType[]> = {};
  for (const [type, config] of Object.entries(TYPE_CONFIGS)) {
    if (!groups[config.group]) {
      groups[config.group] = [];
    }
    groups[config.group].push(type as NotificationType);
  }
  return groups;
}

/** All notification types as grouped FilterOption[] for SearchFilterBar */
export function getTypeFilterOptions(): FilterOption[] {
  return Object.entries(TYPE_CONFIGS).map(([value, config]) => ({
    value,
    label: config.label,
    group: config.group,
  }));
}
