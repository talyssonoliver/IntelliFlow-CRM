import { TEST_UUIDS } from '../../../test/setup';
/**
 * Task Router Tests
 *
 * Comprehensive tests for all task router procedures:
 * - create, getById, list, update, delete, complete, stats
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { taskRouter } from '../task.router';
import { prismaMock, createTestContext, mockTask, mockLead, mockContact, mockOpportunity, mockUser } from '../../../test/setup';

describe('Task Router', () => {
  const caller = taskRouter.createCaller(createTestContext());

  beforeEach(() => {
    // Reset is handled by setup.ts
  });

  describe('create', () => {
    it('should create a new task with valid input', async () => {
      const input = {
        title: 'Call prospect',
        description: 'Discuss pricing options',
        priority: 'HIGH' as const,
        status: 'PENDING' as const,
        dueDate: new Date('2025-01-15'),
        leadId: TEST_UUIDS.lead1,
      };

      prismaMock.lead.findUnique.mockResolvedValue(mockLead);
      prismaMock.task.create.mockResolvedValue({
        ...mockTask,
        ...input,
      });

      const result = await caller.create(input);

      expect(result.title).toBe(input.title);
      expect(prismaMock.task.create).toHaveBeenCalledWith({
        data: {
          ...input,
          ownerId: TEST_UUIDS.user1,
        },
      });
    });

    it('should throw NOT_FOUND if leadId does not exist', async () => {
      const input = {
        title: 'Task',
        priority: 'MEDIUM' as const,
        dueDate: new Date(),
        leadId: TEST_UUIDS.nonExistent,
      };

      prismaMock.lead.findUnique.mockResolvedValue(null);

      await expect(caller.create(input)).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Lead'),
        })
      );
    });

    it('should throw NOT_FOUND if contactId does not exist', async () => {
      const input = {
        title: 'Task',
        priority: 'MEDIUM' as const,
        dueDate: new Date(),
        contactId: TEST_UUIDS.nonExistent,
      };

      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(caller.create(input)).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Contact'),
        })
      );
    });

    it('should throw NOT_FOUND if opportunityId does not exist', async () => {
      const input = {
        title: 'Task',
        priority: 'MEDIUM' as const,
        dueDate: new Date(),
        opportunityId: TEST_UUIDS.nonExistent,
      };

      prismaMock.opportunity.findUnique.mockResolvedValue(null);

      await expect(caller.create(input)).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Opportunity'),
        })
      );
    });

    it('should create task without entity associations', async () => {
      const input = {
        title: 'General task',
        priority: 'LOW' as const,
        dueDate: new Date(),
      };

      prismaMock.task.create.mockResolvedValue({
        ...mockTask,
        ...input,
        leadId: null,
        contactId: null,
        opportunityId: null,
      });

      const result = await caller.create(input);

      expect(result.title).toBe(input.title);
    });
  });

  describe('getById', () => {
    it('should return task with related data', async () => {
      const taskWithRelations = {
        ...mockTask,
        owner: mockUser,
        lead: mockLead,
        contact: mockContact,
        opportunity: mockOpportunity,
      };

      prismaMock.task.findUnique.mockResolvedValue(taskWithRelations);

      const result = await caller.getById({ id: TEST_UUIDS.task1 });

      expect(result).toMatchObject(taskWithRelations);
      expect(prismaMock.task.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_UUIDS.task1 },
        include: expect.objectContaining({
          owner: expect.any(Object),
          lead: expect.any(Object),
          contact: expect.any(Object),
          opportunity: expect.any(Object),
        }),
      });
    });

    it('should throw NOT_FOUND for non-existent task', async () => {
      prismaMock.task.findUnique.mockResolvedValue(null);

      await expect(caller.getById({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('list', () => {
    it('should list tasks with pagination', async () => {
      const tasks = [mockTask, { ...mockTask, id: 'task-2', title: 'Task 2' }];
      const tasksWithRelations = tasks.map(task => ({
        ...task,
        owner: mockUser,
        lead: mockLead,
        contact: null,
        opportunity: null,
      }));

      prismaMock.task.findMany.mockResolvedValue(tasksWithRelations);
      prismaMock.task.count.mockResolvedValue(40);

      const result = await caller.list({ page: 1, limit: 20 });

      expect(result.tasks).toHaveLength(2);
      expect(result.total).toBe(40);
      expect(result.hasMore).toBe(true);
    });

    it('should filter tasks by status', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);

      await caller.list({ status: ['PENDING', 'IN_PROGRESS'] });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          }),
        })
      );
    });

    it('should filter tasks by priority', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);

      await caller.list({ priority: ['HIGH', 'URGENT'] });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: { in: ['HIGH', 'URGENT'] },
          }),
        })
      );
    });

    it('should filter overdue tasks', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);

      await caller.list({ overdue: true });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dueDate: { lt: expect.any(Date) },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          }),
        })
      );
    });

    it('should filter tasks by due date range', async () => {
      const dueDateFrom = new Date('2025-01-01');
      const dueDateTo = new Date('2025-01-31');

      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);

      await caller.list({ dueDateFrom, dueDateTo });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dueDate: { gte: dueDateFrom, lte: dueDateTo },
          }),
        })
      );
    });

    it('should search tasks by text', async () => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);

      await caller.list({ search: 'follow up' });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { title: { contains: 'follow up', mode: 'insensitive' } },
              { description: { contains: 'follow up', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });
  });

  describe('update', () => {
    it('should update task with valid data', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);

      const updated = { ...mockTask, status: 'IN_PROGRESS' as const, priority: 'URGENT' as const };
      prismaMock.task.update.mockResolvedValue(updated);

      const result = await caller.update({
        id: TEST_UUIDS.task1,
        status: 'IN_PROGRESS',
        priority: 'URGENT',
      });

      expect(result.status).toBe('IN_PROGRESS');
      expect(result.priority).toBe('URGENT');
    });

    it('should throw NOT_FOUND when updating non-existent task', async () => {
      prismaMock.task.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({ id: TEST_UUIDS.nonExistent, title: 'Updated' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should validate lead exists when updating leadId', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);
      prismaMock.lead.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({ id: TEST_UUIDS.task1, leadId: TEST_UUIDS.nonExistent })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Lead'),
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete an existing task', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);
      prismaMock.task.delete.mockResolvedValue(mockTask);

      const result = await caller.delete({ id: TEST_UUIDS.task1 });

      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.task1);
    });

    it('should throw NOT_FOUND for non-existent task', async () => {
      prismaMock.task.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('complete', () => {
    it('should mark task as completed', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);

      const completed = {
        ...mockTask,
        status: 'COMPLETED' as const,
        completedAt: new Date(),
      };
      prismaMock.task.update.mockResolvedValue(completed);

      const result = await caller.complete({ taskId: TEST_UUIDS.task1 });

      expect(result.status).toBe('COMPLETED');
      expect(result.completedAt).toBeDefined();
      expect(prismaMock.task.update).toHaveBeenCalledWith({
        where: { id: TEST_UUIDS.task1 },
        data: {
          status: 'COMPLETED',
          completedAt: expect.any(Date),
        },
      });
    });

    it('should throw NOT_FOUND for non-existent task', async () => {
      prismaMock.task.findUnique.mockResolvedValue(null);

      await expect(caller.complete({ taskId: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should throw BAD_REQUEST if task already completed', async () => {
      const completedTask = {
        ...mockTask,
        status: 'COMPLETED' as const,
        completedAt: new Date(),
      };
      prismaMock.task.findUnique.mockResolvedValue(completedTask);

      await expect(caller.complete({ taskId: TEST_UUIDS.task1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('already completed'),
        })
      );
    });
  });

  describe('stats', () => {
    it('should return task statistics', async () => {
      prismaMock.task.count.mockResolvedValueOnce(100); // total
      vi.mocked(prismaMock.task.groupBy).mockResolvedValueOnce([
        { status: 'PENDING', _count: 40 },
        { status: 'IN_PROGRESS', _count: 20 },
        { status: 'COMPLETED', _count: 30 },
      ] as unknown as Awaited<ReturnType<typeof prismaMock.task.groupBy>>);
      vi.mocked(prismaMock.task.groupBy).mockResolvedValueOnce([
        { priority: 'HIGH', _count: 25 },
        { priority: 'MEDIUM', _count: 50 },
        { priority: 'LOW', _count: 25 },
      ] as unknown as Awaited<ReturnType<typeof prismaMock.task.groupBy>>);
      prismaMock.task.count.mockResolvedValueOnce(10); // overdue
      prismaMock.task.count.mockResolvedValueOnce(5); // dueToday

      const result = await caller.stats();

      expect(result.total).toBe(100);
      expect(result.byStatus).toEqual({
        PENDING: 40,
        IN_PROGRESS: 20,
        COMPLETED: 30,
      });
      expect(result.byPriority).toEqual({
        HIGH: 25,
        MEDIUM: 50,
        LOW: 25,
      });
      expect(result.overdue).toBe(10);
      expect(result.dueToday).toBe(5);
    });

    it('should handle empty statistics', async () => {
      prismaMock.task.count.mockResolvedValue(0);
      vi.mocked(prismaMock.task.groupBy).mockResolvedValue([]);

      const result = await caller.stats();

      expect(result.total).toBe(0);
      expect(result.byStatus).toEqual({});
      expect(result.byPriority).toEqual({});
      expect(result.overdue).toBe(0);
      expect(result.dueToday).toBe(0);
    });
  });
});
