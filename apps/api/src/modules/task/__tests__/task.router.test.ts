/**
 * Task Router Tests
 *
 * Comprehensive tests for task router procedures:
 * - create: Create a new task
 * - getById: Get a single task by ID
 * - list: List tasks with filtering and pagination
 * - update: Update a task
 * - delete: Delete a task
 * - complete: Mark a task as completed
 * - stats: Get task statistics
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { taskRouter } from '../task.router';
import {
  prismaMock,
  createTestContext,
  TEST_UUIDS,
  mockTask,
  mockUser,
  mockLead,
  mockContact,
  mockOpportunity,
} from '../../../test/setup';

describe('Task Router', () => {
  const caller = taskRouter.createCaller(createTestContext());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Mock task with relations
  const mockTaskWithRelations = {
    ...mockTask,
    owner: mockUser,
    lead: mockLead,
    contact: mockContact,
    opportunity: mockOpportunity,
  };

  describe('create', () => {
    it('should create a new task successfully', async () => {
      prismaMock.task.create.mockResolvedValue(mockTask);

      const result = await caller.create({
        title: 'Follow up call',
        description: 'Call the lead to discuss requirements',
        dueDate: new Date('2025-01-25'),
        priority: 'HIGH',
        status: 'PENDING',
      });

      expect(result.id).toBe(mockTask.id);
      expect(result.title).toBe(mockTask.title);
      expect(prismaMock.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Follow up call',
          ownerId: TEST_UUIDS.user1,
        }),
      });
    });

    it('should validate leadId if provided', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);
      prismaMock.task.create.mockResolvedValue({ ...mockTask, leadId: TEST_UUIDS.lead1 });

      const result = await caller.create({
        title: 'Follow up call',
        dueDate: new Date('2025-01-25'),
        priority: 'HIGH',
        leadId: TEST_UUIDS.lead1,
      });

      expect(result.leadId).toBe(TEST_UUIDS.lead1);
      expect(prismaMock.lead.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_UUIDS.lead1 },
      });
    });

    it('should throw NOT_FOUND if leadId is invalid', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(null);

      await expect(
        caller.create({
          title: 'Follow up call',
          dueDate: new Date('2025-01-25'),
          priority: 'HIGH',
          leadId: TEST_UUIDS.nonExistent,
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should validate contactId if provided', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(mockContact);
      prismaMock.task.create.mockResolvedValue({ ...mockTask, contactId: TEST_UUIDS.contact1 });

      const result = await caller.create({
        title: 'Meeting',
        dueDate: new Date('2025-01-25'),
        priority: 'MEDIUM',
        contactId: TEST_UUIDS.contact1,
      });

      expect(result.contactId).toBe(TEST_UUIDS.contact1);
    });

    it('should throw NOT_FOUND if contactId is invalid', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(
        caller.create({
          title: 'Meeting',
          dueDate: new Date('2025-01-25'),
          priority: 'MEDIUM',
          contactId: TEST_UUIDS.nonExistent,
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should validate opportunityId if provided', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(mockOpportunity);
      prismaMock.task.create.mockResolvedValue({
        ...mockTask,
        opportunityId: TEST_UUIDS.opportunity1,
      });

      const result = await caller.create({
        title: 'Proposal review',
        dueDate: new Date('2025-01-25'),
        priority: 'HIGH',
        opportunityId: TEST_UUIDS.opportunity1,
      });

      expect(result.opportunityId).toBe(TEST_UUIDS.opportunity1);
    });

    it('should throw NOT_FOUND if opportunityId is invalid', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(null);

      await expect(
        caller.create({
          title: 'Proposal review',
          dueDate: new Date('2025-01-25'),
          priority: 'HIGH',
          opportunityId: TEST_UUIDS.nonExistent,
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('getById', () => {
    it('should return task with relations', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTaskWithRelations);

      const result = await caller.getById({ id: TEST_UUIDS.task1 });

      expect(result.id).toBe(mockTask.id);
      expect(result.owner).toBeDefined();
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

      await expect(caller.getById({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(TRPCError);

      try {
        await caller.getById({ id: TEST_UUIDS.nonExistent });
      } catch (error) {
        expect((error as TRPCError).code).toBe('NOT_FOUND');
      }
    });
  });

  describe('list', () => {
    const mockTaskList = [mockTaskWithRelations, { ...mockTaskWithRelations, id: TEST_UUIDS.task2 }];

    it('should return paginated list of tasks', async () => {
      prismaMock.task.findMany.mockResolvedValue(mockTaskList);
      prismaMock.task.count.mockResolvedValue(2);

      const result = await caller.list({});

      expect(result.tasks).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by search term', async () => {
      prismaMock.task.findMany.mockResolvedValue([mockTaskWithRelations]);
      prismaMock.task.count.mockResolvedValue(1);

      await caller.list({ search: 'follow up' });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'follow up', mode: 'insensitive' } },
              { description: { contains: 'follow up', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('should filter by status', async () => {
      prismaMock.task.findMany.mockResolvedValue([mockTaskWithRelations]);
      prismaMock.task.count.mockResolvedValue(1);

      await caller.list({ status: ['PENDING', 'IN_PROGRESS'] });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          }),
        })
      );
    });

    it('should filter by priority', async () => {
      prismaMock.task.findMany.mockResolvedValue([mockTaskWithRelations]);
      prismaMock.task.count.mockResolvedValue(1);

      await caller.list({ priority: ['HIGH', 'URGENT'] });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: { in: ['HIGH', 'URGENT'] },
          }),
        })
      );
    });

    it('should filter by ownerId', async () => {
      prismaMock.task.findMany.mockResolvedValue([mockTaskWithRelations]);
      prismaMock.task.count.mockResolvedValue(1);

      await caller.list({ ownerId: TEST_UUIDS.user1 });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: TEST_UUIDS.user1,
          }),
        })
      );
    });

    it('should filter by leadId', async () => {
      prismaMock.task.findMany.mockResolvedValue([mockTaskWithRelations]);
      prismaMock.task.count.mockResolvedValue(1);

      await caller.list({ leadId: TEST_UUIDS.lead1 });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            leadId: TEST_UUIDS.lead1,
          }),
        })
      );
    });

    it('should filter by date range', async () => {
      prismaMock.task.findMany.mockResolvedValue(mockTaskList);
      prismaMock.task.count.mockResolvedValue(2);
      const dueDateFrom = new Date('2025-01-01');
      const dueDateTo = new Date('2025-01-31');

      await caller.list({ dueDateFrom, dueDateTo });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dueDate: {
              gte: dueDateFrom,
              lte: dueDateTo,
            },
          }),
        })
      );
    });

    it('should filter for overdue tasks', async () => {
      prismaMock.task.findMany.mockResolvedValue([mockTaskWithRelations]);
      prismaMock.task.count.mockResolvedValue(1);

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

    it('should support pagination', async () => {
      prismaMock.task.findMany.mockResolvedValue([mockTaskWithRelations]);
      prismaMock.task.count.mockResolvedValue(50);

      const result = await caller.list({ page: 2, limit: 10 });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (page - 1) * limit = (2-1) * 10
          take: 10,
        })
      );
      expect(result.hasMore).toBe(true);
    });

    it('should support sorting', async () => {
      prismaMock.task.findMany.mockResolvedValue(mockTaskList);
      prismaMock.task.count.mockResolvedValue(2);

      await caller.list({ sortBy: 'dueDate', sortOrder: 'asc' });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { dueDate: 'asc' },
        })
      );
    });
  });

  describe('update', () => {
    it('should update task successfully', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);
      prismaMock.task.update.mockResolvedValue({ ...mockTask, title: 'Updated title' });

      const result = await caller.update({
        id: TEST_UUIDS.task1,
        title: 'Updated title',
      });

      expect(result.title).toBe('Updated title');
      expect(prismaMock.task.update).toHaveBeenCalledWith({
        where: { id: TEST_UUIDS.task1 },
        data: expect.objectContaining({
          title: 'Updated title',
        }),
      });
    });

    it('should throw NOT_FOUND for non-existent task', async () => {
      prismaMock.task.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({
          id: TEST_UUIDS.nonExistent,
          title: 'Updated title',
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should validate leadId on update', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);
      prismaMock.lead.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({
          id: TEST_UUIDS.task1,
          leadId: TEST_UUIDS.nonExistent,
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should validate contactId on update', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({
          id: TEST_UUIDS.task1,
          contactId: TEST_UUIDS.nonExistent,
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should validate opportunityId on update', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);
      prismaMock.opportunity.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({
          id: TEST_UUIDS.task1,
          opportunityId: TEST_UUIDS.nonExistent,
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should allow setting leadId to valid lead', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);
      prismaMock.task.update.mockResolvedValue({ ...mockTask, leadId: TEST_UUIDS.lead1 });

      const result = await caller.update({
        id: TEST_UUIDS.task1,
        leadId: TEST_UUIDS.lead1,
      });

      expect(result.leadId).toBe(TEST_UUIDS.lead1);
    });
  });

  describe('delete', () => {
    it('should delete task successfully', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);
      prismaMock.task.delete.mockResolvedValue(mockTask);

      const result = await caller.delete({ id: TEST_UUIDS.task1 });

      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.task1);
      expect(prismaMock.task.delete).toHaveBeenCalledWith({
        where: { id: TEST_UUIDS.task1 },
      });
    });

    it('should throw NOT_FOUND for non-existent task', async () => {
      prismaMock.task.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(TRPCError);

      try {
        await caller.delete({ id: TEST_UUIDS.nonExistent });
      } catch (error) {
        expect((error as TRPCError).code).toBe('NOT_FOUND');
      }
    });
  });

  describe('complete', () => {
    it('should complete task successfully', async () => {
      prismaMock.task.findUnique.mockResolvedValue({ ...mockTask, status: 'IN_PROGRESS' });
      prismaMock.task.update.mockResolvedValue({
        ...mockTask,
        status: 'COMPLETED',
        completedAt: new Date(),
      });

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

      await expect(caller.complete({ taskId: TEST_UUIDS.nonExistent })).rejects.toThrow(TRPCError);

      try {
        await caller.complete({ taskId: TEST_UUIDS.nonExistent });
      } catch (error) {
        expect((error as TRPCError).code).toBe('NOT_FOUND');
      }
    });

    it('should throw BAD_REQUEST if task is already completed', async () => {
      prismaMock.task.findUnique.mockResolvedValue({ ...mockTask, status: 'COMPLETED' });

      await expect(caller.complete({ taskId: TEST_UUIDS.task1 })).rejects.toThrow(TRPCError);

      try {
        await caller.complete({ taskId: TEST_UUIDS.task1 });
      } catch (error) {
        expect((error as TRPCError).code).toBe('BAD_REQUEST');
        expect((error as TRPCError).message).toBe('Task is already completed');
      }
    });
  });

  describe('stats', () => {
    const mockStats = {
      total: 100,
      byStatus: [
        { status: 'PENDING', _count: 40 },
        { status: 'IN_PROGRESS', _count: 30 },
        { status: 'COMPLETED', _count: 25 },
        { status: 'CANCELLED', _count: 5 },
      ],
      byPriority: [
        { priority: 'LOW', _count: 20 },
        { priority: 'MEDIUM', _count: 35 },
        { priority: 'HIGH', _count: 30 },
        { priority: 'URGENT', _count: 15 },
      ],
    };

    it('should return task statistics', async () => {
      prismaMock.task.count.mockResolvedValueOnce(mockStats.total); // total
      prismaMock.task.groupBy.mockResolvedValueOnce(mockStats.byStatus as never); // byStatus
      prismaMock.task.groupBy.mockResolvedValueOnce(mockStats.byPriority as never); // byPriority
      prismaMock.task.count.mockResolvedValueOnce(10); // overdue
      prismaMock.task.count.mockResolvedValueOnce(5); // dueToday

      const result = await caller.stats();

      expect(result.total).toBe(100);
      expect(result.byStatus).toEqual({
        PENDING: 40,
        IN_PROGRESS: 30,
        COMPLETED: 25,
        CANCELLED: 5,
      });
      expect(result.byPriority).toEqual({
        LOW: 20,
        MEDIUM: 35,
        HIGH: 30,
        URGENT: 15,
      });
      expect(result.overdue).toBe(10);
      expect(result.dueToday).toBe(5);
    });

    it('should count overdue tasks correctly', async () => {
      prismaMock.task.count.mockResolvedValueOnce(100);
      prismaMock.task.groupBy.mockResolvedValue([] as never);
      prismaMock.task.count.mockResolvedValueOnce(15); // overdue
      prismaMock.task.count.mockResolvedValueOnce(3); // dueToday

      await caller.stats();

      // Check that overdue count query has the right filters
      expect(prismaMock.task.count).toHaveBeenCalledWith({
        where: {
          dueDate: { lt: expect.any(Date) },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      });
    });

    it('should count due today tasks correctly', async () => {
      prismaMock.task.count.mockResolvedValueOnce(100);
      prismaMock.task.groupBy.mockResolvedValue([] as never);
      prismaMock.task.count.mockResolvedValueOnce(10); // overdue
      prismaMock.task.count.mockResolvedValueOnce(8); // dueToday

      await caller.stats();

      // Check that dueToday count query has date range and status filters
      expect(prismaMock.task.count).toHaveBeenCalledWith({
        where: {
          dueDate: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      });
    });

    it('should handle empty statistics', async () => {
      prismaMock.task.count.mockResolvedValueOnce(0); // total
      prismaMock.task.groupBy.mockResolvedValue([] as never);
      prismaMock.task.count.mockResolvedValueOnce(0); // overdue
      prismaMock.task.count.mockResolvedValueOnce(0); // dueToday

      const result = await caller.stats();

      expect(result.total).toBe(0);
      expect(result.byStatus).toEqual({});
      expect(result.byPriority).toEqual({});
      expect(result.overdue).toBe(0);
      expect(result.dueToday).toBe(0);
    });
  });

  describe('input validation', () => {
    it('should require title for create', async () => {
      // @ts-expect-error - Testing invalid input
      await expect(caller.create({ dueDate: new Date(), priority: 'HIGH' })).rejects.toThrow();
    });

    it('should require id for getById', async () => {
      // @ts-expect-error - Testing invalid input
      await expect(caller.getById({})).rejects.toThrow();
    });

    it('should require id for update', async () => {
      // @ts-expect-error - Testing invalid input
      await expect(caller.update({ title: 'Updated' })).rejects.toThrow();
    });

    it('should require id for delete', async () => {
      // @ts-expect-error - Testing invalid input
      await expect(caller.delete({})).rejects.toThrow();
    });

    it('should require taskId for complete', async () => {
      // @ts-expect-error - Testing invalid input
      await expect(caller.complete({})).rejects.toThrow();
    });

    it('should validate page is positive', async () => {
      await expect(caller.list({ page: 0 })).rejects.toThrow();
    });

    it('should validate limit is positive', async () => {
      await expect(caller.list({ limit: 0 })).rejects.toThrow();
    });
  });
});
