/**
 * Activity Feed Type Registry
 * IFC-193: Enum-based mapping from AuditLogEntry.eventType to ActivityFeedType
 *
 * Single source of truth for event-type-to-feed-type mapping with UI metadata.
 * Consumers replace string matching with registry lookup.
 * New event types require only a single registry entry.
 */

import type { ActivityFeedType } from '../../activity-feed/ActivityFeedConstants';

/** UI metadata for an activity feed event type */
export interface ActivityTypeMetadata {
  /** The normalized ActivityFeedType for this event */
  feedType: ActivityFeedType;
  /** Lucide icon name (e.g., 'mail', 'phone', 'calendar') */
  icon: string;
  /** Human-readable label */
  label: string;
  /** Tailwind color token (e.g., 'blue-500', 'green-500') */
  color: string;
}

/** Default metadata for unmapped event types */
export const DEFAULT_METADATA: ActivityTypeMetadata = {
  feedType: 'SYSTEM',
  icon: 'activity',
  label: 'System Event',
  color: 'gray-500',
};

/**
 * Maps all known AuditLogEntry.eventType values to ActivityFeedType with metadata.
 * Grouped by entity/domain for readability.
 */
export const ACTIVITY_TYPE_REGISTRY: Record<string, ActivityTypeMetadata> = {
  // ── Lead Events (6) ──────────────────────────────────────────────────
  'lead.created': {
    feedType: 'STATUS_CHANGE',
    icon: 'user-plus',
    label: 'Lead Created',
    color: 'green-500',
  },
  'lead.scored': {
    feedType: 'SCORE_UPDATE',
    icon: 'bar-chart',
    label: 'Lead Scored',
    color: 'purple-500',
  },
  'lead.status_changed': {
    feedType: 'STATUS_CHANGE',
    icon: 'refresh-cw',
    label: 'Lead Status Changed',
    color: 'blue-500',
  },
  'lead.qualified': {
    feedType: 'QUALIFICATION',
    icon: 'award',
    label: 'Lead Qualified',
    color: 'amber-500',
  },
  'lead.converted': {
    feedType: 'QUALIFICATION',
    icon: 'arrow-right-circle',
    label: 'Lead Converted',
    color: 'amber-500',
  },
  'lead.routed': {
    feedType: 'ASSIGNMENT',
    icon: 'send',
    label: 'Lead Routed',
    color: 'indigo-500',
  },

  // ── Contact Events (8) ───────────────────────────────────────────────
  'contact.created': {
    feedType: 'STATUS_CHANGE',
    icon: 'user-plus',
    label: 'Contact Created',
    color: 'green-500',
  },
  'contact.updated': {
    feedType: 'STATUS_CHANGE',
    icon: 'edit',
    label: 'Contact Updated',
    color: 'blue-500',
  },
  'contact.account_associated': {
    feedType: 'NOTE',
    icon: 'link',
    label: 'Contact Linked to Account',
    color: 'gray-600',
  },
  'contact.account_disassociated': {
    feedType: 'NOTE',
    icon: 'unlink',
    label: 'Contact Unlinked from Account',
    color: 'gray-600',
  },
  'contact.converted_from_lead': {
    feedType: 'QUALIFICATION',
    icon: 'arrow-right-circle',
    label: 'Contact Converted from Lead',
    color: 'amber-500',
  },
  'contact.linked_to_lead': {
    feedType: 'NOTE',
    icon: 'link',
    label: 'Contact Linked to Lead',
    color: 'gray-600',
  },
  'contact.unlinked_from_lead': {
    feedType: 'NOTE',
    icon: 'unlink',
    label: 'Contact Unlinked from Lead',
    color: 'gray-600',
  },
  'contact.interacted': {
    feedType: 'NOTE',
    icon: 'message-circle',
    label: 'Contact Interaction',
    color: 'gray-600',
  },

  // ── Account Events (5) ───────────────────────────────────────────────
  'account.created': {
    feedType: 'STATUS_CHANGE',
    icon: 'building',
    label: 'Account Created',
    color: 'green-500',
  },
  'account.updated': {
    feedType: 'STATUS_CHANGE',
    icon: 'edit',
    label: 'Account Updated',
    color: 'blue-500',
  },
  'account.revenue_updated': {
    feedType: 'SCORE_UPDATE',
    icon: 'trending-up',
    label: 'Account Revenue Updated',
    color: 'purple-500',
  },
  'account.hierarchy_updated': {
    feedType: 'STATUS_CHANGE',
    icon: 'git-branch',
    label: 'Account Hierarchy Updated',
    color: 'blue-500',
  },
  'account.industry_categorized': {
    feedType: 'STATUS_CHANGE',
    icon: 'tag',
    label: 'Account Industry Categorized',
    color: 'blue-500',
  },

  // ── Opportunity Events (10) ──────────────────────────────────────────
  'opportunity.created': {
    feedType: 'DEAL',
    icon: 'dollar-sign',
    label: 'Opportunity Created',
    color: 'emerald-500',
  },
  'opportunity.stage_changed': {
    feedType: 'STAGE_CHANGE',
    icon: 'git-branch',
    label: 'Opportunity Stage Changed',
    color: 'cyan-500',
  },
  'opportunity.value_updated': {
    feedType: 'SCORE_UPDATE',
    icon: 'trending-up',
    label: 'Opportunity Value Updated',
    color: 'purple-500',
  },
  'opportunity.won': {
    feedType: 'DEAL',
    icon: 'check-circle',
    label: 'Opportunity Won',
    color: 'emerald-500',
  },
  'opportunity.lost': {
    feedType: 'DEAL',
    icon: 'x-circle',
    label: 'Opportunity Lost',
    color: 'red-500',
  },
  'opportunity.probability_updated': {
    feedType: 'SCORE_UPDATE',
    icon: 'percent',
    label: 'Opportunity Probability Updated',
    color: 'purple-500',
  },
  'opportunity.close_date_changed': {
    feedType: 'DEAL',
    icon: 'calendar',
    label: 'Opportunity Close Date Changed',
    color: 'emerald-500',
  },
  'opportunity.reopened': {
    feedType: 'DEAL',
    icon: 'rotate-ccw',
    label: 'Opportunity Reopened',
    color: 'emerald-500',
  },
  'opportunity.deal_won_enriched': {
    feedType: 'DEAL',
    icon: 'star',
    label: 'Deal Won Enriched',
    color: 'emerald-500',
  },
  'opportunity.deal_lost_enriched': {
    feedType: 'DEAL',
    icon: 'file-text',
    label: 'Deal Lost Enriched',
    color: 'red-500',
  },

  // ── Task Events (9) ──────────────────────────────────────────────────
  'task.created': {
    feedType: 'TASK',
    icon: 'plus-square',
    label: 'Task Created',
    color: 'orange-500',
  },
  'task.status_changed': {
    feedType: 'TASK',
    icon: 'refresh-cw',
    label: 'Task Status Changed',
    color: 'orange-500',
  },
  'task.completed': {
    feedType: 'TASK',
    icon: 'check-square',
    label: 'Task Completed',
    color: 'green-500',
  },
  'task.cancelled': {
    feedType: 'TASK',
    icon: 'x-square',
    label: 'Task Cancelled',
    color: 'red-500',
  },
  'task.priority_changed': {
    feedType: 'TASK',
    icon: 'alert-circle',
    label: 'Task Priority Changed',
    color: 'orange-500',
  },
  'task.due_date_changed': {
    feedType: 'TASK',
    icon: 'calendar',
    label: 'Task Due Date Changed',
    color: 'orange-500',
  },
  'task.updated': { feedType: 'TASK', icon: 'edit', label: 'Task Updated', color: 'orange-500' },
  'task.deleted': { feedType: 'TASK', icon: 'trash-2', label: 'Task Deleted', color: 'red-500' },
  'task.assigned': {
    feedType: 'ASSIGNMENT',
    icon: 'user-check',
    label: 'Task Assigned',
    color: 'indigo-500',
  },

  // ── Ticket Events (14) ───────────────────────────────────────────────
  'ticket.created': { feedType: 'TICKET', icon: 'tag', label: 'Ticket Created', color: 'rose-500' },
  'ticket.status_changed': {
    feedType: 'STATUS_CHANGE',
    icon: 'refresh-cw',
    label: 'Ticket Status Changed',
    color: 'blue-500',
  },
  'ticket.priority_changed': {
    feedType: 'STATUS_CHANGE',
    icon: 'alert-circle',
    label: 'Ticket Priority Changed',
    color: 'blue-500',
  },
  'ticket.assigned': {
    feedType: 'ASSIGNMENT',
    icon: 'user-check',
    label: 'Ticket Assigned',
    color: 'indigo-500',
  },
  'ticket.unassigned': {
    feedType: 'ASSIGNMENT',
    icon: 'user-minus',
    label: 'Ticket Unassigned',
    color: 'indigo-500',
  },
  'ticket.resolved': {
    feedType: 'STATUS_CHANGE',
    icon: 'check-circle',
    label: 'Ticket Resolved',
    color: 'green-500',
  },
  'ticket.closed': {
    feedType: 'STATUS_CHANGE',
    icon: 'lock',
    label: 'Ticket Closed',
    color: 'gray-500',
  },
  'ticket.reopened': {
    feedType: 'STATUS_CHANGE',
    icon: 'rotate-ccw',
    label: 'Ticket Reopened',
    color: 'blue-500',
  },
  'ticket.response_sla_breached': {
    feedType: 'SLA_ALERT',
    icon: 'alert-triangle',
    label: 'Response SLA Breached',
    color: 'red-500',
  },
  'ticket.resolution_sla_breached': {
    feedType: 'SLA_ALERT',
    icon: 'alert-triangle',
    label: 'Resolution SLA Breached',
    color: 'red-500',
  },
  'ticket.sla_paused': {
    feedType: 'SLA_ALERT',
    icon: 'pause-circle',
    label: 'Ticket SLA Paused',
    color: 'yellow-500',
  },
  'ticket.sla_resumed': {
    feedType: 'SLA_ALERT',
    icon: 'play-circle',
    label: 'Ticket SLA Resumed',
    color: 'yellow-500',
  },
  'ticket.routed': {
    feedType: 'ASSIGNMENT',
    icon: 'send',
    label: 'Ticket Routed',
    color: 'indigo-500',
  },
  'ticket.routing_failed': {
    feedType: 'ASSIGNMENT',
    icon: 'alert-octagon',
    label: 'Ticket Routing Failed',
    color: 'red-500',
  },

  // ── Case Events from CaseEvents.ts (8) ───────────────────────────────
  'case.created': {
    feedType: 'STATUS_CHANGE',
    icon: 'briefcase',
    label: 'Case Created',
    color: 'green-500',
  },
  'case.status_changed': {
    feedType: 'STATUS_CHANGE',
    icon: 'refresh-cw',
    label: 'Case Status Changed',
    color: 'blue-500',
  },
  'case.deadline_updated': {
    feedType: 'STATUS_CHANGE',
    icon: 'clock',
    label: 'Case Deadline Updated',
    color: 'blue-500',
  },
  'case.task_added': {
    feedType: 'TASK',
    icon: 'plus-square',
    label: 'Case Task Added',
    color: 'orange-500',
  },
  'case.task_removed': {
    feedType: 'TASK',
    icon: 'minus-square',
    label: 'Case Task Removed',
    color: 'orange-500',
  },
  'case.task_completed': {
    feedType: 'TASK',
    icon: 'check-square',
    label: 'Case Task Completed',
    color: 'green-500',
  },
  'case.priority_changed': {
    feedType: 'STATUS_CHANGE',
    icon: 'alert-circle',
    label: 'Case Priority Changed',
    color: 'blue-500',
  },
  'case.closed': {
    feedType: 'STATUS_CHANGE',
    icon: 'lock',
    label: 'Case Closed',
    color: 'gray-500',
  },

  // ── Case Events from case-events.ts (13) ─────────────────────────────
  'case.workflow_started': {
    feedType: 'STATUS_CHANGE',
    icon: 'play',
    label: 'Case Workflow Started',
    color: 'blue-500',
  },
  'case.workflow_completed': {
    feedType: 'STATUS_CHANGE',
    icon: 'check-circle',
    label: 'Case Workflow Completed',
    color: 'green-500',
  },
  'case.workflow_failed': {
    feedType: 'STATUS_CHANGE',
    icon: 'x-circle',
    label: 'Case Workflow Failed',
    color: 'red-500',
  },
  'case.approval_required': {
    feedType: 'STATUS_CHANGE',
    icon: 'shield',
    label: 'Case Approval Required',
    color: 'amber-500',
  },
  'case.approval_received': {
    feedType: 'STATUS_CHANGE',
    icon: 'shield-check',
    label: 'Case Approval Received',
    color: 'green-500',
  },
  'case.escalated': {
    feedType: 'STATUS_CHANGE',
    icon: 'arrow-up-circle',
    label: 'Case Escalated',
    color: 'red-500',
  },
  'case.sla_breached': {
    feedType: 'SLA_ALERT',
    icon: 'alert-triangle',
    label: 'Case SLA Breached',
    color: 'red-500',
  },
  'case.assigned': {
    feedType: 'ASSIGNMENT',
    icon: 'user-check',
    label: 'Case Assigned',
    color: 'indigo-500',
  },
  'case.note_added': {
    feedType: 'NOTE',
    icon: 'file-text',
    label: 'Case Note Added',
    color: 'gray-600',
  },
  'case.document_attached': {
    feedType: 'DOCUMENT',
    icon: 'paperclip',
    label: 'Case Document Attached',
    color: 'slate-500',
  },
  'case.reopened': {
    feedType: 'STATUS_CHANGE',
    icon: 'rotate-ccw',
    label: 'Case Reopened',
    color: 'blue-500',
  },
  'case.timer_started': {
    feedType: 'STATUS_CHANGE',
    icon: 'timer',
    label: 'Case Timer Started',
    color: 'blue-500',
  },
  'case.timer_paused': {
    feedType: 'STATUS_CHANGE',
    icon: 'pause',
    label: 'Case Timer Paused',
    color: 'blue-500',
  },

  // ── Appointment Events (11) ──────────────────────────────────────────
  'appointment.created': {
    feedType: 'MEETING',
    icon: 'calendar-plus',
    label: 'Appointment Created',
    color: 'teal-500',
  },
  'appointment.rescheduled': {
    feedType: 'MEETING',
    icon: 'calendar',
    label: 'Appointment Rescheduled',
    color: 'teal-500',
  },
  'appointment.confirmed': {
    feedType: 'MEETING',
    icon: 'calendar-check',
    label: 'Appointment Confirmed',
    color: 'teal-500',
  },
  'appointment.cancelled': {
    feedType: 'MEETING',
    icon: 'calendar-x',
    label: 'Appointment Cancelled',
    color: 'red-500',
  },
  'appointment.completed': {
    feedType: 'MEETING',
    icon: 'check-circle',
    label: 'Appointment Completed',
    color: 'green-500',
  },
  'appointment.no_show': {
    feedType: 'MEETING',
    icon: 'user-x',
    label: 'Appointment No Show',
    color: 'red-500',
  },
  'appointment.linked_to_case': {
    feedType: 'MEETING',
    icon: 'link',
    label: 'Appointment Linked to Case',
    color: 'teal-500',
  },
  'appointment.unlinked_from_case': {
    feedType: 'MEETING',
    icon: 'unlink',
    label: 'Appointment Unlinked from Case',
    color: 'teal-500',
  },
  'appointment.attendee_added': {
    feedType: 'MEETING',
    icon: 'user-plus',
    label: 'Appointment Attendee Added',
    color: 'teal-500',
  },
  'appointment.attendee_removed': {
    feedType: 'MEETING',
    icon: 'user-minus',
    label: 'Appointment Attendee Removed',
    color: 'teal-500',
  },
  'appointment.conflict_detected': {
    feedType: 'MEETING',
    icon: 'alert-triangle',
    label: 'Appointment Conflict Detected',
    color: 'yellow-500',
  },

  // ── Deadline Events (9) ──────────────────────────────────────────────
  'deadline.created': {
    feedType: 'TASK',
    icon: 'clock',
    label: 'Deadline Created',
    color: 'orange-500',
  },
  'deadline.status_changed': {
    feedType: 'TASK',
    icon: 'refresh-cw',
    label: 'Deadline Status Changed',
    color: 'orange-500',
  },
  'deadline.approaching': {
    feedType: 'TASK',
    icon: 'alert-circle',
    label: 'Deadline Approaching',
    color: 'yellow-500',
  },
  'deadline.due_today': {
    feedType: 'TASK',
    icon: 'bell',
    label: 'Deadline Due Today',
    color: 'orange-500',
  },
  'deadline.overdue': {
    feedType: 'TASK',
    icon: 'alert-triangle',
    label: 'Deadline Overdue',
    color: 'red-500',
  },
  'deadline.completed': {
    feedType: 'TASK',
    icon: 'check-circle',
    label: 'Deadline Completed',
    color: 'green-500',
  },
  'deadline.waived': {
    feedType: 'TASK',
    icon: 'minus-circle',
    label: 'Deadline Waived',
    color: 'gray-500',
  },
  'deadline.extended': {
    feedType: 'TASK',
    icon: 'arrow-right',
    label: 'Deadline Extended',
    color: 'blue-500',
  },
  'deadline.reminder_sent': {
    feedType: 'TASK',
    icon: 'bell',
    label: 'Deadline Reminder Sent',
    color: 'yellow-500',
  },

  // ── Billing Events (8) ───────────────────────────────────────────────
  'invoice.created': {
    feedType: 'DEAL',
    icon: 'file-text',
    label: 'Invoice Created',
    color: 'emerald-500',
  },
  'invoice.issued': {
    feedType: 'DEAL',
    icon: 'send',
    label: 'Invoice Issued',
    color: 'emerald-500',
  },
  'invoice.payment_recorded': {
    feedType: 'DEAL',
    icon: 'credit-card',
    label: 'Payment Recorded',
    color: 'emerald-500',
  },
  'invoice.paid': {
    feedType: 'DEAL',
    icon: 'check-circle',
    label: 'Invoice Paid',
    color: 'green-500',
  },
  'invoice.voided': {
    feedType: 'DEAL',
    icon: 'x-circle',
    label: 'Invoice Voided',
    color: 'red-500',
  },
  'invoice.refunded': {
    feedType: 'DEAL',
    icon: 'rotate-ccw',
    label: 'Invoice Refunded',
    color: 'yellow-500',
  },
  'invoice.uncollectible': {
    feedType: 'DEAL',
    icon: 'alert-octagon',
    label: 'Invoice Uncollectible',
    color: 'red-500',
  },
  'receipt.issued': {
    feedType: 'DEAL',
    icon: 'file-text',
    label: 'Receipt Issued',
    color: 'emerald-500',
  },

  // ── Document Events (2) ──────────────────────────────────────────────
  'document.ingestion.created': {
    feedType: 'DOCUMENT',
    icon: 'upload',
    label: 'Document Ingestion Started',
    color: 'slate-500',
  },
  'document.ingestion_failed': {
    feedType: 'DOCUMENT',
    icon: 'alert-triangle',
    label: 'Document Ingestion Failed',
    color: 'red-500',
  },

  // ── AI Feedback Events (4) ───────────────────────────────────────────
  'ai.score_feedback.submitted': {
    feedType: 'AGENT_ACTION',
    icon: 'cpu',
    label: 'AI Score Feedback Submitted',
    color: 'violet-500',
  },
  'ai.model.retraining_recommended': {
    feedType: 'AGENT_ACTION',
    icon: 'cpu',
    label: 'AI Retraining Recommended',
    color: 'violet-500',
  },
  'ai.training_data.exported': {
    feedType: 'AGENT_ACTION',
    icon: 'download',
    label: 'AI Training Data Exported',
    color: 'violet-500',
  },
  'ai.feedback_analytics.generated': {
    feedType: 'AGENT_ACTION',
    icon: 'bar-chart-2',
    label: 'AI Feedback Analytics Generated',
    color: 'violet-500',
  },

  // ── Chain Version Events (4) ─────────────────────────────────────────
  'chain_version.created': {
    feedType: 'AGENT_ACTION',
    icon: 'git-commit',
    label: 'Chain Version Created',
    color: 'violet-500',
  },
  'chain_version.activated': {
    feedType: 'AGENT_ACTION',
    icon: 'zap',
    label: 'Chain Version Activated',
    color: 'violet-500',
  },
  'chain_version.deprecated': {
    feedType: 'AGENT_ACTION',
    icon: 'archive',
    label: 'Chain Version Deprecated',
    color: 'yellow-500',
  },
  'chain_version.rolled_back': {
    feedType: 'AGENT_ACTION',
    icon: 'rotate-ccw',
    label: 'Chain Version Rolled Back',
    color: 'yellow-500',
  },

  // ── AI Review Events (4 — SCREAMING_CASE) ────────────────────────────
  REVIEW_REQUESTED: {
    feedType: 'AGENT_ACTION',
    icon: 'eye',
    label: 'Review Requested',
    color: 'violet-500',
  },
  REVIEW_APPROVED: {
    feedType: 'AGENT_ACTION',
    icon: 'check-circle',
    label: 'Review Approved',
    color: 'green-500',
  },
  REVIEW_REJECTED: {
    feedType: 'AGENT_ACTION',
    icon: 'x-circle',
    label: 'Review Rejected',
    color: 'red-500',
  },
  REVIEW_ESCALATED: {
    feedType: 'AGENT_ACTION',
    icon: 'arrow-up-circle',
    label: 'Review Escalated',
    color: 'red-500',
  },

  // ── Auto-Response Events (10 — PascalCase) ───────────────────────────
  AutoResponseGenerated: {
    feedType: 'AGENT_ACTION',
    icon: 'cpu',
    label: 'Auto-Response Generated',
    color: 'violet-500',
  },
  AutoResponseSubmittedForApproval: {
    feedType: 'AGENT_ACTION',
    icon: 'send',
    label: 'Auto-Response Submitted for Approval',
    color: 'violet-500',
  },
  AutoResponseApproved: {
    feedType: 'AGENT_ACTION',
    icon: 'check-circle',
    label: 'Auto-Response Approved',
    color: 'green-500',
  },
  AutoResponseRejected: {
    feedType: 'AGENT_ACTION',
    icon: 'x-circle',
    label: 'Auto-Response Rejected',
    color: 'red-500',
  },
  AutoResponseSent: {
    feedType: 'AGENT_ACTION',
    icon: 'mail',
    label: 'Auto-Response Sent',
    color: 'violet-500',
  },
  AutoResponseExpired: {
    feedType: 'AGENT_ACTION',
    icon: 'clock',
    label: 'Auto-Response Expired',
    color: 'yellow-500',
  },
  AutoResponseEscalated: {
    feedType: 'AGENT_ACTION',
    icon: 'arrow-up-circle',
    label: 'Auto-Response Escalated',
    color: 'red-500',
  },
  AutoResponseInvalidated: {
    feedType: 'AGENT_ACTION',
    icon: 'slash',
    label: 'Auto-Response Invalidated',
    color: 'gray-500',
  },
  AutoResponseSendFailed: {
    feedType: 'AGENT_ACTION',
    icon: 'alert-triangle',
    label: 'Auto-Response Send Failed',
    color: 'red-500',
  },
  AutoResponseEscalationResolved: {
    feedType: 'AGENT_ACTION',
    icon: 'check-circle',
    label: 'Auto-Response Escalation Resolved',
    color: 'green-500',
  },

  // ── Notification Events (8 — PascalCase) ─────────────────────────────
  NotificationCreated: {
    feedType: 'SYSTEM',
    icon: 'bell',
    label: 'Notification Created',
    color: 'gray-500',
  },
  NotificationSent: {
    feedType: 'SYSTEM',
    icon: 'send',
    label: 'Notification Sent',
    color: 'gray-500',
  },
  NotificationDelivered: {
    feedType: 'SYSTEM',
    icon: 'check',
    label: 'Notification Delivered',
    color: 'gray-500',
  },
  NotificationFailed: {
    feedType: 'SYSTEM',
    icon: 'alert-triangle',
    label: 'Notification Failed',
    color: 'red-500',
  },
  NotificationRead: {
    feedType: 'SYSTEM',
    icon: 'eye',
    label: 'Notification Read',
    color: 'gray-500',
  },
  NotificationPreferenceUpdated: {
    feedType: 'SYSTEM',
    icon: 'settings',
    label: 'Notification Preference Updated',
    color: 'gray-500',
  },
  NotificationScheduled: {
    feedType: 'SYSTEM',
    icon: 'clock',
    label: 'Notification Scheduled',
    color: 'gray-500',
  },
  NotificationMovedToDLQ: {
    feedType: 'SYSTEM',
    icon: 'alert-octagon',
    label: 'Notification Moved to DLQ',
    color: 'red-500',
  },

  // ── Intelligence Events (1 — SCREAMING_CASE) ────────────────────────
  CHURN_RISK_ASSESSED: {
    feedType: 'AGENT_ACTION',
    icon: 'trending-down',
    label: 'Churn Risk Assessed',
    color: 'violet-500',
  },

  // ── Survey Events (4) ────────────────────────────────────────────────
  'crm.survey.sent': {
    feedType: 'NOTE',
    icon: 'clipboard',
    label: 'Survey Sent',
    color: 'gray-600',
  },
  'crm.survey.responded': {
    feedType: 'NOTE',
    icon: 'message-square',
    label: 'Survey Responded',
    color: 'gray-600',
  },
  'crm.survey.followed_up': {
    feedType: 'NOTE',
    icon: 'reply',
    label: 'Survey Followed Up',
    color: 'gray-600',
  },
  'crm.survey.closed': {
    feedType: 'NOTE',
    icon: 'check-square',
    label: 'Survey Closed',
    color: 'gray-600',
  },

  // ── Security/Auth Events (7 — mixed case) ────────────────────────────
  UserLogout: { feedType: 'SYSTEM', icon: 'log-out', label: 'User Logged Out', color: 'gray-500' },
  SessionRevoked: {
    feedType: 'SYSTEM',
    icon: 'shield-off',
    label: 'Session Revoked',
    color: 'red-500',
  },
  MfaEnabled: { feedType: 'SYSTEM', icon: 'shield', label: 'MFA Enabled', color: 'green-500' },
  MfaDisabled: {
    feedType: 'SYSTEM',
    icon: 'shield-off',
    label: 'MFA Disabled',
    color: 'yellow-500',
  },
  BackupCodesGenerated: {
    feedType: 'SYSTEM',
    icon: 'key',
    label: 'Backup Codes Generated',
    color: 'gray-500',
  },
  LOGIN_SUCCESS: { feedType: 'SYSTEM', icon: 'log-in', label: 'Login Success', color: 'green-500' },
  LOGIN_FAILURE: {
    feedType: 'SYSTEM',
    icon: 'alert-circle',
    label: 'Login Failure',
    color: 'red-500',
  },
};

/**
 * Resolve an AuditLogEntry eventType to its ActivityTypeMetadata.
 * Performs exact match first, then case-insensitive fallback for mixed naming conventions.
 * Returns DEFAULT_METADATA for unmapped event types.
 */
export function resolveActivityType(eventType: string): ActivityTypeMetadata {
  return (
    ACTIVITY_TYPE_REGISTRY[eventType] ??
    ACTIVITY_TYPE_REGISTRY[eventType.toLowerCase()] ??
    DEFAULT_METADATA
  );
}

/** All registered event type strings for enumeration and completeness testing */
export const KNOWN_EVENT_TYPES = Object.keys(ACTIVITY_TYPE_REGISTRY) as readonly string[];
