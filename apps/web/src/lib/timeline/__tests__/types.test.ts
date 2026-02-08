/**
 * Tests for timeline/types.ts
 *
 * Tests the exported constants, helper functions, and type guards
 * from the timeline types module.
 */
import { describe, it, expect } from 'vitest';

import {
  // Constants
  TimelineEventType,
  AgentActionStatus,
  TimelinePriority,
  CommunicationChannel,
  CommunicationDirection,
  // Helper functions
  getEventTypeLabel,
  getEventTypeIcon,
  getPriorityColor,
  getPriorityBgColor,
  getAgentActionStatusColor,
  getAgentActionStatusLabel,
  isAgentActionPendingApproval,
  groupEventsByDate,
  getRelativeDateLabel,
  // Types
  type TimelineEvent,
  type TimelineActor,
  type AgentActionDetails,
  type DocumentDetails,
  type CommunicationDetails,
  type AppointmentDetails,
  type TaskDetails,
  type TimelineEventsResponse,
  type TimelineStatsResponse,
  type DeadlineItem,
  type UpcomingDeadlinesResponse,
  type PendingAgentAction,
  type PendingAgentActionsResponse,
  type TimelineQueryParams,
} from '../../../../lib/timeline/types';

// ============================================================================
// Constants
// ============================================================================
describe('TimelineEventType', () => {
  it('has all expected event types', () => {
    expect(TimelineEventType.TASK).toBe('task');
    expect(TimelineEventType.TASK_COMPLETED).toBe('task_completed');
    expect(TimelineEventType.TASK_OVERDUE).toBe('task_overdue');
    expect(TimelineEventType.APPOINTMENT).toBe('appointment');
    expect(TimelineEventType.DEADLINE).toBe('deadline');
    expect(TimelineEventType.STATUS_CHANGE).toBe('status_change');
    expect(TimelineEventType.NOTE).toBe('note');
    expect(TimelineEventType.DOCUMENT).toBe('document');
    expect(TimelineEventType.DOCUMENT_VERSION).toBe('document_version');
    expect(TimelineEventType.COMMUNICATION).toBe('communication');
    expect(TimelineEventType.EMAIL).toBe('email');
    expect(TimelineEventType.CALL).toBe('call');
    expect(TimelineEventType.AGENT_ACTION).toBe('agent_action');
    expect(TimelineEventType.REMINDER).toBe('reminder');
    expect(TimelineEventType.AUDIT).toBe('audit');
    expect(TimelineEventType.STAGE_CHANGE).toBe('stage_change');
  });

  it('has exactly 16 event types', () => {
    expect(Object.keys(TimelineEventType)).toHaveLength(16);
  });
});

describe('AgentActionStatus', () => {
  it('has all expected statuses', () => {
    expect(AgentActionStatus.PENDING_APPROVAL).toBe('pending_approval');
    expect(AgentActionStatus.APPROVED).toBe('approved');
    expect(AgentActionStatus.REJECTED).toBe('rejected');
    expect(AgentActionStatus.ROLLED_BACK).toBe('rolled_back');
    expect(AgentActionStatus.EXPIRED).toBe('expired');
  });

  it('has exactly 5 statuses', () => {
    expect(Object.keys(AgentActionStatus)).toHaveLength(5);
  });
});

describe('TimelinePriority', () => {
  it('has all expected priorities', () => {
    expect(TimelinePriority.LOW).toBe('low');
    expect(TimelinePriority.MEDIUM).toBe('medium');
    expect(TimelinePriority.HIGH).toBe('high');
    expect(TimelinePriority.URGENT).toBe('urgent');
  });

  it('has exactly 4 priorities', () => {
    expect(Object.keys(TimelinePriority)).toHaveLength(4);
  });
});

describe('CommunicationChannel', () => {
  it('has all expected channels', () => {
    expect(CommunicationChannel.EMAIL).toBe('email');
    expect(CommunicationChannel.PHONE).toBe('phone');
    expect(CommunicationChannel.WHATSAPP).toBe('whatsapp');
    expect(CommunicationChannel.SMS).toBe('sms');
    expect(CommunicationChannel.OTHER).toBe('other');
  });

  it('has exactly 5 channels', () => {
    expect(Object.keys(CommunicationChannel)).toHaveLength(5);
  });
});

describe('CommunicationDirection', () => {
  it('has all expected directions', () => {
    expect(CommunicationDirection.INBOUND).toBe('inbound');
    expect(CommunicationDirection.OUTBOUND).toBe('outbound');
  });

  it('has exactly 2 directions', () => {
    expect(Object.keys(CommunicationDirection)).toHaveLength(2);
  });
});

// ============================================================================
// getEventTypeLabel
// ============================================================================
describe('getEventTypeLabel', () => {
  it('returns correct label for task', () => {
    expect(getEventTypeLabel('task')).toBe('Task');
  });

  it('returns correct label for task_completed', () => {
    expect(getEventTypeLabel('task_completed')).toBe('Task Completed');
  });

  it('returns correct label for task_overdue', () => {
    expect(getEventTypeLabel('task_overdue')).toBe('Task Overdue');
  });

  it('returns correct label for appointment', () => {
    expect(getEventTypeLabel('appointment')).toBe('Appointment');
  });

  it('returns correct label for deadline', () => {
    expect(getEventTypeLabel('deadline')).toBe('Deadline');
  });

  it('returns correct label for status_change', () => {
    expect(getEventTypeLabel('status_change')).toBe('Status Change');
  });

  it('returns correct label for note', () => {
    expect(getEventTypeLabel('note')).toBe('Note');
  });

  it('returns correct label for document', () => {
    expect(getEventTypeLabel('document')).toBe('Document');
  });

  it('returns correct label for document_version', () => {
    expect(getEventTypeLabel('document_version')).toBe('Document Version');
  });

  it('returns correct label for communication', () => {
    expect(getEventTypeLabel('communication')).toBe('Communication');
  });

  it('returns correct label for email', () => {
    expect(getEventTypeLabel('email')).toBe('Email');
  });

  it('returns correct label for call', () => {
    expect(getEventTypeLabel('call')).toBe('Call');
  });

  it('returns correct label for agent_action', () => {
    expect(getEventTypeLabel('agent_action')).toBe('Agent Action');
  });

  it('returns correct label for reminder', () => {
    expect(getEventTypeLabel('reminder')).toBe('Reminder');
  });

  it('returns correct label for audit', () => {
    expect(getEventTypeLabel('audit')).toBe('Audit');
  });

  it('returns correct label for stage_change', () => {
    expect(getEventTypeLabel('stage_change')).toBe('Stage Change');
  });

  it('returns the type value itself for unknown type', () => {
    expect(getEventTypeLabel('unknown_type' as any)).toBe('unknown_type');
  });
});

// ============================================================================
// getEventTypeIcon
// ============================================================================
describe('getEventTypeIcon', () => {
  it('returns CheckSquare for task', () => {
    expect(getEventTypeIcon('task')).toBe('CheckSquare');
  });

  it('returns CheckCircle2 for task_completed', () => {
    expect(getEventTypeIcon('task_completed')).toBe('CheckCircle2');
  });

  it('returns AlertCircle for task_overdue', () => {
    expect(getEventTypeIcon('task_overdue')).toBe('AlertCircle');
  });

  it('returns Calendar for appointment', () => {
    expect(getEventTypeIcon('appointment')).toBe('Calendar');
  });

  it('returns Clock for deadline', () => {
    expect(getEventTypeIcon('deadline')).toBe('Clock');
  });

  it('returns RefreshCw for status_change', () => {
    expect(getEventTypeIcon('status_change')).toBe('RefreshCw');
  });

  it('returns StickyNote for note', () => {
    expect(getEventTypeIcon('note')).toBe('StickyNote');
  });

  it('returns FileText for document', () => {
    expect(getEventTypeIcon('document')).toBe('FileText');
  });

  it('returns FileDiff for document_version', () => {
    expect(getEventTypeIcon('document_version')).toBe('FileDiff');
  });

  it('returns MessageSquare for communication', () => {
    expect(getEventTypeIcon('communication')).toBe('MessageSquare');
  });

  it('returns Mail for email', () => {
    expect(getEventTypeIcon('email')).toBe('Mail');
  });

  it('returns Phone for call', () => {
    expect(getEventTypeIcon('call')).toBe('Phone');
  });

  it('returns Bot for agent_action', () => {
    expect(getEventTypeIcon('agent_action')).toBe('Bot');
  });

  it('returns Bell for reminder', () => {
    expect(getEventTypeIcon('reminder')).toBe('Bell');
  });

  it('returns History for audit', () => {
    expect(getEventTypeIcon('audit')).toBe('History');
  });

  it('returns ArrowRight for stage_change', () => {
    expect(getEventTypeIcon('stage_change')).toBe('ArrowRight');
  });

  it('returns Circle for unknown type', () => {
    expect(getEventTypeIcon('unknown' as any)).toBe('Circle');
  });
});

// ============================================================================
// getPriorityColor
// ============================================================================
describe('getPriorityColor', () => {
  it('returns green for low priority', () => {
    expect(getPriorityColor('low')).toBe('text-green-600');
  });

  it('returns yellow for medium priority', () => {
    expect(getPriorityColor('medium')).toBe('text-yellow-600');
  });

  it('returns orange for high priority', () => {
    expect(getPriorityColor('high')).toBe('text-orange-600');
  });

  it('returns red for urgent priority', () => {
    expect(getPriorityColor('urgent')).toBe('text-red-600');
  });

  it('returns muted foreground for null', () => {
    expect(getPriorityColor(null)).toBe('text-muted-foreground');
  });

  it('returns muted foreground for undefined', () => {
    expect(getPriorityColor(undefined)).toBe('text-muted-foreground');
  });
});

// ============================================================================
// getPriorityBgColor
// ============================================================================
describe('getPriorityBgColor', () => {
  it('returns green bg for low priority', () => {
    expect(getPriorityBgColor('low')).toBe('bg-green-100');
  });

  it('returns yellow bg for medium priority', () => {
    expect(getPriorityBgColor('medium')).toBe('bg-yellow-100');
  });

  it('returns orange bg for high priority', () => {
    expect(getPriorityBgColor('high')).toBe('bg-orange-100');
  });

  it('returns red bg for urgent priority', () => {
    expect(getPriorityBgColor('urgent')).toBe('bg-red-100');
  });

  it('returns muted bg for null', () => {
    expect(getPriorityBgColor(null)).toBe('bg-muted');
  });

  it('returns muted bg for undefined', () => {
    expect(getPriorityBgColor(undefined)).toBe('bg-muted');
  });
});

// ============================================================================
// getAgentActionStatusColor
// ============================================================================
describe('getAgentActionStatusColor', () => {
  it('returns yellow for pending_approval', () => {
    expect(getAgentActionStatusColor('pending_approval')).toBe('text-yellow-600');
  });

  it('returns green for approved', () => {
    expect(getAgentActionStatusColor('approved')).toBe('text-green-600');
  });

  it('returns red for rejected', () => {
    expect(getAgentActionStatusColor('rejected')).toBe('text-red-600');
  });

  it('returns orange for rolled_back', () => {
    expect(getAgentActionStatusColor('rolled_back')).toBe('text-orange-600');
  });

  it('returns muted for expired', () => {
    expect(getAgentActionStatusColor('expired')).toBe('text-muted-foreground');
  });
});

// ============================================================================
// getAgentActionStatusLabel
// ============================================================================
describe('getAgentActionStatusLabel', () => {
  it('returns Pending Approval for pending_approval', () => {
    expect(getAgentActionStatusLabel('pending_approval')).toBe('Pending Approval');
  });

  it('returns Approved for approved', () => {
    expect(getAgentActionStatusLabel('approved')).toBe('Approved');
  });

  it('returns Rejected for rejected', () => {
    expect(getAgentActionStatusLabel('rejected')).toBe('Rejected');
  });

  it('returns Rolled Back for rolled_back', () => {
    expect(getAgentActionStatusLabel('rolled_back')).toBe('Rolled Back');
  });

  it('returns Expired for expired', () => {
    expect(getAgentActionStatusLabel('expired')).toBe('Expired');
  });
});

// ============================================================================
// isAgentActionPendingApproval
// ============================================================================
describe('isAgentActionPendingApproval', () => {
  it('returns true for agent_action with pending_approval status', () => {
    const event: TimelineEvent = {
      id: 'agent-1',
      type: 'agent_action',
      title: 'Suggested Follow-up',
      timestamp: new Date(),
      agentAction: {
        actionId: 'action-1',
        agentName: 'LeadScorer',
        proposedChanges: {},
        confidence: 0.9,
        status: 'pending_approval',
      },
    };
    expect(isAgentActionPendingApproval(event)).toBe(true);
  });

  it('returns false for agent_action with approved status', () => {
    const event: TimelineEvent = {
      id: 'agent-1',
      type: 'agent_action',
      title: 'Auto-scored Lead',
      timestamp: new Date(),
      agentAction: {
        actionId: 'action-1',
        agentName: 'LeadScorer',
        proposedChanges: {},
        confidence: 0.95,
        status: 'approved',
      },
    };
    expect(isAgentActionPendingApproval(event)).toBe(false);
  });

  it('returns false for non-agent_action type', () => {
    const event: TimelineEvent = {
      id: 'task-1',
      type: 'task',
      title: 'Follow up with lead',
      timestamp: new Date(),
    };
    expect(isAgentActionPendingApproval(event)).toBe(false);
  });

  it('returns false when agentAction is null', () => {
    const event: TimelineEvent = {
      id: 'agent-1',
      type: 'agent_action',
      title: 'Action',
      timestamp: new Date(),
      agentAction: null,
    };
    expect(isAgentActionPendingApproval(event)).toBe(false);
  });

  it('returns false when agentAction is undefined', () => {
    const event: TimelineEvent = {
      id: 'agent-1',
      type: 'agent_action',
      title: 'Action',
      timestamp: new Date(),
    };
    expect(isAgentActionPendingApproval(event)).toBe(false);
  });

  it('returns false for agent_action with rejected status', () => {
    const event: TimelineEvent = {
      id: 'agent-1',
      type: 'agent_action',
      title: 'Rejected action',
      timestamp: new Date(),
      agentAction: {
        actionId: 'action-1',
        agentName: 'Agent',
        proposedChanges: {},
        confidence: 0.5,
        status: 'rejected',
      },
    };
    expect(isAgentActionPendingApproval(event)).toBe(false);
  });
});

// ============================================================================
// groupEventsByDate
// ============================================================================
describe('groupEventsByDate', () => {
  it('returns empty map for empty events', () => {
    const result = groupEventsByDate([]);
    expect(result.size).toBe(0);
  });

  it('groups events by ISO date key', () => {
    const events: TimelineEvent[] = [
      { id: '1', type: 'task', title: 'Task 1', timestamp: new Date('2026-01-15T10:00:00Z') },
      { id: '2', type: 'note', title: 'Note 1', timestamp: new Date('2026-01-15T14:00:00Z') },
      { id: '3', type: 'task', title: 'Task 2', timestamp: new Date('2026-01-16T10:00:00Z') },
    ];

    const result = groupEventsByDate(events);
    expect(result.size).toBe(2);
    expect(result.get('2026-01-15')).toHaveLength(2);
    expect(result.get('2026-01-16')).toHaveLength(1);
  });

  it('maintains event order within a date group', () => {
    const events: TimelineEvent[] = [
      { id: '1', type: 'task', title: 'First', timestamp: new Date('2026-01-15T08:00:00Z') },
      { id: '2', type: 'task', title: 'Second', timestamp: new Date('2026-01-15T12:00:00Z') },
      { id: '3', type: 'task', title: 'Third', timestamp: new Date('2026-01-15T16:00:00Z') },
    ];

    const result = groupEventsByDate(events);
    const group = result.get('2026-01-15')!;
    expect(group[0].title).toBe('First');
    expect(group[1].title).toBe('Second');
    expect(group[2].title).toBe('Third');
  });

  it('handles single event', () => {
    const events: TimelineEvent[] = [
      { id: '1', type: 'email', title: 'Welcome', timestamp: new Date('2026-02-01T09:00:00Z') },
    ];

    const result = groupEventsByDate(events);
    expect(result.size).toBe(1);
    expect(result.get('2026-02-01')).toHaveLength(1);
  });

  it('handles events across many different dates', () => {
    const events: TimelineEvent[] = Array.from({ length: 5 }, (_, i) => ({
      id: `${i}`,
      type: 'task' as const,
      title: `Task ${i}`,
      timestamp: new Date(`2026-01-${(i + 1).toString().padStart(2, '0')}T10:00:00Z`),
    }));

    const result = groupEventsByDate(events);
    expect(result.size).toBe(5);
  });
});

// ============================================================================
// getRelativeDateLabel
// ============================================================================
describe('getRelativeDateLabel', () => {
  it('returns Today for current date', () => {
    const today = new Date();
    expect(getRelativeDateLabel(today)).toBe('Today');
  });

  it('returns Yesterday for previous day', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(getRelativeDateLabel(yesterday)).toBe('Yesterday');
  });

  it('returns formatted date for older dates', () => {
    const oldDate = new Date('2025-12-25T10:00:00Z');
    const result = getRelativeDateLabel(oldDate);
    // Should contain year and month/day info
    expect(result).toContain('2025');
    expect(result).toContain('December');
    expect(result).toContain('25');
  });

  it('returns formatted date for future dates', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const result = getRelativeDateLabel(futureDate);
    // Future dates should not be "Today" or "Yesterday"
    expect(result).not.toBe('Today');
    expect(result).not.toBe('Yesterday');
  });

  it('includes weekday in formatted date', () => {
    // Using a known date
    const date = new Date('2026-01-05T10:00:00Z'); // This is a Monday
    const result = getRelativeDateLabel(date);
    expect(result).toContain('Monday');
  });
});

// ============================================================================
// Type interface tests
// ============================================================================
describe('type interfaces', () => {
  it('TimelineActor has expected shape', () => {
    const actor: TimelineActor = {
      id: 'user-1',
      name: 'John Doe',
      email: 'john@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      isAgent: false,
    };
    expect(actor.id).toBe('user-1');
    expect(actor.isAgent).toBe(false);
  });

  it('TimelineActor allows null optional fields', () => {
    const actor: TimelineActor = {
      id: 'agent-1',
      name: null,
      email: null,
      avatarUrl: null,
      isAgent: true,
    };
    expect(actor.name).toBeNull();
    expect(actor.isAgent).toBe(true);
  });

  it('AgentActionDetails has expected shape', () => {
    const details: AgentActionDetails = {
      actionId: 'action-1',
      agentName: 'Scorer',
      proposedChanges: { score: 85 },
      confidence: 0.92,
      status: 'pending_approval',
      expiresAt: new Date(),
    };
    expect(details.confidence).toBe(0.92);
    expect(details.status).toBe('pending_approval');
  });

  it('DocumentDetails has expected shape', () => {
    const doc: DocumentDetails = {
      documentId: 'doc-1',
      filename: 'contract.pdf',
      version: 2,
      mimeType: 'application/pdf',
    };
    expect(doc.filename).toBe('contract.pdf');
    expect(doc.version).toBe(2);
  });

  it('CommunicationDetails has expected shape', () => {
    const comm: CommunicationDetails = {
      channel: 'email',
      direction: 'outbound',
      from: 'sales@example.com',
      to: 'client@example.com',
      subject: 'Follow up',
    };
    expect(comm.channel).toBe('email');
    expect(comm.direction).toBe('outbound');
  });

  it('AppointmentDetails has expected shape', () => {
    const appt: AppointmentDetails = {
      appointmentId: 'appt-1',
      appointmentType: 'discovery_call',
      startTime: new Date('2026-02-01T14:00:00Z'),
      endTime: new Date('2026-02-01T15:00:00Z'),
      location: 'Zoom',
      status: 'scheduled',
    };
    expect(appt.appointmentType).toBe('discovery_call');
    expect(appt.location).toBe('Zoom');
  });

  it('TaskDetails has expected shape', () => {
    const task: TaskDetails = {
      taskId: 'task-1',
      status: 'completed',
      dueDate: new Date(),
      completedAt: new Date(),
    };
    expect(task.status).toBe('completed');
  });

  it('TimelineEvent has expected minimal shape', () => {
    const event: TimelineEvent = {
      id: 'event-1',
      type: 'task',
      title: 'Test Event',
      timestamp: new Date(),
    };
    expect(event.id).toBe('event-1');
    expect(event.type).toBe('task');
  });

  it('TimelineEvent supports all optional fields', () => {
    const event: TimelineEvent = {
      id: 'event-1',
      type: 'agent_action',
      title: 'AI Action',
      description: 'Agent suggested a follow-up',
      timestamp: new Date(),
      priority: 'high',
      entityType: 'lead',
      entityId: 'lead-1',
      agentAction: {
        actionId: 'a-1',
        agentName: 'Bot',
        proposedChanges: {},
        confidence: 0.8,
        status: 'pending_approval',
      },
      actor: { id: 'bot-1', isAgent: true },
      metadata: { source: 'automated' },
      isOverdue: false,
    };
    expect(event.priority).toBe('high');
    expect(event.agentAction?.confidence).toBe(0.8);
  });

  it('TimelineEventsResponse has expected shape', () => {
    const response: TimelineEventsResponse = {
      events: [],
      total: 0,
      page: 1,
      limit: 20,
      hasMore: false,
      queryDurationMs: 5,
    };
    expect(response.total).toBe(0);
    expect(response.hasMore).toBe(false);
  });

  it('TimelineStatsResponse has expected shape', () => {
    const stats: TimelineStatsResponse = {
      tasks: { total: 10, completed: 5, overdue: 2, pending: 3 },
      appointments: { upcoming: 4 },
      agentActions: { pendingApproval: 1 },
      queryDurationMs: 3,
    };
    expect(stats.tasks.total).toBe(10);
    expect(stats.agentActions.pendingApproval).toBe(1);
  });

  it('DeadlineItem has expected shape', () => {
    const item: DeadlineItem = {
      id: 'task-1',
      type: 'task',
      title: 'Due soon',
      dueDate: new Date(),
      priority: 'high',
      isOverdue: false,
    };
    expect(item.type).toBe('task');
    expect(item.isOverdue).toBe(false);
  });

  it('DeadlineItem type accepts task and appointment', () => {
    const taskDeadline: DeadlineItem = {
      id: '1',
      type: 'task',
      title: 'Task',
      dueDate: new Date(),
      priority: null,
      isOverdue: false,
    };
    const apptDeadline: DeadlineItem = {
      id: '2',
      type: 'appointment',
      title: 'Appointment',
      dueDate: new Date(),
      priority: 'medium',
      isOverdue: true,
    };
    expect(taskDeadline.type).toBe('task');
    expect(apptDeadline.type).toBe('appointment');
  });

  it('PendingAgentAction has expected shape', () => {
    const action: PendingAgentAction = {
      id: 'pa-1',
      actionId: 'action-1',
      agentName: 'Scorer',
      actionType: 'score_update',
      title: 'Update lead score',
      description: 'Based on recent activity',
      proposedChanges: { score: 90 },
      confidence: 0.88,
      createdAt: new Date(),
      expiresAt: new Date(),
      entityType: 'lead',
      entityId: 'lead-1',
    };
    expect(action.confidence).toBe(0.88);
    expect(action.entityType).toBe('lead');
  });

  it('TimelineQueryParams has expected shape', () => {
    const params: TimelineQueryParams = {
      dealId: 'deal-1',
      eventTypes: ['task', 'note'],
      excludeTypes: ['audit'],
      priorities: ['high', 'urgent'],
      agentActionStatus: ['pending_approval'],
      fromDate: new Date(),
      toDate: new Date(),
      page: 1,
      limit: 20,
      sortOrder: 'desc',
      includeCompleted: true,
      search: 'follow up',
    };
    expect(params.sortOrder).toBe('desc');
    expect(params.eventTypes).toHaveLength(2);
  });
});
