/**
 * Timeline Router Tests
 *
 * Comprehensive tests for the unified timeline API:
 * - getEvents: Unified timeline with aggregated events
 * - getStats: Timeline statistics
 * - getUpcomingDeadlines: Upcoming tasks and appointments
 * - getPendingAgentActions: AI actions pending approval
 *
 * Task: IFC-159 - Timeline Enrichment
 * KPIs: Response <1s, unified chronological ordering, permissions enforced
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { timelineRouter } from '../timeline.router';
import {
  prismaMock,
  createTestContext,
  TEST_UUIDS,
  mockTask,
  mockUser,
} from '../../../test/setup';

describe('Timeline Router', () => {
  const ctx = createTestContext();
  const caller = timelineRouter.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEvents', () => {
    it('should return empty events when no data exists', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({});

      expect(result.events).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.hasMore).toBe(false);
      expect(result.queryDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should aggregate tasks into timeline events', async () => {
      // Create a task with a future due date so it's not marked as overdue
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const taskWithOwner = {
        ...mockTask,
        dueDate: futureDate,
        owner: mockUser,
      };

      prismaMock.task.findMany.mockResolvedValue([taskWithOwner]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({});

      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        id: `task-${mockTask.id}`,
        type: 'task',
        title: mockTask.title,
        entityType: 'task',
        entityId: mockTask.id,
      });
      expect(result.events[0].task).toMatchObject({
        taskId: mockTask.id,
        status: mockTask.status,
      });
      expect(result.events[0].actor).toMatchObject({
        id: mockUser.id,
        name: mockUser.name,
        email: mockUser.email,
      });
    });

    it('should mark overdue tasks correctly', async () => {
      const overdueDate = new Date();
      overdueDate.setDate(overdueDate.getDate() - 7); // 7 days ago

      const overdueTask = {
        ...mockTask,
        dueDate: overdueDate,
        status: 'PENDING' as const,
        owner: mockUser,
      };

      prismaMock.task.findMany.mockResolvedValue([overdueTask]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({});

      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('task_overdue');
      expect(result.events[0].isOverdue).toBe(true);
    });

    it('should mark completed tasks correctly', async () => {
      const completedTask = {
        ...mockTask,
        status: 'COMPLETED' as const,
        completedAt: new Date(),
        owner: mockUser,
      };

      prismaMock.task.findMany.mockResolvedValue([completedTask]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({ includeCompleted: true });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('task_completed');
    });

    it('should filter by event types', async () => {
      // Create a task with a future due date so it's marked as 'task' not 'task_overdue'
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const taskWithOwner = {
        ...mockTask,
        dueDate: futureDate,
        owner: mockUser,
      };

      prismaMock.task.findMany.mockResolvedValue([taskWithOwner]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({
        eventTypes: ['task'],
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('task');
    });

    it('should exclude specified event types', async () => {
      const taskWithOwner = {
        ...mockTask,
        owner: mockUser,
      };

      prismaMock.task.findMany.mockResolvedValue([taskWithOwner]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({
        excludeTypes: ['task', 'task_overdue', 'task_completed'],
      });

      expect(result.events).toHaveLength(0);
    });

    it('should filter by dealId/opportunityId', async () => {
      const taskWithOwner = {
        ...mockTask,
        opportunityId: TEST_UUIDS.opportunity1,
        owner: mockUser,
      };

      prismaMock.task.findMany.mockResolvedValue([taskWithOwner]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({
        dealId: TEST_UUIDS.opportunity1,
      });

      expect(result.events).toHaveLength(1);
      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            opportunityId: TEST_UUIDS.opportunity1,
          }),
        })
      );
    });

    it('should filter by priority', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      await caller.getEvents({
        priorities: ['high', 'urgent'],
      });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: { in: ['HIGH', 'URGENT'] },
          }),
        })
      );
    });

    it('should paginate results correctly', async () => {
      const tasks = Array.from({ length: 15 }, (_, i) => ({
        ...mockTask,
        id: `task-${i}`,
        title: `Task ${i}`,
        createdAt: new Date(2024, 0, i + 1),
        owner: mockUser,
      }));

      prismaMock.task.findMany.mockResolvedValue(tasks);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({
        page: 1,
        limit: 10,
      });

      expect(result.events).toHaveLength(10);
      expect(result.total).toBe(15);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it('should sort events by date descending by default', async () => {
      // Create tasks with different due dates and future dates to avoid overdue status
      const futureBase = new Date();
      futureBase.setMonth(futureBase.getMonth() + 1);

      const tasks = [
        { ...mockTask, id: 'task-1', dueDate: new Date(futureBase.getTime() + 1 * 24 * 60 * 60 * 1000), createdAt: new Date('2024-01-01'), owner: mockUser },
        { ...mockTask, id: 'task-2', dueDate: new Date(futureBase.getTime() + 2 * 24 * 60 * 60 * 1000), createdAt: new Date('2024-02-01'), owner: mockUser },
        { ...mockTask, id: 'task-3', dueDate: new Date(futureBase.getTime() + 3 * 24 * 60 * 60 * 1000), createdAt: new Date('2024-03-01'), owner: mockUser },
      ];

      prismaMock.task.findMany.mockResolvedValue(tasks);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({ sortOrder: 'desc' });

      // Since dueDate is used for timestamp in 'task' events, task-3 has the latest dueDate
      expect(result.events[0].id).toBe('task-task-3');
      expect(result.events[2].id).toBe('task-task-1');
    });

    it('should aggregate appointments into timeline events', async () => {
      const appointment = {
        id: 'apt-1',
        title: 'Client Meeting',
        description: 'Discuss proposal',
        startTime: new Date('2024-06-01T10:00:00Z'),
        endTime: new Date('2024-06-01T11:00:00Z'),
        appointmentType: 'MEETING' as const,
        location: 'Conference Room A',
        status: 'SCHEDULED' as const,
        organizerId: TEST_UUIDS.user1,
        bufferMinutesBefore: 15,
        bufferMinutesAfter: 0,
        recurrence: null,
        parentAppointmentId: null,
        externalCalendarId: null,
        reminderMinutes: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
        cancelledAt: null,
        completedAt: null,
        cancellationReason: null,
        notes: null,
      };

      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([appointment]);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({});

      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        id: 'appointment-apt-1',
        type: 'appointment',
        title: 'Client Meeting',
        entityType: 'appointment',
      });
      expect(result.events[0].appointment).toMatchObject({
        appointmentId: 'apt-1',
        appointmentType: 'MEETING',
        location: 'Conference Room A',
        status: 'SCHEDULED',
      });
    });

    it('should aggregate agent actions from domain events', async () => {
      const agentEvent = {
        id: 'event-1',
        eventType: 'AgentActionProposed',
        aggregateType: 'Opportunity',
        aggregateId: TEST_UUIDS.opportunity1,
        payload: {
          actionName: 'Update Deal Stage',
          agentName: 'Sales Assistant AI',
          confidence: 0.92,
          status: 'pending',
          proposedChanges: { stage: 'NEGOTIATION' },
        },
        metadata: null,
        occurredAt: new Date(),
        processedAt: null,
        status: 'PENDING' as const,
      };

      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([agentEvent]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({ eventTypes: ['agent_action'] });

      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        id: 'agent-event-1',
        type: 'agent_action',
        title: 'Update Deal Stage',
      });
      expect(result.events[0].agentAction).toMatchObject({
        actionId: 'event-1',
        agentName: 'Sales Assistant AI',
        confidence: 0.92,
        status: 'pending_approval',
      });
      expect(result.events[0].actor?.isAgent).toBe(true);
    });

    it('should return response within KPI target (<1s)', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      const result = await caller.getEvents({});

      expect(result.queryDurationMs).toBeLessThan(1000);
    });
  });

  describe('getStats', () => {
    it('should return correct task statistics', async () => {
      prismaMock.task.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(5) // completed
        .mockResolvedValueOnce(2); // overdue
      // Note: appointment.count is only called when effectiveOpportunityId is provided
      // When no opportunityId, it returns Promise.resolve(0)
      prismaMock.appointment.count.mockResolvedValue(3);
      prismaMock.domainEvent.count.mockResolvedValue(1);

      const result = await caller.getStats({});

      expect(result.tasks).toEqual({
        total: 10,
        completed: 5,
        overdue: 2,
        pending: 5,
      });
      // When no opportunityId is provided, upcoming appointments is 0 (not fetched)
      expect(result.appointments.upcoming).toBe(0);
      expect(result.agentActions.pendingApproval).toBe(1);
    });

    it('should filter by dealId', async () => {
      prismaMock.task.count.mockResolvedValue(0);
      prismaMock.appointment.count.mockResolvedValue(0);
      prismaMock.domainEvent.count.mockResolvedValue(0);

      await caller.getStats({ dealId: TEST_UUIDS.opportunity1 });

      expect(prismaMock.task.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            opportunityId: TEST_UUIDS.opportunity1,
          }),
        })
      );
    });
  });

  describe('getUpcomingDeadlines', () => {
    it('should return tasks with upcoming due dates', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const upcomingTask = {
        ...mockTask,
        dueDate: tomorrow,
        status: 'PENDING' as const,
      };

      prismaMock.task.findMany.mockResolvedValue([upcomingTask]);
      prismaMock.appointment.findMany.mockResolvedValue([]);

      const result = await caller.getUpcomingDeadlines({
        daysAhead: 7,
        limit: 10,
      });

      expect(result.deadlines).toHaveLength(1);
      expect(result.deadlines[0]).toMatchObject({
        id: `task-${mockTask.id}`,
        type: 'task',
        title: mockTask.title,
      });
      expect(result.deadlines[0].isOverdue).toBe(false);
    });

    it('should include upcoming appointments', async () => {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 3);

      const appointment = {
        id: 'apt-1',
        title: 'Team Meeting',
        startTime: nextWeek,
        status: 'SCHEDULED' as const,
      };

      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.appointment.findMany.mockResolvedValue([appointment as any]);

      const result = await caller.getUpcomingDeadlines({
        daysAhead: 7,
        limit: 10,
      });

      expect(result.deadlines).toHaveLength(1);
      expect(result.deadlines[0]).toMatchObject({
        id: 'appointment-apt-1',
        type: 'appointment',
        title: 'Team Meeting',
      });
    });

    it('should sort deadlines by date ascending', async () => {
      const day1 = new Date();
      day1.setDate(day1.getDate() + 1);
      const day3 = new Date();
      day3.setDate(day3.getDate() + 3);

      const tasks = [
        { ...mockTask, id: 'task-1', title: 'Later Task', dueDate: day3, status: 'PENDING' as const },
        { ...mockTask, id: 'task-2', title: 'Earlier Task', dueDate: day1, status: 'PENDING' as const },
      ];

      prismaMock.task.findMany.mockResolvedValue(tasks);
      prismaMock.appointment.findMany.mockResolvedValue([]);

      const result = await caller.getUpcomingDeadlines({ daysAhead: 7 });

      expect(result.deadlines[0].title).toBe('Earlier Task');
      expect(result.deadlines[1].title).toBe('Later Task');
    });

    it('should respect limit parameter', async () => {
      const tasks = Array.from({ length: 20 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() + i);
        return {
          ...mockTask,
          id: `task-${i}`,
          title: `Task ${i}`,
          dueDate: date,
          status: 'PENDING' as const,
        };
      });

      prismaMock.task.findMany.mockResolvedValue(tasks);
      prismaMock.appointment.findMany.mockResolvedValue([]);

      const result = await caller.getUpcomingDeadlines({
        daysAhead: 30,
        limit: 5,
      });

      expect(result.deadlines).toHaveLength(5);
    });
  });

  describe('getPendingAgentActions', () => {
    it('should return agent actions with pending status', async () => {
      const agentEvent = {
        id: 'event-1',
        eventType: 'AgentActionProposed',
        aggregateType: 'Opportunity',
        aggregateId: TEST_UUIDS.opportunity1,
        payload: {
          actionName: 'Send Follow-up Email',
          agentName: 'Email Assistant AI',
          description: 'Follow up with client about proposal',
          confidence: 0.88,
          proposedChanges: { emailContent: 'Dear...' },
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        metadata: null,
        occurredAt: new Date(),
        processedAt: null,
        status: 'PENDING' as const,
      };

      prismaMock.domainEvent.findMany.mockResolvedValue([agentEvent]);

      const result = await caller.getPendingAgentActions({});

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]).toMatchObject({
        id: 'event-1',
        actionId: 'event-1',
        agentName: 'Email Assistant AI',
        title: 'Send Follow-up Email',
        confidence: 0.88,
      });
      expect(result.actions[0].proposedChanges).toEqual({ emailContent: 'Dear...' });
    });

    it('should filter by dealId', async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.caseDocument.findMany.mockResolvedValue([]);

      await caller.getPendingAgentActions({
        dealId: TEST_UUIDS.opportunity1,
      });

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            aggregateId: TEST_UUIDS.opportunity1,
          }),
        })
      );
    });

    it('should respect limit parameter', async () => {
      const events = Array.from({ length: 20 }, (_, i) => ({
        id: `event-${i}`,
        eventType: 'AgentActionProposed',
        aggregateType: 'Opportunity',
        aggregateId: TEST_UUIDS.opportunity1,
        payload: { actionName: `Action ${i}` },
        metadata: null,
        occurredAt: new Date(),
        processedAt: null,
        status: 'PENDING' as const,
      }));

      prismaMock.domainEvent.findMany.mockResolvedValue(events);

      const result = await caller.getPendingAgentActions({ limit: 5 });

      expect(prismaMock.domainEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      );
    });
  });
});
