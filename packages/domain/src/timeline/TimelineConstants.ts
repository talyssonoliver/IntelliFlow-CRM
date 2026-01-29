/**
 * Timeline Constants - Single Source of Truth
 *
 * Canonical enum values for Timeline domain.
 * All other layers (validators, UI) derive their types from these constants.
 *
 * Task: IFC-159 - Timeline Enrichment with Documents, Communications, Agent Actions
 */

// =============================================================================
// Timeline Event Types
// =============================================================================

/**
 * All possible timeline event types
 */
export const TIMELINE_EVENT_TYPES = [
  'task',
  'task_completed',
  'task_overdue',
  'appointment',
  'deadline',
  'status_change',
  'note',
  'document',
  'document_version',
  'communication',
  'email',
  'call',
  'chat', // WhatsApp, SMS, live chat
  'agent_action',
  'reminder',
  'audit',
  'stage_change',
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

// =============================================================================
// Agent Action Statuses
// =============================================================================

/**
 * Agent action status values
 */
export const AGENT_ACTION_STATUSES = [
  'pending_approval',
  'approved',
  'rejected',
  'rolled_back',
  'expired',
] as const;

export type AgentActionStatus = (typeof AGENT_ACTION_STATUSES)[number];

// =============================================================================
// Timeline Priorities
// =============================================================================

/**
 * Priority levels for timeline events
 */
export const TIMELINE_PRIORITIES = [
  'low',
  'medium',
  'high',
  'urgent',
] as const;

export type TimelinePriority = (typeof TIMELINE_PRIORITIES)[number];

// =============================================================================
// Communication Channels
// =============================================================================

/**
 * Communication channels
 */
export const COMMUNICATION_CHANNELS = [
  'email',
  'phone',
  'whatsapp',
  'sms',
  'chat', // Live chat, web chat
  'other',
] as const;

export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

// =============================================================================
// Communication Directions
// =============================================================================

/**
 * Communication direction
 */
export const COMMUNICATION_DIRECTIONS = [
  'inbound',
  'outbound',
] as const;

export type CommunicationDirection = (typeof COMMUNICATION_DIRECTIONS)[number];

// =============================================================================
// Helper Maps for Display
// =============================================================================

/**
 * Display labels for event types
 */
export const TIMELINE_EVENT_TYPE_LABELS: Record<TimelineEventType, string> = {
  task: 'Task',
  task_completed: 'Task Completed',
  task_overdue: 'Task Overdue',
  appointment: 'Appointment',
  deadline: 'Deadline',
  status_change: 'Status Change',
  note: 'Note',
  document: 'Document',
  document_version: 'Document Version',
  communication: 'Communication',
  email: 'Email',
  call: 'Call',
  chat: 'Chat',
  agent_action: 'Agent Action',
  reminder: 'Reminder',
  audit: 'Audit',
  stage_change: 'Stage Change',
};

/**
 * Icon names for event types (for use with Material Symbols)
 */
export const TIMELINE_EVENT_TYPE_ICONS: Record<TimelineEventType, string> = {
  task: 'CheckSquare',
  task_completed: 'CheckCircle2',
  task_overdue: 'AlertCircle',
  appointment: 'Calendar',
  deadline: 'Clock',
  status_change: 'RefreshCw',
  note: 'StickyNote',
  document: 'FileText',
  document_version: 'FileDiff',
  communication: 'MessageSquare',
  email: 'Mail',
  call: 'Phone',
  chat: 'MessageCircle',
  agent_action: 'Bot',
  reminder: 'Bell',
  audit: 'History',
  stage_change: 'ArrowRight',
};

/**
 * Display labels for agent action statuses
 */
export const AGENT_ACTION_STATUS_LABELS: Record<AgentActionStatus, string> = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  rolled_back: 'Rolled Back',
  expired: 'Expired',
};
