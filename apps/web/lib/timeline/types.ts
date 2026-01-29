/**
 * Timeline Event Types
 *
 * Type definitions for the unified timeline system.
 * These types mirror the API response types and provide type-safety
 * for timeline components throughout the frontend.
 *
 * Task: IFC-159 - Timeline Enrichment with Documents, Communications, Agent Actions
 */

// =============================================================================
// Timeline Event Types
// =============================================================================

/**
 * All possible timeline event types
 */
export const TimelineEventType = {
  TASK: 'task',
  TASK_COMPLETED: 'task_completed',
  TASK_OVERDUE: 'task_overdue',
  APPOINTMENT: 'appointment',
  DEADLINE: 'deadline',
  STATUS_CHANGE: 'status_change',
  NOTE: 'note',
  DOCUMENT: 'document',
  DOCUMENT_VERSION: 'document_version',
  COMMUNICATION: 'communication',
  EMAIL: 'email',
  CALL: 'call',
  AGENT_ACTION: 'agent_action',
  REMINDER: 'reminder',
  AUDIT: 'audit',
  STAGE_CHANGE: 'stage_change',
} as const;

export type TimelineEventType = (typeof TimelineEventType)[keyof typeof TimelineEventType];

/**
 * Agent action status values
 */
export const AgentActionStatus = {
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ROLLED_BACK: 'rolled_back',
  EXPIRED: 'expired',
} as const;

export type AgentActionStatus = (typeof AgentActionStatus)[keyof typeof AgentActionStatus];

/**
 * Priority levels for timeline events
 */
export const TimelinePriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type TimelinePriority = (typeof TimelinePriority)[keyof typeof TimelinePriority];

/**
 * Communication channels
 */
export const CommunicationChannel = {
  EMAIL: 'email',
  PHONE: 'phone',
  WHATSAPP: 'whatsapp',
  SMS: 'sms',
  OTHER: 'other',
} as const;

export type CommunicationChannel = (typeof CommunicationChannel)[keyof typeof CommunicationChannel];

/**
 * Communication direction
 */
export const CommunicationDirection = {
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
} as const;

export type CommunicationDirection = (typeof CommunicationDirection)[keyof typeof CommunicationDirection];

// =============================================================================
// Timeline Event Interfaces
// =============================================================================

/**
 * Actor who performed an action (user or AI agent)
 */
export interface TimelineActor {
  id: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  isAgent?: boolean;
}

/**
 * Agent action details for AI-initiated actions
 */
export interface AgentActionDetails {
  actionId: string;
  agentName: string;
  proposedChanges: unknown;
  confidence: number;
  status: AgentActionStatus;
  expiresAt?: Date | null;
}

/**
 * Document attachment details
 */
export interface DocumentDetails {
  documentId: string;
  filename: string;
  version?: number;
  mimeType?: string;
}

/**
 * Communication (email, call, etc.) details
 */
export interface CommunicationDetails {
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  from?: string;
  to?: string;
  subject?: string;
}

/**
 * Appointment details
 */
export interface AppointmentDetails {
  appointmentId: string;
  appointmentType: string;
  startTime: Date;
  endTime: Date;
  location?: string | null;
  status: string;
}

/**
 * Task details
 */
export interface TaskDetails {
  taskId: string;
  status: string;
  dueDate?: Date | null;
  completedAt?: Date | null;
}

/**
 * Unified timeline event
 *
 * Represents any event that can appear in the timeline,
 * with type-specific details in optional fields.
 */
export interface TimelineEvent {
  /** Unique event identifier (prefixed with type, e.g., "task-123") */
  id: string;

  /** Event type for routing to appropriate renderer */
  type: TimelineEventType;

  /** Event title/summary */
  title: string;

  /** Optional detailed description */
  description?: string | null;

  /** When the event occurred/is scheduled */
  timestamp: Date;

  /** Event priority (for tasks and deadlines) */
  priority?: TimelinePriority | null;

  /** Type of entity this event relates to */
  entityType?: string | null;

  /** ID of the related entity */
  entityId?: string | null;

  /** Agent action details (when type is 'agent_action') */
  agentAction?: AgentActionDetails | null;

  /** Document details (when type is 'document' or 'document_version') */
  document?: DocumentDetails | null;

  /** Communication details (when type is 'communication', 'email', or 'call') */
  communication?: CommunicationDetails | null;

  /** Appointment details (when type is 'appointment') */
  appointment?: AppointmentDetails | null;

  /** Task details (when type is 'task', 'task_completed', or 'task_overdue') */
  task?: TaskDetails | null;

  /** Actor who performed the action */
  actor?: TimelineActor | null;

  /** Additional metadata */
  metadata?: Record<string, unknown> | null;

  /** Whether the event is overdue */
  isOverdue?: boolean;
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Response from timeline.getEvents
 */
export interface TimelineEventsResponse {
  events: TimelineEvent[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  queryDurationMs: number;
}

/**
 * Response from timeline.getStats
 */
export interface TimelineStatsResponse {
  tasks: {
    total: number;
    completed: number;
    overdue: number;
    pending: number;
  };
  appointments: {
    upcoming: number;
  };
  agentActions: {
    pendingApproval: number;
  };
  queryDurationMs: number;
}

/**
 * Deadline item from timeline.getUpcomingDeadlines
 */
export interface DeadlineItem {
  id: string;
  type: 'task' | 'appointment';
  title: string;
  dueDate: Date;
  priority: TimelinePriority | null;
  isOverdue: boolean;
}

/**
 * Response from timeline.getUpcomingDeadlines
 */
export interface UpcomingDeadlinesResponse {
  deadlines: DeadlineItem[];
  total: number;
  queryDurationMs: number;
}

/**
 * Pending agent action from timeline.getPendingAgentActions
 */
export interface PendingAgentAction {
  id: string;
  actionId: string;
  agentName: string;
  actionType: string;
  title: string;
  description: string | null;
  proposedChanges: unknown;
  confidence: number;
  createdAt: Date;
  expiresAt: Date | null;
  entityType: string;
  entityId: string;
}

/**
 * Response from timeline.getPendingAgentActions
 */
export interface PendingAgentActionsResponse {
  actions: PendingAgentAction[];
  total: number;
  queryDurationMs: number;
}

// =============================================================================
// Query Parameters
// =============================================================================

/**
 * Query parameters for fetching timeline events
 */
export interface TimelineQueryParams {
  dealId?: string;
  caseId?: string;
  opportunityId?: string;
  contactId?: string;
  accountId?: string;
  eventTypes?: TimelineEventType[];
  excludeTypes?: TimelineEventType[];
  priorities?: TimelinePriority[];
  agentActionStatus?: AgentActionStatus[];
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  limit?: number;
  sortOrder?: 'asc' | 'desc';
  includeCompleted?: boolean;
  search?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get display label for event type
 */
export function getEventTypeLabel(type: TimelineEventType): string {
  const labels: Record<TimelineEventType, string> = {
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
    agent_action: 'Agent Action',
    reminder: 'Reminder',
    audit: 'Audit',
    stage_change: 'Stage Change',
  };
  return labels[type] || type;
}

/**
 * Get icon name for event type (for use with Material Symbols)
 */
export function getEventTypeIcon(type: TimelineEventType): string {
  const icons: Record<TimelineEventType, string> = {
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
    agent_action: 'Bot',
    reminder: 'Bell',
    audit: 'History',
    stage_change: 'ArrowRight',
  };
  return icons[type] || 'Circle';
}

/**
 * Get color class for priority
 */
export function getPriorityColor(priority: TimelinePriority | null | undefined): string {
  if (!priority) return 'text-muted-foreground';

  const colors: Record<TimelinePriority, string> = {
    low: 'text-green-600',
    medium: 'text-yellow-600',
    high: 'text-orange-600',
    urgent: 'text-red-600',
  };
  return colors[priority];
}

/**
 * Get background color class for priority
 */
export function getPriorityBgColor(priority: TimelinePriority | null | undefined): string {
  if (!priority) return 'bg-muted';

  const colors: Record<TimelinePriority, string> = {
    low: 'bg-green-100',
    medium: 'bg-yellow-100',
    high: 'bg-orange-100',
    urgent: 'bg-red-100',
  };
  return colors[priority];
}

/**
 * Get color class for agent action status
 */
export function getAgentActionStatusColor(status: AgentActionStatus): string {
  const colors: Record<AgentActionStatus, string> = {
    pending_approval: 'text-yellow-600',
    approved: 'text-green-600',
    rejected: 'text-red-600',
    rolled_back: 'text-orange-600',
    expired: 'text-muted-foreground',
  };
  return colors[status];
}

/**
 * Get label for agent action status
 */
export function getAgentActionStatusLabel(status: AgentActionStatus): string {
  const labels: Record<AgentActionStatus, string> = {
    pending_approval: 'Pending Approval',
    approved: 'Approved',
    rejected: 'Rejected',
    rolled_back: 'Rolled Back',
    expired: 'Expired',
  };
  return labels[status];
}

/**
 * Check if an event is an agent action requiring approval
 */
export function isAgentActionPendingApproval(event: TimelineEvent): boolean {
  return (
    event.type === 'agent_action' &&
    event.agentAction?.status === 'pending_approval'
  );
}

/**
 * Group timeline events by date
 */
export function groupEventsByDate(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const groups = new Map<string, TimelineEvent[]>();

  for (const event of events) {
    const dateKey = event.timestamp.toISOString().split('T')[0];
    const existing = groups.get(dateKey) || [];
    existing.push(event);
    groups.set(dateKey, existing);
  }

  return groups;
}

/**
 * Get relative date label (Today, Yesterday, or formatted date)
 */
export function getRelativeDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const eventDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (eventDate.getTime() === today.getTime()) {
    return 'Today';
  }
  if (eventDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
