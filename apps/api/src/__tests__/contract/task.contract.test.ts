/**
 * Task Router Contract Tests (IFC-129)
 *
 * Verifies the tRPC API contract for task operations:
 * - Input/output type validation
 * - Status and priority contracts
 * - Completion flow contracts
 *
 * @see Sprint 6 - IFC-129: UI and Contract Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { taskRouter } from '../../modules/task/task.router';
import {
  prismaMock,
  createTestContext,
  mockTask,
  mockUser,
  mockLead,
  mockContact,
  mockOpportunity,
  TEST_UUIDS,
} from '../../test/setup';

/**
 * Task status contract
 */
const taskStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

/**
 * Task priority contract
 */
const taskPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

/**
 * Task list response contract
 */
const taskListResponseSchema = z.object({
  tasks: z.array(z.any()),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  hasMore: z.boolean(),
});

/**
 * Task stats response contract
 */
const taskStatsResponseSchema = z.object({
  total: z.number().int().min(0),
  byStatus: z.record(z.number().int().min(0)),
  byPriority: z.record(z.number().int().min(0)),
  overdue: z.number().int().min(0),
  dueToday: z.number().int().min(0),
});

describe('Task Router Contract Tests', () => {
  const caller = taskRouter.createCaller(createTestContext());

  describe('create - Input Contract', () => {
    it('should require title, dueDate, and priority', async () => {
      const validInput = {
        title: 'Follow up call',
        dueDate: new Date('2025-01-25'),
        priority: 'HIGH' as const,
      };

      prismaMock.task.create.mockResolvedValue({
        ...mockTask,
        ...validInput,
      });

      const result = await caller.create(validInput);

      expect(result.title).toBe(validInput.title);
      expect(result.priority).toBe(validInput.priority);
    });

    it('should accept all valid priority enum values', async () => {
      for (const priority of taskPriorities) {
        const input = {
          title: `Task with ${priority} priority`,
          dueDate: new Date('2025-01-25'),
          priority,
        };

        prismaMock.task.create.mockResolvedValue({
          ...mockTask,
          ...input,
        });

        const result = await caller.create(input);
        expect(result.priority).toBe(priority);
      }
    });

    it('should accept optional description', async () => {
      const input = {
        title: 'Task with description',
        dueDate: new Date('2025-01-25'),
        priority: 'MEDIUM' as const,
        description: 'This is a detailed description',
      };

      prismaMock.task.create.mockResolvedValue({
        ...mockTask,
        ...input,
      });

      const result = await caller.create(input);
      expect(result.description).toBe(input.description);
    });

    it('should accept optional status', async () => {
      for (const status of taskStatuses) {
        const input = {
          title: `Task with ${status} status`,
          dueDate: new Date('2025-01-25'),
          priority: 'HIGH' as const,
          status,
        };

        prismaMock.task.create.mockResolvedValue({
          ...mockTask,
          ...input,
        });

        const result = await caller.create(input);
        expect(result.status).toBe(status);
      }
    });

    it('should validate leadId if provided', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(null);

      try {
        await caller.create({
          title: 'Task',
          dueDate: new Date('2025-01-25'),
          priority: 'HIGH',
          leadId: TEST_UUIDS.nonExistent,
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toContain('Lead');
      }
    });

    it('should validate contactId if provided', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      try {
        await caller.create({
          title: 'Task',
          dueDate: new Date('2025-01-25'),
          priority: 'HIGH',
          contactId: TEST_UUIDS.nonExistent,
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toContain('Contact');
      }
    });

    it('should validate opportunityId if provided', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(null);

      try {
        await caller.create({
          title: 'Task',
          dueDate: new Date('2025-01-25'),
          priority: 'HIGH',
          opportunityId: TEST_UUIDS.nonExistent,
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toContain('Opportunity');
      }
    });
  });

  describe('create - Output Contract', () => {
    it('should return task with all required fields', async () => {
      prismaMock.task.create.mockResolvedValue(mockTask);

      const result = await caller.create({
        title: 'New Task',
        dueDate: new Date('2025-01-25'),
        priority: 'HIGH',
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('priority');
      expect(result).toHaveProperty('dueDate');
      expect(result).toHaveProperty('ownerId');
    });

    it('should default to PENDING status', async () => {
      prismaMock.task.create.mockResolvedValue({
        ...mockTask,
        status: 'PENDING' as const,
      });

      const result = await caller.create({
        title: 'New Task',
        dueDate: new Date('2025-01-25'),
        priority: 'HIGH',
      });

      expect(result.status).toBe('PENDING');
    });

    it('should have null completedAt initially', async () => {
      prismaMock.task.create.mockResolvedValue({
        ...mockTask,
        completedAt: null,
      });

      const result = await caller.create({
        title: 'New Task',
        dueDate: new Date('2025-01-25'),
        priority: 'HIGH',
      });

      expect(result.completedAt).toBeNull();
    });
  });

  describe('getById - Contract', () => {
    it('should require valid UUID', async () => {
      await expect(caller.getById({ id: 'invalid' })).rejects.toThrow();
    });

    it('should return task with relations', async () => {
      const taskWithRelations = {
        ...mockTask,
        owner: mockUser,
        lead: mockLead,
        contact: mockContact,
        opportunity: mockOpportunity,
      };

      prismaMock.task.findUnique.mockResolvedValue(taskWithRelations);

      const result = await caller.getById({ id: TEST_UUIDS.task1 });

      expect(result).toHaveProperty('owner');
      expect(result).toHaveProperty('lead');
      expect(result).toHaveProperty('contact');
      expect(result).toHaveProperty('opportunity');
    });

    it('should throw NOT_FOUND for non-existent task', async () => {
      prismaMock.task.findUnique.mockResolvedValue(null);

      try {
        await caller.getById({ id: TEST_UUIDS.nonExistent });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('list - Contract', () => {
    beforeEach(() => {
      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValue(0);
    });

    it('should return paginated response', async () => {
      const result = await caller.list({});

      const parseResult = taskListResponseSchema.safeParse(result);
      expect(parseResult.success).toBe(true);
    });

    it('should accept status filter with array', async () => {
      await caller.list({ status: ['PENDING', 'IN_PROGRESS'] });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          }),
        })
      );
    });

    it('should accept priority filter with array', async () => {
      await caller.list({ priority: ['HIGH', 'URGENT'] });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: { in: ['HIGH', 'URGENT'] },
          }),
        })
      );
    });

    it('should accept date range filters', async () => {
      const dueDateFrom = new Date('2025-01-01');
      const dueDateTo = new Date('2025-01-31');

      await caller.list({ dueDateFrom, dueDateTo });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dueDate: { gte: dueDateFrom, lte: dueDateTo },
          }),
        })
      );
    });

    it('should accept overdue filter', async () => {
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

    it('should accept search filter', async () => {
      await caller.list({ search: 'call' });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'call', mode: 'insensitive' } },
              { description: { contains: 'call', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('should accept ownerId filter', async () => {
      await caller.list({ ownerId: TEST_UUIDS.user1 });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: TEST_UUIDS.user1,
          }),
        })
      );
    });

    it('should accept leadId filter', async () => {
      await caller.list({ leadId: TEST_UUIDS.lead1 });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            leadId: TEST_UUIDS.lead1,
          }),
        })
      );
    });

    it('should enforce pagination limits', async () => {
      await expect(caller.list({ page: 0 })).rejects.toThrow();
      await expect(caller.list({ limit: 0 })).rejects.toThrow();
    });

    it('should support sorting', async () => {
      await caller.list({ sortBy: 'dueDate', sortOrder: 'asc' });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { dueDate: 'asc' },
        })
      );
    });
  });

  describe('update - Contract', () => {
    it('should require id for update', async () => {
      // @ts-expect-error - Testing contract
      await expect(caller.update({ title: 'Updated' })).rejects.toThrow();
    });

    it('should accept partial updates', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);
      prismaMock.task.update.mockResolvedValue({
        ...mockTask,
        title: 'Updated Title',
      });

      const result = await caller.update({
        id: TEST_UUIDS.task1,
        title: 'Updated Title',
      });

      expect(result.title).toBe('Updated Title');
    });

    it('should allow status updates', async () => {
      for (const status of taskStatuses) {
        prismaMock.task.findUnique.mockResolvedValue(mockTask);
        prismaMock.task.update.mockResolvedValue({
          ...mockTask,
          status,
        });

        const result = await caller.update({
          id: TEST_UUIDS.task1,
          status,
        });

        expect(result.status).toBe(status);
      }
    });

    it('should validate leadId on update', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);
      prismaMock.lead.findUnique.mockResolvedValue(null);

      try {
        await caller.update({
          id: TEST_UUIDS.task1,
          leadId: TEST_UUIDS.nonExistent,
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });

    it('should validate contactId on update', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);
      prismaMock.contact.findUnique.mockResolvedValue(null);

      try {
        await caller.update({
          id: TEST_UUIDS.task1,
          contactId: TEST_UUIDS.nonExistent,
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });

    it('should validate opportunityId on update', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);
      prismaMock.opportunity.findUnique.mockResolvedValue(null);

      try {
        await caller.update({
          id: TEST_UUIDS.task1,
          opportunityId: TEST_UUIDS.nonExistent,
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('delete - Contract', () => {
    it('should return success response', async () => {
      prismaMock.task.findUnique.mockResolvedValue(mockTask);
      prismaMock.task.delete.mockResolvedValue(mockTask);

      const result = await caller.delete({ id: TEST_UUIDS.task1 });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('id');
      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.task1);
    });

    it('should throw NOT_FOUND for non-existent task', async () => {
      prismaMock.task.findUnique.mockResolvedValue(null);

      try {
        await caller.delete({ id: TEST_UUIDS.nonExistent });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('complete - Contract', () => {
    it('should require taskId', async () => {
      // @ts-expect-error - Testing contract
      await expect(caller.complete({})).rejects.toThrow();
    });

    it('should return completed task with completedAt', async () => {
      prismaMock.task.findUnique.mockResolvedValue({
        ...mockTask,
        status: 'IN_PROGRESS' as const,
      });
      prismaMock.task.update.mockResolvedValue({
        ...mockTask,
        status: 'COMPLETED' as const,
        completedAt: new Date(),
      });

      const result = await caller.complete({ taskId: TEST_UUIDS.task1 });

      expect(result.status).toBe('COMPLETED');
      expect(result.completedAt).toBeDefined();
      expect(result.completedAt).not.toBeNull();
    });

    it('should throw BAD_REQUEST if already completed', async () => {
      prismaMock.task.findUnique.mockResolvedValue({
        ...mockTask,
        status: 'COMPLETED' as const,
      });

      try {
        await caller.complete({ taskId: TEST_UUIDS.task1 });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('BAD_REQUEST');
        expect(error.message).toContain('already completed');
      }
    });

    it('should throw NOT_FOUND for non-existent task', async () => {
      prismaMock.task.findUnique.mockResolvedValue(null);

      try {
        await caller.complete({ taskId: TEST_UUIDS.nonExistent });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('stats - Contract', () => {
    it('should return stats matching contract', async () => {
      prismaMock.task.count.mockResolvedValueOnce(100);
      prismaMock.task.groupBy.mockResolvedValueOnce([
        { status: 'PENDING', _count: 40 },
        { status: 'IN_PROGRESS', _count: 30 },
      ] as any);
      prismaMock.task.groupBy.mockResolvedValueOnce([
        { priority: 'HIGH', _count: 30 },
        { priority: 'URGENT', _count: 10 },
      ] as any);
      prismaMock.task.count.mockResolvedValueOnce(10); // overdue
      prismaMock.task.count.mockResolvedValueOnce(5); // dueToday

      const result = await caller.stats();

      const parseResult = taskStatsResponseSchema.safeParse(result);
      expect(parseResult.success).toBe(true);
    });

    it('should return byStatus correctly', async () => {
      prismaMock.task.count.mockResolvedValueOnce(100);
      prismaMock.task.groupBy.mockResolvedValueOnce([
        { status: 'PENDING', _count: 40 },
        { status: 'COMPLETED', _count: 25 },
      ] as any);
      prismaMock.task.groupBy.mockResolvedValueOnce([]);
      prismaMock.task.count.mockResolvedValueOnce(0);
      prismaMock.task.count.mockResolvedValueOnce(0);

      const result = await caller.stats();

      expect(result.byStatus).toEqual({
        PENDING: 40,
        COMPLETED: 25,
      });
    });

    it('should return byPriority correctly', async () => {
      prismaMock.task.count.mockResolvedValueOnce(100);
      prismaMock.task.groupBy.mockResolvedValueOnce([]);
      prismaMock.task.groupBy.mockResolvedValueOnce([
        { priority: 'HIGH', _count: 30 },
        { priority: 'LOW', _count: 20 },
      ] as any);
      prismaMock.task.count.mockResolvedValueOnce(0);
      prismaMock.task.count.mockResolvedValueOnce(0);

      const result = await caller.stats();

      expect(result.byPriority).toEqual({
        HIGH: 30,
        LOW: 20,
      });
    });

    it('should count overdue tasks', async () => {
      prismaMock.task.count.mockResolvedValueOnce(100);
      prismaMock.task.groupBy.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValueOnce(15); // overdue
      prismaMock.task.count.mockResolvedValueOnce(5); // dueToday

      const result = await caller.stats();

      expect(result.overdue).toBe(15);
    });

    it('should count tasks due today', async () => {
      prismaMock.task.count.mockResolvedValueOnce(100);
      prismaMock.task.groupBy.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValueOnce(10); // overdue
      prismaMock.task.count.mockResolvedValueOnce(8); // dueToday

      const result = await caller.stats();

      expect(result.dueToday).toBe(8);
    });

    it('should handle empty stats', async () => {
      prismaMock.task.count.mockResolvedValueOnce(0);
      prismaMock.task.groupBy.mockResolvedValue([]);
      prismaMock.task.count.mockResolvedValueOnce(0);
      prismaMock.task.count.mockResolvedValueOnce(0);

      const result = await caller.stats();

      expect(result.total).toBe(0);
      expect(result.byStatus).toEqual({});
      expect(result.byPriority).toEqual({});
      expect(result.overdue).toBe(0);
      expect(result.dueToday).toBe(0);
    });
  });
});
