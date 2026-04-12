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
export const TIMELINE_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

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
export const COMMUNICATION_DIRECTIONS = ['inbound', 'outbound'] as const;

export type CommunicationDirection = (typeof COMMUNICATION_DIRECTIONS)[number];
