/**
 * Timeline Event Model for Case Timeline Enrichment (IFC-159)
 *
 * Unified timeline event types and interfaces for aggregating
 * documents, communications, and agent actions into a single timeline.
 */

// Event type constants
export const TIMELINE_EVENT_TYPES = [
  'task',
  'task_completed',
  'task_overdue',
  'document',
  'document_version',
  'email',
  'call',
  'chat',
  'whatsapp',
  'agent_action',
  'approval',
  'status_change',
  'note',
  'deadline',
  'assignment',
  'escalation',
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

// Priority levels
export const TIMELINE_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TimelinePriority = (typeof TIMELINE_PRIORITIES)[number];

// Communication channels
export const COMMUNICATION_CHANNELS = [
  'email',
  'whatsapp',
  'teams',
  'slack',
  'phone',
  'webchat',
  'internal',
] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

// Agent action statuses
export const AGENT_ACTION_STATUSES = [
  'pending_approval',
  'approved',
  'rejected',
  'rolled_back',
  'expired',
] as const;
export type AgentActionStatus = (typeof AGENT_ACTION_STATUSES)[number];

// Document statuses
export const DOCUMENT_STATUSES = [
  'draft',
  'under_review',
  'approved',
  'signed',
  'archived',
  'superseded',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/**
 * Actor who performed the action
 */
export interface ActorData {
  id: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  isAgent?: boolean; // true if AI agent
}

/**
 * Document-specific event data
 */
export interface DocumentEventData {
  documentId: string;
  filename: string;
  version: string; // Semantic version e.g., "1.2.0"
  versionMajor?: number;
  versionMinor?: number;
  versionPatch?: number;
  mimeType?: string;
  sizeBytes?: number;
  status?: DocumentStatus;
  classification?: string;
  signedBy?: string;
  signedAt?: Date;
  previousVersionId?: string;
  changeDescription?: string;
}

/**
 * Communication-specific event data (email, chat, call)
 */
export interface CommunicationEventData {
  channel: CommunicationChannel;
  direction?: 'inbound' | 'outbound';

  // Email-specific
  subject?: string;
  fromEmail?: string;
  toEmail?: string;
  ccEmails?: string[];
  hasAttachments?: boolean;
  attachmentCount?: number;
  emailStatus?: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';

  // Call-specific
  duration?: number; // seconds
  outcome?: 'connected' | 'voicemail' | 'no_answer' | 'busy' | 'failed';
  hasRecording?: boolean;
  sentiment?: 'positive' | 'neutral' | 'negative';
  summary?: string;

  // Chat-specific
  messagePreview?: string;
  isRead?: boolean;
  senderType?: 'user' | 'contact' | 'bot' | 'system';

  // Contact info
  contactId?: string;
  contactName?: string;
}

/**
 * Agent action-specific event data
 */
export interface AgentActionEventData {
  actionId: string;
  agentName: string;
  actionType: string;
  description?: string;
  aiReasoning?: string;
  confidence: number; // 0-100
  status: AgentActionStatus;
  proposedChanges?: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  expiresAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  feedback?: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
}

/**
 * Task-specific event data
 */
export interface TaskEventData {
  taskId: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  dueDate?: Date;
  completedAt?: Date;
  assigneeId?: string;
  assigneeName?: string;
  isOverdue?: boolean;
}

/**
 * Appointment/meeting event data
 */
export interface AppointmentEventData {
  appointmentId: string;
  title: string;
  startTime: Date;
  endTime?: Date;
  location?: string;
  isVirtual?: boolean;
  meetingUrl?: string;
  attendees?: Array<{
    id: string;
    name: string;
    email?: string;
    status?: 'pending' | 'accepted' | 'declined' | 'tentative';
  }>;
}

/**
 * Unified timeline event
 */
export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  description?: string;
  timestamp: Date;
  priority?: TimelinePriority;

  // Entity reference
  entityType?: string;
  entityId?: string;

  // Type-specific nested data
  document?: DocumentEventData;
  communication?: CommunicationEventData;
  agentAction?: AgentActionEventData;
  task?: TaskEventData;
  appointment?: AppointmentEventData;

  // Actor who performed the action
  actor?: ActorData;

  // Additional metadata
  metadata?: Record<string, unknown>;

  // UI hints
  isHighlighted?: boolean;
  isCollapsible?: boolean;
  groupKey?: string; // For grouping related events
}

/**
 * Timeline filters
 */
export interface TimelineFilters {
  types?: TimelineEventType[];
  startDate?: Date;
  endDate?: Date;
  actorIds?: string[];
  includeAgentActions?: boolean;
  priority?: TimelinePriority[];
  search?: string;
  channels?: CommunicationChannel[];
}

/**
 * Timeline query options
 */
export interface TimelineQueryOptions {
  caseId: string;
  filters?: TimelineFilters;
  limit?: number;
  offset?: number;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Timeline response
 */
export interface TimelineResponse {
  events: TimelineEvent[];
  total: number;
  hasMore: boolean;
  stats?: TimelineStats;
}

/**
 * Timeline statistics
 */
export interface TimelineStats {
  totalEvents: number;
  byType: Record<TimelineEventType, number>;
  byChannel?: Record<CommunicationChannel, number>;
  pendingApprovals: number;
  overdueTasks: number;
  latestActivity?: Date;
}

/**
 * Date group for timeline rendering
 */
export interface TimelineDateGroup {
  date: Date;
  label: string; // "Today", "Yesterday", "Dec 31, 2025"
  events: TimelineEvent[];
}

/**
 * Helper to group events by date
 */
export function groupEventsByDate(events: TimelineEvent[]): TimelineDateGroup[] {
  const groups = new Map<string, TimelineEvent[]>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const event of events) {
    const eventDate = new Date(event.timestamp);
    eventDate.setHours(0, 0, 0, 0);
    const key = eventDate.toISOString().split('T')[0];

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(event);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // Descending
    .map(([dateStr, groupEvents]) => {
      const date = new Date(dateStr);
      let label: string;

      if (date.getTime() === today.getTime()) {
        label = 'Today';
      } else if (date.getTime() === yesterday.getTime()) {
        label = 'Yesterday';
      } else {
        label = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }

      return { date, label, events: groupEvents };
    });
}

/**
 * Get icon name for event type (Material Symbols)
 */
export function getEventTypeIcon(type: TimelineEventType): string {
  const icons: Record<TimelineEventType, string> = {
    task: 'task_alt',
    task_completed: 'check_circle',
    task_overdue: 'error',
    document: 'description',
    document_version: 'history',
    email: 'mail',
    call: 'call',
    chat: 'chat',
    whatsapp: 'chat',
    agent_action: 'smart_toy',
    approval: 'verified',
    status_change: 'swap_horiz',
    note: 'sticky_note_2',
    deadline: 'schedule',
    assignment: 'person_add',
    escalation: 'priority_high',
  };
  return icons[type] || 'event';
}

/**
 * Get color for event type (Tailwind class)
 */
export function getEventTypeColor(type: TimelineEventType): string {
  const colors: Record<TimelineEventType, string> = {
    task: 'text-blue-500',
    task_completed: 'text-green-500',
    task_overdue: 'text-red-500',
    document: 'text-purple-500',
    document_version: 'text-purple-400',
    email: 'text-sky-500',
    call: 'text-emerald-500',
    chat: 'text-teal-500',
    whatsapp: 'text-green-600',
    agent_action: 'text-indigo-500',
    approval: 'text-green-600',
    status_change: 'text-amber-500',
    note: 'text-yellow-500',
    deadline: 'text-orange-500',
    assignment: 'text-blue-400',
    escalation: 'text-red-600',
  };
  return colors[type] || 'text-slate-500';
}
