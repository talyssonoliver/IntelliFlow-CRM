/**
 * Timeline Validators Tests
 *
 * Tests the Zod validation schemas for timeline events, actors, detail schemas,
 * response schemas, and query parameters.
 *
 * Coverage target: >90% for validator layer
 */

import { describe, it, expect } from 'vitest';

import {
  timelineEventTypeSchema,
  agentActionStatusSchema,
  timelinePrioritySchema,
  communicationChannelSchema,
  communicationDirectionSchema,
  timelineActorSchema,
  agentActionDetailsSchema,
  documentDetailsSchema,
  communicationDetailsSchema,
  appointmentDetailsSchema,
  taskDetailsSchema,
  timelineEventSchema,
  timelineEventsResponseSchema,
  timelineStatsResponseSchema,
  upcomingDeadlinesResponseSchema,
  pendingAgentActionsResponseSchema,
  timelineQueryParamsSchema,
} from '../timeline';

// =============================================================================
// Enum Schemas
// =============================================================================

describe('Timeline Validators', () => {
  describe('timelineEventTypeSchema', () => {
    it('should accept all valid event types', () => {
      const validTypes = [
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
        'chat',
        'agent_action',
        'reminder',
        'audit',
        'stage_change',
      ];

      validTypes.forEach((type) => {
        const result = timelineEventTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid event type', () => {
      const result = timelineEventTypeSchema.safeParse('invalid_type');
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = timelineEventTypeSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject number', () => {
      const result = timelineEventTypeSchema.safeParse(42);
      expect(result.success).toBe(false);
    });
  });

  describe('agentActionStatusSchema', () => {
    it('should accept all valid agent action statuses', () => {
      const validStatuses = ['pending_approval', 'approved', 'rejected', 'rolled_back', 'expired'];

      validStatuses.forEach((status) => {
        const result = agentActionStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid status', () => {
      const result = agentActionStatusSchema.safeParse('completed');
      expect(result.success).toBe(false);
    });

    it('should reject uppercase variant', () => {
      const result = agentActionStatusSchema.safeParse('APPROVED');
      expect(result.success).toBe(false);
    });
  });

  describe('timelinePrioritySchema', () => {
    it('should accept all valid priorities', () => {
      const validPriorities = ['low', 'medium', 'high', 'urgent'];

      validPriorities.forEach((priority) => {
        const result = timelinePrioritySchema.safeParse(priority);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid priority', () => {
      const result = timelinePrioritySchema.safeParse('critical');
      expect(result.success).toBe(false);
    });

    it('should reject uppercase variant', () => {
      const result = timelinePrioritySchema.safeParse('HIGH');
      expect(result.success).toBe(false);
    });
  });

  describe('communicationChannelSchema', () => {
    it('should accept all valid channels', () => {
      const validChannels = ['email', 'phone', 'whatsapp', 'sms', 'chat', 'other'];

      validChannels.forEach((channel) => {
        const result = communicationChannelSchema.safeParse(channel);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid channel', () => {
      const result = communicationChannelSchema.safeParse('fax');
      expect(result.success).toBe(false);
    });
  });

  describe('communicationDirectionSchema', () => {
    it('should accept inbound', () => {
      const result = communicationDirectionSchema.safeParse('inbound');
      expect(result.success).toBe(true);
    });

    it('should accept outbound', () => {
      const result = communicationDirectionSchema.safeParse('outbound');
      expect(result.success).toBe(true);
    });

    it('should reject invalid direction', () => {
      const result = communicationDirectionSchema.safeParse('bidirectional');
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // Actor Schema
  // =============================================================================

  describe('timelineActorSchema', () => {
    it('should accept minimal actor with only id', () => {
      const result = timelineActorSchema.safeParse({ id: 'user-123' });
      expect(result.success).toBe(true);
    });

    it('should accept full actor with all fields', () => {
      const result = timelineActorSchema.safeParse({
        id: 'agent-001',
        name: 'AI Assistant',
        email: 'agent@example.com',
        avatarUrl: 'https://example.com/avatar.png',
        isAgent: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isAgent).toBe(true);
        expect(result.data.name).toBe('AI Assistant');
      }
    });

    it('should accept null for nullable fields', () => {
      const result = timelineActorSchema.safeParse({
        id: 'user-1',
        name: null,
        email: null,
        avatarUrl: null,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing id', () => {
      const result = timelineActorSchema.safeParse({ name: 'Test User' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid email format', () => {
      const result = timelineActorSchema.safeParse({
        id: 'user-1',
        email: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid avatarUrl format', () => {
      const result = timelineActorSchema.safeParse({
        id: 'user-1',
        avatarUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // Detail Schemas
  // =============================================================================

  describe('agentActionDetailsSchema', () => {
    const validAction = {
      actionId: 'action-001',
      agentName: 'Lead Scorer',
      proposedChanges: { score: 85 },
      confidence: 0.92,
      status: 'pending_approval' as const,
    };

    it('should accept valid agent action details', () => {
      const result = agentActionDetailsSchema.safeParse(validAction);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.confidence).toBe(0.92);
        expect(result.data.status).toBe('pending_approval');
      }
    });

    it('should accept action with expiresAt', () => {
      const result = agentActionDetailsSchema.safeParse({
        ...validAction,
        expiresAt: '2025-12-31T23:59:59.000Z',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expiresAt).toBeInstanceOf(Date);
      }
    });

    it('should accept null expiresAt', () => {
      const result = agentActionDetailsSchema.safeParse({
        ...validAction,
        expiresAt: null,
      });
      expect(result.success).toBe(true);
    });

    it('should accept confidence at 0', () => {
      const result = agentActionDetailsSchema.safeParse({
        ...validAction,
        confidence: 0,
      });
      expect(result.success).toBe(true);
    });

    it('should accept confidence at 1', () => {
      const result = agentActionDetailsSchema.safeParse({
        ...validAction,
        confidence: 1,
      });
      expect(result.success).toBe(true);
    });

    it('should reject confidence above 1', () => {
      const result = agentActionDetailsSchema.safeParse({
        ...validAction,
        confidence: 1.01,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative confidence', () => {
      const result = agentActionDetailsSchema.safeParse({
        ...validAction,
        confidence: -0.1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid status', () => {
      const result = agentActionDetailsSchema.safeParse({
        ...validAction,
        status: 'completed',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = agentActionDetailsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept unknown proposedChanges (any type)', () => {
      const result = agentActionDetailsSchema.safeParse({
        ...validAction,
        proposedChanges: [1, 2, 3],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('documentDetailsSchema', () => {
    it('should accept minimal document details', () => {
      const result = documentDetailsSchema.safeParse({
        documentId: 'doc-123',
        filename: 'report.pdf',
      });
      expect(result.success).toBe(true);
    });

    it('should accept full document details', () => {
      const result = documentDetailsSchema.safeParse({
        documentId: 'doc-456',
        filename: 'contract.docx',
        version: 3,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe(3);
      }
    });

    it('should reject missing documentId', () => {
      const result = documentDetailsSchema.safeParse({
        filename: 'report.pdf',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing filename', () => {
      const result = documentDetailsSchema.safeParse({
        documentId: 'doc-123',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('communicationDetailsSchema', () => {
    it('should accept minimal communication details', () => {
      const result = communicationDetailsSchema.safeParse({
        channel: 'email',
        direction: 'outbound',
      });
      expect(result.success).toBe(true);
    });

    it('should accept full communication details', () => {
      const result = communicationDetailsSchema.safeParse({
        channel: 'phone',
        direction: 'inbound',
        from: '+44 7700 900000',
        to: 'support@example.com',
        subject: 'Follow-up call',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.subject).toBe('Follow-up call');
      }
    });

    it('should reject invalid channel', () => {
      const result = communicationDetailsSchema.safeParse({
        channel: 'telegram',
        direction: 'inbound',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid direction', () => {
      const result = communicationDetailsSchema.safeParse({
        channel: 'email',
        direction: 'both',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('appointmentDetailsSchema', () => {
    const validAppointment = {
      appointmentId: 'appt-001',
      appointmentType: 'MEETING',
      startTime: '2025-12-20T10:00:00.000Z',
      endTime: '2025-12-20T11:00:00.000Z',
      status: 'SCHEDULED',
    };

    it('should accept valid appointment details', () => {
      const result = appointmentDetailsSchema.safeParse(validAppointment);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startTime).toBeInstanceOf(Date);
        expect(result.data.endTime).toBeInstanceOf(Date);
      }
    });

    it('should accept appointment with location', () => {
      const result = appointmentDetailsSchema.safeParse({
        ...validAppointment,
        location: 'Conference Room B',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.location).toBe('Conference Room B');
      }
    });

    it('should accept null location', () => {
      const result = appointmentDetailsSchema.safeParse({
        ...validAppointment,
        location: null,
      });
      expect(result.success).toBe(true);
    });

    it('should coerce date strings to Date objects', () => {
      const result = appointmentDetailsSchema.safeParse(validAppointment);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startTime).toBeInstanceOf(Date);
      }
    });

    it('should reject missing appointmentId', () => {
      const { appointmentId, ...rest } = validAppointment;
      const result = appointmentDetailsSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject invalid date string for startTime', () => {
      const result = appointmentDetailsSchema.safeParse({
        ...validAppointment,
        startTime: 'not-a-date',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('taskDetailsSchema', () => {
    it('should accept minimal task details', () => {
      const result = taskDetailsSchema.safeParse({
        taskId: 'task-001',
        status: 'IN_PROGRESS',
      });
      expect(result.success).toBe(true);
    });

    it('should accept full task details', () => {
      const result = taskDetailsSchema.safeParse({
        taskId: 'task-002',
        status: 'COMPLETED',
        dueDate: '2025-12-25T00:00:00.000Z',
        completedAt: '2025-12-24T15:30:00.000Z',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dueDate).toBeInstanceOf(Date);
        expect(result.data.completedAt).toBeInstanceOf(Date);
      }
    });

    it('should accept null dueDate and completedAt', () => {
      const result = taskDetailsSchema.safeParse({
        taskId: 'task-003',
        status: 'OPEN',
        dueDate: null,
        completedAt: null,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing taskId', () => {
      const result = taskDetailsSchema.safeParse({ status: 'OPEN' });
      expect(result.success).toBe(false);
    });

    it('should reject missing status', () => {
      const result = taskDetailsSchema.safeParse({ taskId: 'task-001' });
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // Main Timeline Event Schema
  // =============================================================================

  describe('timelineEventSchema', () => {
    const minimalEvent = {
      id: 'event-001',
      type: 'note' as const,
      title: 'Added a note',
      timestamp: '2025-12-20T14:00:00.000Z',
    };

    it('should accept a minimal timeline event', () => {
      const result = timelineEventSchema.safeParse(minimalEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('event-001');
        expect(result.data.type).toBe('note');
        expect(result.data.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should accept a full timeline event with all optional fields', () => {
      const fullEvent = {
        ...minimalEvent,
        type: 'agent_action',
        description: 'AI agent proposed a lead score update',
        priority: 'high',
        entityType: 'Lead',
        entityId: 'lead-123',
        agentAction: {
          actionId: 'action-001',
          agentName: 'Lead Scorer',
          proposedChanges: { score: 85 },
          confidence: 0.95,
          status: 'pending_approval',
        },
        actor: {
          id: 'agent-001',
          name: 'AI Assistant',
          isAgent: true,
        },
        metadata: { source: 'automated' },
        isOverdue: false,
      };

      const result = timelineEventSchema.safeParse(fullEvent);
      expect(result.success).toBe(true);
    });

    it('should accept event with document details', () => {
      const result = timelineEventSchema.safeParse({
        ...minimalEvent,
        type: 'document',
        document: {
          documentId: 'doc-001',
          filename: 'contract.pdf',
          version: 1,
          mimeType: 'application/pdf',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept event with communication details', () => {
      const result = timelineEventSchema.safeParse({
        ...minimalEvent,
        type: 'email',
        communication: {
          channel: 'email',
          direction: 'outbound',
          from: 'sales@company.com',
          to: 'client@example.com',
          subject: 'Proposal follow-up',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept event with appointment details', () => {
      const result = timelineEventSchema.safeParse({
        ...minimalEvent,
        type: 'appointment',
        appointment: {
          appointmentId: 'appt-001',
          appointmentType: 'CONSULTATION',
          startTime: '2025-12-20T10:00:00Z',
          endTime: '2025-12-20T11:00:00Z',
          location: 'Room A',
          status: 'SCHEDULED',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept event with task details', () => {
      const result = timelineEventSchema.safeParse({
        ...minimalEvent,
        type: 'task_overdue',
        task: {
          taskId: 'task-001',
          status: 'OVERDUE',
          dueDate: '2025-12-15T00:00:00Z',
        },
        isOverdue: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept null for all nullable optional fields', () => {
      const result = timelineEventSchema.safeParse({
        ...minimalEvent,
        description: null,
        priority: null,
        entityType: null,
        entityId: null,
        agentAction: null,
        document: null,
        communication: null,
        appointment: null,
        task: null,
        actor: null,
        metadata: null,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing id', () => {
      const { id, ...rest } = minimalEvent;
      const result = timelineEventSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject missing type', () => {
      const { type, ...rest } = minimalEvent;
      const result = timelineEventSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject invalid type', () => {
      const result = timelineEventSchema.safeParse({
        ...minimalEvent,
        type: 'unknown_type',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing title', () => {
      const { title, ...rest } = minimalEvent;
      const result = timelineEventSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject missing timestamp', () => {
      const { timestamp, ...rest } = minimalEvent;
      const result = timelineEventSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // Response Schemas
  // =============================================================================

  describe('timelineEventsResponseSchema', () => {
    const validResponse = {
      events: [
        {
          id: 'event-001',
          type: 'note',
          title: 'A note',
          timestamp: '2025-12-20T14:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
      queryDurationMs: 12,
    };

    it('should accept valid events response', () => {
      const result = timelineEventsResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should accept empty events array', () => {
      const result = timelineEventsResponseSchema.safeParse({
        ...validResponse,
        events: [],
        total: 0,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing total', () => {
      const { total, ...rest } = validResponse;
      const result = timelineEventsResponseSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject missing hasMore', () => {
      const { hasMore, ...rest } = validResponse;
      const result = timelineEventsResponseSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe('timelineStatsResponseSchema', () => {
    const validStats = {
      tasks: { total: 10, completed: 5, overdue: 2, pending: 3 },
      appointments: { upcoming: 4 },
      agentActions: { pendingApproval: 1 },
      queryDurationMs: 8,
    };

    it('should accept valid stats response', () => {
      const result = timelineStatsResponseSchema.safeParse(validStats);
      expect(result.success).toBe(true);
    });

    it('should reject missing tasks', () => {
      const { tasks, ...rest } = validStats;
      const result = timelineStatsResponseSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject missing nested field (tasks.overdue)', () => {
      const result = timelineStatsResponseSchema.safeParse({
        ...validStats,
        tasks: { total: 10, completed: 5, pending: 3 },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('upcomingDeadlinesResponseSchema', () => {
    const validDeadlines = {
      deadlines: [
        {
          id: 'task-001',
          type: 'task' as const,
          title: 'Follow up with client',
          dueDate: '2025-12-25T00:00:00Z',
          priority: 'high' as const,
          isOverdue: false,
        },
      ],
      total: 1,
      queryDurationMs: 5,
    };

    it('should accept valid deadlines response', () => {
      const result = upcomingDeadlinesResponseSchema.safeParse(validDeadlines);
      expect(result.success).toBe(true);
    });

    it('should accept deadline with null priority', () => {
      const result = upcomingDeadlinesResponseSchema.safeParse({
        ...validDeadlines,
        deadlines: [
          {
            id: 'appt-001',
            type: 'appointment',
            title: 'Client meeting',
            dueDate: '2025-12-25T00:00:00Z',
            priority: null,
            isOverdue: false,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject deadline with invalid type', () => {
      const result = upcomingDeadlinesResponseSchema.safeParse({
        ...validDeadlines,
        deadlines: [
          {
            id: 'x-001',
            type: 'note',
            title: 'Invalid deadline type',
            dueDate: '2025-12-25T00:00:00Z',
            priority: null,
            isOverdue: false,
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('pendingAgentActionsResponseSchema', () => {
    const validActions = {
      actions: [
        {
          id: 'event-001',
          actionId: 'action-001',
          agentName: 'Lead Scorer',
          actionType: 'score_update',
          title: 'Lead score updated',
          description: 'AI suggests a score of 85',
          proposedChanges: { score: 85 },
          confidence: 0.95,
          createdAt: '2025-12-20T12:00:00Z',
          expiresAt: '2025-12-21T12:00:00Z',
          entityType: 'Lead',
          entityId: 'lead-123',
        },
      ],
      total: 1,
      queryDurationMs: 10,
    };

    it('should accept valid pending agent actions response', () => {
      const result = pendingAgentActionsResponseSchema.safeParse(validActions);
      expect(result.success).toBe(true);
    });

    it('should accept action with null description and expiresAt', () => {
      const result = pendingAgentActionsResponseSchema.safeParse({
        ...validActions,
        actions: [
          {
            ...validActions.actions[0],
            description: null,
            expiresAt: null,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing required action fields', () => {
      const result = pendingAgentActionsResponseSchema.safeParse({
        actions: [{ id: 'event-001' }],
        total: 1,
        queryDurationMs: 10,
      });
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // Query Parameters Schema
  // =============================================================================

  describe('timelineQueryParamsSchema', () => {
    it('should accept empty query params', () => {
      const result = timelineQueryParamsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept full query params', () => {
      const result = timelineQueryParamsSchema.safeParse({
        dealId: 'deal-001',
        caseId: 'case-001',
        opportunityId: 'opp-001',
        contactId: 'contact-001',
        accountId: 'account-001',
        eventTypes: ['task', 'email', 'agent_action'],
        excludeTypes: ['audit'],
        priorities: ['high', 'urgent'],
        agentActionStatus: ['pending_approval'],
        fromDate: '2025-01-01T00:00:00Z',
        toDate: '2025-12-31T23:59:59Z',
        page: 2,
        limit: 50,
        sortOrder: 'asc',
        includeCompleted: true,
        search: 'follow up',
      });
      expect(result.success).toBe(true);
    });

    it('should accept single filter', () => {
      const result = timelineQueryParamsSchema.safeParse({
        contactId: 'contact-abc',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid event type in eventTypes array', () => {
      const result = timelineQueryParamsSchema.safeParse({
        eventTypes: ['task', 'invalid_type'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid priority in priorities array', () => {
      const result = timelineQueryParamsSchema.safeParse({
        priorities: ['HIGH'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid agent action status in filter', () => {
      const result = timelineQueryParamsSchema.safeParse({
        agentActionStatus: ['done'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid sortOrder', () => {
      const result = timelineQueryParamsSchema.safeParse({
        sortOrder: 'random',
      });
      expect(result.success).toBe(false);
    });

    it('should coerce fromDate string to Date', () => {
      const result = timelineQueryParamsSchema.safeParse({
        fromDate: '2025-06-15T00:00:00Z',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fromDate).toBeInstanceOf(Date);
      }
    });

    it('should reject non-boolean includeCompleted', () => {
      const result = timelineQueryParamsSchema.safeParse({
        includeCompleted: 'yes',
      });
      expect(result.success).toBe(false);
    });
  });
});
