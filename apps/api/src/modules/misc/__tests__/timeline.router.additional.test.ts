/**
 * Timeline Router Additional Tests (supplementary coverage)
 *
 * Tests for uncovered branches/methods in timeline.router.ts:
 * - computeDeadline endpoint
 * - isBusinessDay endpoint
 * - getNextBusinessDay endpoint
 * - validateDeadlineRule endpoint
 * - getEvents: document events, audit log events, date filtering, search, sorting asc
 * - getStats: with opportunityId (appointments, documents counted)
 * - getUpcomingDeadlines: with opportunityId
 * - getPendingAgentActions: default payload handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { timelineRouter } from '../timeline.router';
import { prismaMock, createTestContext, TEST_UUIDS, mockTask, mockUser } from '../../../test/setup';

// Mock the deadline domain service
vi.mock('../../../services', () => ({
  DeadlineDomainService: vi.fn(),
  deadlineDomainService: {
    computeDeadline: vi.fn(),
    isBusinessDay: vi.fn(),
    isHoliday: vi.fn(),
    getNextBusinessDay: vi.fn(),
    validateRule: vi.fn(),
  },
}));

import { deadlineDomainService } from '../../../services';

describe('Timeline Router - Additional Coverage', () => {
  const ctx = createTestContext();
  const caller = timelineRouter.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // computeDeadline
  // ===========================================================================
  describe('computeDeadline', () => {
    it('should compute a deadline with business days', async () => {
      const mockResult = {
        dueDate: new Date('2025-01-20'),
        triggerDate: new Date('2025-01-10'),
        calendarDaysCount: 10,
        businessDaysCount: 7,
        holidaysExcluded: 1,
        weekendsExcluded: 2,
      };
      (deadlineDomainService.computeDeadline as any).mockReturnValue(mockResult);

      const result = await caller.computeDeadline({
        triggerDate: new Date('2025-01-10'),
        daysCount: 7,
        dayCountType: 'BUSINESS',
        excludeHolidays: true,
        includeEndDay: false,
      });

      expect(result.dueDate).toEqual(new Date('2025-01-20'));
      expect(result.triggerDate).toEqual(new Date('2025-01-10'));
      expect(result.calendarDaysCount).toBe(10);
      expect(result.businessDaysCount).toBe(7);
      expect(result.holidaysExcluded).toBe(1);
      expect(result.weekendsExcluded).toBe(2);
      expect(result.computeDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should compute a deadline with calendar days', async () => {
      const mockResult = {
        dueDate: new Date('2025-01-20'),
        triggerDate: new Date('2025-01-10'),
        calendarDaysCount: 10,
        businessDaysCount: 7,
        holidaysExcluded: 0,
        weekendsExcluded: 0,
      };
      (deadlineDomainService.computeDeadline as any).mockReturnValue(mockResult);

      const result = await caller.computeDeadline({
        triggerDate: new Date('2025-01-10'),
        daysCount: 10,
        dayCountType: 'CALENDAR',
      });

      expect(result.dueDate).toEqual(new Date('2025-01-20'));
    });

    it('should throw INTERNAL_SERVER_ERROR when computation fails', async () => {
      (deadlineDomainService.computeDeadline as any).mockReturnValue(null);

      await expect(
        caller.computeDeadline({
          triggerDate: new Date('2025-01-10'),
          daysCount: 7,
          dayCountType: 'BUSINESS',
        })
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to compute deadline',
      });
    });
  });

  // ===========================================================================
  // isBusinessDay
  // ===========================================================================
  describe('isBusinessDay', () => {
    it('should return true for a regular business day', async () => {
      // Wednesday Jan 15, 2025
      const date = new Date('2025-01-15');
      (deadlineDomainService.isBusinessDay as any).mockReturnValue(true);
      (deadlineDomainService.isHoliday as any).mockReturnValue(false);

      const result = await caller.isBusinessDay({ date });

      expect(result.isBusinessDay).toBe(true);
      expect(result.isHoliday).toBe(false);
      expect(result.date).toEqual(date);
    });

    it('should return false for a weekend day', async () => {
      // Saturday Jan 18, 2025
      const date = new Date('2025-01-18');
      (deadlineDomainService.isBusinessDay as any).mockReturnValue(false);
      (deadlineDomainService.isHoliday as any).mockReturnValue(false);

      const result = await caller.isBusinessDay({ date });

      expect(result.isBusinessDay).toBe(false);
      expect(result.isWeekend).toBe(true);
    });

    it('should return false for a holiday', async () => {
      // New Year's Day
      const date = new Date('2025-01-01');
      (deadlineDomainService.isBusinessDay as any).mockReturnValue(false);
      (deadlineDomainService.isHoliday as any).mockReturnValue(true);

      const result = await caller.isBusinessDay({ date });

      expect(result.isBusinessDay).toBe(false);
      expect(result.isHoliday).toBe(true);
    });
  });

  // ===========================================================================
  // getNextBusinessDay
  // ===========================================================================
  describe('getNextBusinessDay', () => {
    it('should return next business day from a Friday', async () => {
      const friday = new Date('2025-01-17'); // Friday
      const monday = new Date('2025-01-20'); // Monday
      (deadlineDomainService.getNextBusinessDay as any).mockReturnValue(monday);

      const result = await caller.getNextBusinessDay({ date: friday });

      expect(result.inputDate).toEqual(friday);
      expect(result.nextBusinessDay).toEqual(monday);
      expect(result.daysSkipped).toBe(3); // Fri -> Mon = 3 days
    });

    it('should return same day result for a business day', async () => {
      const tuesday = new Date('2025-01-14');
      const nextDay = new Date('2025-01-15');
      (deadlineDomainService.getNextBusinessDay as any).mockReturnValue(nextDay);

      const result = await caller.getNextBusinessDay({ date: tuesday });

      expect(result.daysSkipped).toBe(1);
    });
  });

  // ===========================================================================
  // validateDeadlineRule
  // ===========================================================================
  describe('validateDeadlineRule', () => {
    it('should validate a valid deadline rule', async () => {
      (deadlineDomainService.validateRule as any).mockReturnValue({
        isValid: true,
        errors: [],
        computedDueDate: new Date('2025-02-01'),
      });

      const result = await caller.validateDeadlineRule({
        name: 'Discovery Response',
        daysCount: 14,
        dayCountType: 'BUSINESS',
        trigger: 'CASE_OPENED',
        excludeHolidays: true,
        includeEndDay: false,
        triggerDate: new Date('2025-01-10'),
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.computedDueDate).toEqual(new Date('2025-02-01'));
      expect(result.validationDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return errors for invalid deadline rule', async () => {
      (deadlineDomainService.validateRule as any).mockReturnValue({
        isValid: false,
        errors: ['Days count must be positive', 'Trigger not recognized'],
        computedDueDate: null,
      });

      const result = await caller.validateDeadlineRule({
        name: 'Bad Rule',
        daysCount: 1,
        dayCountType: 'CALENDAR',
        trigger: 'CUSTOM',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('should validate rule without trigger date', async () => {
      (deadlineDomainService.validateRule as any).mockReturnValue({
        isValid: true,
        errors: [],
        computedDueDate: null,
      });

      const result = await caller.validateDeadlineRule({
        name: 'Motion Response',
        daysCount: 30,
        dayCountType: 'CALENDAR',
        trigger: 'MOTION_FILED',
      });

      expect(result.isValid).toBe(true);
      expect(result.computedDueDate).toBeNull();
    });
  });

  // ===========================================================================
  // getEvents - additional coverage
  // ===========================================================================
  describe('getEvents - additional coverage', () => {
    it('should aggregate document events into timeline', async () => {
      const mockDocument = {
        id: 'doc-1',
        title: 'Contract.pdf',
        description: 'Main contract document',
        createdAt: new Date('2025-01-10'),
        updatedAt: new Date('2025-01-11'),
        createdBy: TEST_UUIDS.user1,
        updatedBy: TEST_UUIDS.user1,
        mimeType: 'application/pdf',
        versionMajor: 1,
        versionMinor: 0,
        versionPatch: 0,
        classification: 'CONFIDENTIAL',
        documentType: 'CONTRACT',
        status: 'ACTIVE',
        deletedAt: null,
        parentVersionId: null,
        relatedCaseId: TEST_UUIDS.opportunity1,
      };

      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLogEntry.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([mockDocument as any]);

      const result = await caller.getEvents({
        eventTypes: ['document'],
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        id: 'document-doc-1',
        type: 'document',
        title: 'Contract.pdf',
        entityType: 'document',
        entityId: 'doc-1',
      });
      expect(result.events[0].document).toMatchObject({
        documentId: 'doc-1',
        filename: 'Contract.pdf',
        version: 1,
        mimeType: 'application/pdf',
      });
    });

    it('should aggregate document version events when parent_version_id exists', async () => {
      const versionedDoc = {
        id: 'doc-v2',
        title: 'Contract.pdf',
        description: 'Updated contract',
        createdAt: new Date('2025-01-10'),
        updatedAt: new Date('2025-01-15'),
        createdBy: TEST_UUIDS.user1,
        updatedBy: TEST_UUIDS.user2,
        mimeType: 'application/pdf',
        versionMajor: 2,
        versionMinor: 0,
        versionPatch: 1,
        classification: 'CONFIDENTIAL',
        documentType: 'CONTRACT',
        status: 'ACTIVE',
        deletedAt: null,
        parentVersionId: 'doc-1',
        relatedCaseId: TEST_UUIDS.opportunity1,
      };

      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLogEntry.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([versionedDoc as any]);

      const result = await caller.getEvents({
        eventTypes: ['document', 'document_version'],
      });

      // Should have both document and document_version events
      expect(result.events).toHaveLength(2);
      const docEvent = result.events.find((e) => e.type === 'document');
      const versionEvent = result.events.find((e) => e.type === 'document_version');

      expect(docEvent).toBeDefined();
      expect(versionEvent).toBeDefined();
      expect(versionEvent!.title).toContain('Version 2.0.1');
    });

    it('should aggregate audit log entries with stage_change type', async () => {
      const auditLog = {
        id: 'audit-1',
        tenantId: TEST_UUIDS.tenant,
        eventType: 'OpportunityStageChanged',
        actionReason: 'Stage progressed by sales rep',
        timestamp: new Date('2025-01-12'),
        resourceType: 'Opportunity',
        resourceId: TEST_UUIDS.opportunity1,
        actorId: TEST_UUIDS.user1,
        actorEmail: 'test@example.com',
        actorType: 'USER',
        beforeState: { stage: 'QUALIFICATION' },
        afterState: { stage: 'PROPOSAL' },
        ipAddress: '192.168.1.1',
      };

      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLogEntry.findMany.mockResolvedValue([auditLog as any]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({
        eventTypes: ['stage_change'],
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('stage_change');
      expect(result.events[0].title).toBe('OpportunityStageChanged');
      expect(result.events[0].actor).toMatchObject({
        id: TEST_UUIDS.user1,
        email: 'test@example.com',
        isAgent: false,
      });
      expect(result.events[0].metadata).toMatchObject({
        oldValue: { stage: 'QUALIFICATION' },
        newValue: { stage: 'PROPOSAL' },
      });
    });

    it('should handle audit entries with status_change type', async () => {
      const auditLog = {
        id: 'audit-2',
        eventType: 'CaseStatusUpdated',
        actionReason: null,
        timestamp: new Date(),
        resourceType: 'Case',
        resourceId: TEST_UUIDS.opportunity1,
        actorId: null,
        actorEmail: null,
        actorType: 'SYSTEM',
        beforeState: null,
        afterState: null,
        ipAddress: null,
      };

      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLogEntry.findMany.mockResolvedValue([auditLog as any]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({
        eventTypes: ['status_change'],
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('status_change');
      expect(result.events[0].actor).toBeNull();
    });

    it('should handle audit entries with AI_AGENT actor type', async () => {
      const aiAuditLog = {
        id: 'audit-ai',
        eventType: 'GenericAuditEvent',
        actionReason: 'Auto-scored by AI',
        timestamp: new Date(),
        resourceType: 'Lead',
        resourceId: 'lead-123',
        actorId: 'ai-agent-1',
        actorEmail: null,
        actorType: 'AI_AGENT',
        beforeState: null,
        afterState: null,
        ipAddress: null,
      };

      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLogEntry.findMany.mockResolvedValue([aiAuditLog as any]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({
        eventTypes: ['audit'],
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].actor!.isAgent).toBe(true);
    });

    it('should filter events by date range', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLogEntry.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      await caller.getEvents({
        fromDate: new Date('2025-01-01'),
        toDate: new Date('2025-01-31'),
      });

      // Verify date filters were applied to task query
      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                createdAt: { gte: new Date('2025-01-01'), lte: new Date('2025-01-31') },
              }),
            ]),
          }),
        })
      );
    });

    it('should filter events by search term', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLogEntry.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      await caller.getEvents({
        search: 'follow up',
      });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                title: { contains: 'follow up', mode: 'insensitive' },
              }),
            ]),
          }),
        })
      );
    });

    it('should sort events ascending when sortOrder is asc', async () => {
      const futureBase = new Date();
      futureBase.setMonth(futureBase.getMonth() + 1);

      const tasks = [
        {
          ...mockTask,
          id: 'task-a',
          dueDate: new Date(futureBase.getTime() + 3 * 24 * 60 * 60 * 1000),
          createdAt: new Date('2024-03-01'),
          owner: mockUser,
        },
        {
          ...mockTask,
          id: 'task-b',
          dueDate: new Date(futureBase.getTime() + 1 * 24 * 60 * 60 * 1000),
          createdAt: new Date('2024-01-01'),
          owner: mockUser,
        },
      ];

      prismaMock.task.findMany.mockResolvedValue(tasks);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLogEntry.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({ sortOrder: 'asc' });

      // In ascending order, the earlier due date should come first
      expect(result.events[0].id).toBe('task-task-b');
      expect(result.events[1].id).toBe('task-task-a');
    });

    it('should exclude completed/cancelled tasks when includeCompleted is false', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLogEntry.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      await caller.getEvents({ includeCompleted: false });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          }),
        })
      );
    });

    it('should filter by contactId', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLogEntry.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      await caller.getEvents({ contactId: TEST_UUIDS.contact1 });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contactId: TEST_UUIDS.contact1,
          }),
        })
      );
    });

    it('should handle agent action with various payload statuses', async () => {
      const agentEvent = {
        id: 'event-approved',
        tenantId: TEST_UUIDS.tenant,
        eventType: 'AgentActionApproved',
        aggregateType: 'Opportunity',
        aggregateId: TEST_UUIDS.opportunity1,
        payload: {
          actionName: 'Update Stage',
          agentName: 'Pipeline AI',
          confidence: 0.95,
          status: 'approved',
          proposedChanges: { stage: 'CLOSING' },
          priority: 'HIGH',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        metadata: { source: 'pipeline-agent' },
        occurredAt: new Date(),
        processedAt: null,
        status: 'PROCESSED' as const,
        publishedAt: null,
        retryCount: 0,
        nextRetryAt: null,
        lastError: null,
      };

      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLogEntry.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([agentEvent]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({ eventTypes: ['agent_action'] });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].agentAction!.status).toBe('approved');
      expect(result.events[0].agentAction!.confidence).toBe(0.95);
      expect(result.events[0].priority).toBe('high');
      expect(result.events[0].metadata).toMatchObject({ source: 'pipeline-agent' });
    });

    it('should handle tasks without owner', async () => {
      const taskNoOwner = {
        ...mockTask,
        owner: null,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      prismaMock.task.findMany.mockResolvedValue([taskNoOwner]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLogEntry.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({});

      expect(result.events).toHaveLength(1);
      expect(result.events[0].actor).toBeNull();
    });

    it('should use caseId as effectiveOpportunityId', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLogEntry.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      await caller.getEvents({ caseId: 'case-id-123' });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            opportunityId: 'case-id-123',
          }),
        })
      );
    });
  });

  // ===========================================================================
  // getStats - additional coverage
  // ===========================================================================
  describe('getStats - additional coverage', () => {
    it('should return stats with opportunityId including appointments and documents', async () => {
      // getStats calls task.count 3 times concurrently in Promise.all; distinguish by args
      (prismaMock.task.count as any).mockImplementation(
        (args?: { where?: { status?: unknown; dueDate?: unknown } }) => {
          if (args?.where?.dueDate) return Promise.resolve(1); // overdue
          if (args?.where?.status === 'COMPLETED') return Promise.resolve(2); // completed
          return Promise.resolve(5); // total
        }
      );
      prismaMock.appointment.count.mockResolvedValue(3);
      prismaMock.domainEvent.count.mockResolvedValue(2);
      prismaMock.caseDocument.count.mockResolvedValue(10);

      const result = await caller.getStats({
        opportunityId: TEST_UUIDS.opportunity1,
      });

      expect(result.tasks.total).toBe(5);
      expect(result.tasks.completed).toBe(2);
      expect(result.tasks.overdue).toBe(1);
      expect(result.tasks.pending).toBe(3);
      expect(result.appointments.upcoming).toBe(3);
      expect(result.documents.total).toBe(10);
      expect(result.agentActions.pendingApproval).toBe(2);
    });

    it('should use caseId for stats filtering', async () => {
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.appointment.count.mockResolvedValue(0);
      prismaMock.domainEvent.count.mockResolvedValue(0);
      prismaMock.caseDocument.count.mockResolvedValue(0);

      await caller.getStats({ caseId: 'case-stats-123' });

      expect(prismaMock.task.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            opportunityId: 'case-stats-123',
          }),
        })
      );
    });
  });

  // ===========================================================================
  // getUpcomingDeadlines - additional coverage
  // ===========================================================================
  describe('getUpcomingDeadlines - additional coverage', () => {
    it('should filter by opportunityId', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);

      await caller.getUpcomingDeadlines({
        opportunityId: TEST_UUIDS.opportunity1,
        daysAhead: 14,
      });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            opportunityId: TEST_UUIDS.opportunity1,
          }),
        })
      );
    });

    it('should skip tasks without dueDate', async () => {
      const taskNoDueDate = {
        ...mockTask,
        dueDate: null,
        status: 'PENDING' as const,
      };

      prismaMock.task.findMany.mockResolvedValue([taskNoDueDate]);
      prismaMock.appointment.findMany.mockResolvedValue([]);

      const result = await caller.getUpcomingDeadlines({ daysAhead: 7 });

      // Task without dueDate should be skipped
      expect(result.deadlines).toHaveLength(0);
    });

    it('should filter appointments by linked cases when opportunityId provided', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);

      await caller.getUpcomingDeadlines({
        caseId: 'linked-case-id',
        daysAhead: 7,
      });

      expect(prismaMock.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            linkedCases: {
              some: { caseId: 'linked-case-id' },
            },
          }),
        })
      );
    });
  });

  // ===========================================================================
  // getPendingAgentActions - additional coverage
  // ===========================================================================
  describe('getPendingAgentActions - additional coverage', () => {
    it('should handle events with minimal payload', async () => {
      const minimalEvent = {
        id: 'event-minimal',
        tenantId: TEST_UUIDS.tenant,
        eventType: 'AgentActionProposed',
        aggregateType: 'Lead',
        aggregateId: 'lead-123',
        payload: {}, // No payload data
        metadata: null,
        occurredAt: new Date(),
        processedAt: null,
        status: 'PENDING' as const,
        publishedAt: null,
        retryCount: 0,
        nextRetryAt: null,
        lastError: null,
      };

      prismaMock.domainEvent.findMany.mockResolvedValue([minimalEvent]);

      const result = await caller.getPendingAgentActions({});

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]).toMatchObject({
        agentName: 'AI Assistant', // default
        title: 'Agent Action: AgentActionProposed', // fallback title
        description: null,
        confidence: 0.85, // default
        proposedChanges: null,
        expiresAt: null,
      });
    });

    it('should use caseId for filtering', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);

      await caller.getPendingAgentActions({
        caseId: 'case-filter-id',
      });

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            aggregateId: 'case-filter-id',
          }),
        })
      );
    });

    it('should use opportunityId for filtering', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);

      await caller.getPendingAgentActions({
        opportunityId: 'opp-id-123',
      });

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            aggregateId: 'opp-id-123',
          }),
        })
      );
    });
  });
});
