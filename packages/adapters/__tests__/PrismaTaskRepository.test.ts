/**
 * PrismaTaskRepository Tests
 *
 * These tests verify the Prisma repository implementation using a mock Prisma client.
 * They ensure all repository methods correctly interact with the database layer.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaTaskRepository } from '../src/repositories/PrismaTaskRepository';
import { Task, TaskId } from '@intelliflow/domain';
import type { PrismaClient } from '@intelliflow/db';

// Mock Prisma Client
const createMockPrismaClient = () => {
  return {
    task: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
  } as unknown as PrismaClient;
};

describe('PrismaTaskRepository', () => {
  let repository: PrismaTaskRepository;
  let mockPrisma: PrismaClient;
  let testTask: Task;
  let testTaskId: TaskId;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaTaskRepository(mockPrisma);

    // Create a test task
    const taskResult = Task.create({
      title: 'Follow up with client',
      description: 'Call to discuss proposal',
      dueDate: new Date('2024-12-31'),
      priority: 'HIGH',
      leadId: 'lead-123',
      ownerId: 'owner-123',
    });

    testTask = taskResult.value;
    testTaskId = testTask.id;

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe('save()', () => {
    it('should call prisma.task.upsert with correct data', async () => {
      const upsertMock = vi.fn().mockResolvedValue({});
      (mockPrisma.task.upsert as any) = upsertMock;

      await repository.save(testTask);

      expect(upsertMock).toHaveBeenCalledWith({
        where: { id: testTask.id.value },
        create: expect.objectContaining({
          id: testTask.id.value,
          title: 'Follow up with client',
          description: 'Call to discuss proposal',
          priority: 'HIGH',
          status: 'PENDING',
          leadId: 'lead-123',
          ownerId: 'owner-123',
        }),
        update: expect.objectContaining({
          title: 'Follow up with client',
        }),
      });
    });

    it('should handle null optional fields', async () => {
      const minimalTaskResult = Task.create({
        title: 'Simple Task',
        ownerId: 'owner-456',
      });

      const upsertMock = vi.fn().mockResolvedValue({});
      (mockPrisma.task.upsert as any) = upsertMock;

      await repository.save(minimalTaskResult.value);

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            description: null,
            dueDate: null,
            leadId: null,
            contactId: null,
            opportunityId: null,
            completedAt: null,
          }),
        })
      );
    });

    it('should handle prisma errors', async () => {
      const upsertMock = vi.fn().mockRejectedValue(new Error('Database error'));
      (mockPrisma.task.upsert as any) = upsertMock;

      await expect(repository.save(testTask)).rejects.toThrow('Database error');
    });
  });

  describe('findById()', () => {
    it('should return task when found', async () => {
      const mockRecord = {
        id: testTaskId.value,
        title: 'Follow up with client',
        description: 'Call to discuss proposal',
        dueDate: new Date('2024-12-31'),
        priority: 'HIGH',
        status: 'PENDING',
        leadId: 'lead-123',
        contactId: null,
        opportunityId: null,
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.task.findUnique as any) = findUniqueMock;

      const result = await repository.findById(testTaskId);

      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { id: testTaskId.value },
      });

      expect(result).not.toBeNull();
      expect(result?.id.value).toBe(testTaskId.value);
      expect(result?.title).toBe('Follow up with client');
      expect(result?.priority).toBe('HIGH');
      expect(result?.status).toBe('PENDING');
    });

    it('should return null when not found', async () => {
      const findUniqueMock = vi.fn().mockResolvedValue(null);
      (mockPrisma.task.findUnique as any) = findUniqueMock;

      const result = await repository.findById(testTaskId);

      expect(result).toBeNull();
    });

    it('should handle null optional fields', async () => {
      const mockRecord = {
        id: testTaskId.value,
        title: 'Simple Task',
        description: null,
        dueDate: null,
        priority: 'MEDIUM',
        status: 'PENDING',
        leadId: null,
        contactId: null,
        opportunityId: null,
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.task.findUnique as any) = findUniqueMock;

      const result = await repository.findById(testTaskId);

      expect(result?.description).toBeUndefined();
      expect(result?.dueDate).toBeUndefined();
      expect(result?.leadId).toBeUndefined();
      expect(result?.contactId).toBeUndefined();
      expect(result?.opportunityId).toBeUndefined();
      expect(result?.completedAt).toBeUndefined();
    });
  });

  describe('findByOwnerId()', () => {
    it('should return all tasks for owner', async () => {
      const mockRecords = [
        {
          id: testTaskId.value,
          title: 'Task 1',
          description: null,
          dueDate: new Date('2024-12-25'),
          priority: 'HIGH',
          status: 'PENDING',
          leadId: null,
          contactId: null,
          opportunityId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
        },
        {
          id: TaskId.generate().value,
          title: 'Task 2',
          description: null,
          dueDate: new Date('2024-12-31'),
          priority: 'MEDIUM',
          status: 'IN_PROGRESS',
          leadId: null,
          contactId: null,
          opportunityId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.task.findMany as any) = findManyMock;

      const results = await repository.findByOwnerId('owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { ownerId: 'owner-123' },
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      });

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Task 1');
      expect(results[1].title).toBe('Task 2');
    });

    it('should return empty array when no tasks found', async () => {
      const findManyMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.task.findMany as any) = findManyMock;

      const results = await repository.findByOwnerId('owner-999');

      expect(results).toHaveLength(0);
    });
  });

  describe('findByLeadId()', () => {
    it('should return all tasks for lead', async () => {
      const mockRecords = [
        {
          id: testTaskId.value,
          title: 'Lead Task',
          description: null,
          dueDate: new Date(),
          priority: 'HIGH',
          status: 'PENDING',
          leadId: 'lead-123',
          contactId: null,
          opportunityId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.task.findMany as any) = findManyMock;

      const results = await repository.findByLeadId('lead-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { leadId: 'lead-123' },
        orderBy: { dueDate: 'asc' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].leadId).toBe('lead-123');
    });
  });

  describe('findByContactId()', () => {
    it('should return all tasks for contact', async () => {
      const mockRecords = [
        {
          id: testTaskId.value,
          title: 'Contact Task',
          description: null,
          dueDate: new Date(),
          priority: 'MEDIUM',
          status: 'PENDING',
          leadId: null,
          contactId: 'contact-456',
          opportunityId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.task.findMany as any) = findManyMock;

      const results = await repository.findByContactId('contact-456');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { contactId: 'contact-456' },
        orderBy: { dueDate: 'asc' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].contactId).toBe('contact-456');
    });
  });

  describe('findByOpportunityId()', () => {
    it('should return all tasks for opportunity', async () => {
      const mockRecords = [
        {
          id: testTaskId.value,
          title: 'Opportunity Task',
          description: null,
          dueDate: new Date(),
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          leadId: null,
          contactId: null,
          opportunityId: 'opportunity-789',
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.task.findMany as any) = findManyMock;

      const results = await repository.findByOpportunityId('opportunity-789');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { opportunityId: 'opportunity-789' },
        orderBy: { dueDate: 'asc' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].opportunityId).toBe('opportunity-789');
    });
  });

  describe('findByStatus()', () => {
    it('should return tasks with matching status', async () => {
      const mockRecords = [
        {
          id: testTaskId.value,
          title: 'In Progress Task',
          description: null,
          dueDate: new Date(),
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          leadId: null,
          contactId: null,
          opportunityId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.task.findMany as any) = findManyMock;

      const results = await repository.findByStatus('IN_PROGRESS');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { status: 'IN_PROGRESS' },
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('IN_PROGRESS');
    });

    it('should filter by status and owner', async () => {
      const mockRecords = [
        {
          id: testTaskId.value,
          title: 'My Pending Task',
          description: null,
          dueDate: new Date(),
          priority: 'MEDIUM',
          status: 'PENDING',
          leadId: null,
          contactId: null,
          opportunityId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.task.findMany as any) = findManyMock;

      const results = await repository.findByStatus('PENDING', 'owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { status: 'PENDING', ownerId: 'owner-123' },
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      });

      expect(results).toHaveLength(1);
    });
  });

  describe('findOverdue()', () => {
    it('should return overdue tasks', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const mockRecords = [
        {
          id: testTaskId.value,
          title: 'Overdue Task',
          description: null,
          dueDate: pastDate,
          priority: 'HIGH',
          status: 'PENDING',
          leadId: null,
          contactId: null,
          opportunityId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.task.findMany as any) = findManyMock;

      const results = await repository.findOverdue();

      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          dueDate: { lt: expect.any(Date) },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        orderBy: { dueDate: 'asc' },
      });

      expect(results).toHaveLength(1);
    });

    it('should filter overdue by owner', async () => {
      const findManyMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.task.findMany as any) = findManyMock;

      await repository.findOverdue('owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          dueDate: { lt: expect.any(Date) },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          ownerId: 'owner-123',
        },
        orderBy: { dueDate: 'asc' },
      });
    });
  });

  describe('findDueToday()', () => {
    it('should return tasks due today', async () => {
      const today = new Date();

      const mockRecords = [
        {
          id: testTaskId.value,
          title: 'Due Today Task',
          description: null,
          dueDate: today,
          priority: 'HIGH',
          status: 'PENDING',
          leadId: null,
          contactId: null,
          opportunityId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.task.findMany as any) = findManyMock;

      const results = await repository.findDueToday();

      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          dueDate: { gte: expect.any(Date), lt: expect.any(Date) },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        orderBy: { priority: 'desc' },
      });

      expect(results).toHaveLength(1);
    });

    it('should filter due today by owner', async () => {
      const findManyMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.task.findMany as any) = findManyMock;

      await repository.findDueToday('owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          dueDate: { gte: expect.any(Date), lt: expect.any(Date) },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          ownerId: 'owner-123',
        },
        orderBy: { priority: 'desc' },
      });
    });
  });

  describe('delete()', () => {
    it('should call prisma.task.delete with correct ID', async () => {
      const deleteMock = vi.fn().mockResolvedValue({});
      (mockPrisma.task.delete as any) = deleteMock;

      await repository.delete(testTaskId);

      expect(deleteMock).toHaveBeenCalledWith({
        where: { id: testTaskId.value },
      });
    });

    it('should propagate prisma errors', async () => {
      const deleteMock = vi.fn().mockRejectedValue(new Error('Record not found'));
      (mockPrisma.task.delete as any) = deleteMock;

      await expect(repository.delete(testTaskId)).rejects.toThrow('Record not found');
    });
  });

  describe('countByStatus()', () => {
    it('should return counts grouped by status', async () => {
      const mockResults = [
        { status: 'PENDING', _count: 5 },
        { status: 'IN_PROGRESS', _count: 3 },
        { status: 'COMPLETED', _count: 10 },
      ];

      const groupByMock = vi.fn().mockResolvedValue(mockResults);
      (mockPrisma.task.groupBy as any) = groupByMock;

      const counts = await repository.countByStatus();

      expect(groupByMock).toHaveBeenCalledWith({
        by: ['status'],
        where: undefined,
        _count: true,
      });

      expect(counts).toEqual({
        PENDING: 5,
        IN_PROGRESS: 3,
        COMPLETED: 10,
      });
    });

    it('should filter by owner', async () => {
      const mockResults = [
        { status: 'PENDING', _count: 2 },
        { status: 'COMPLETED', _count: 4 },
      ];

      const groupByMock = vi.fn().mockResolvedValue(mockResults);
      (mockPrisma.task.groupBy as any) = groupByMock;

      const counts = await repository.countByStatus('owner-123');

      expect(groupByMock).toHaveBeenCalledWith({
        by: ['status'],
        where: { ownerId: 'owner-123' },
        _count: true,
      });

      expect(counts).toEqual({
        PENDING: 2,
        COMPLETED: 4,
      });
    });

    it('should return empty object when no tasks', async () => {
      const groupByMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.task.groupBy as any) = groupByMock;

      const counts = await repository.countByStatus();

      expect(counts).toEqual({});
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid task ID in reconstitution', async () => {
      const mockRecord = {
        id: 'invalid-uuid',
        title: 'Test Task',
        description: null,
        dueDate: null,
        priority: 'MEDIUM',
        status: 'PENDING',
        leadId: null,
        contactId: null,
        opportunityId: null,
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.task.findUnique as any) = findUniqueMock;

      await expect(repository.findById(testTaskId)).rejects.toThrow(/Invalid TaskId/);
    });
  });

  describe('Integration with Domain Layer', () => {
    it('should preserve all task properties through save and find cycle', async () => {
      const mockRecord = {
        id: testTask.id.value,
        title: testTask.title,
        description: testTask.description,
        dueDate: testTask.dueDate,
        priority: testTask.priority,
        status: testTask.status,
        leadId: testTask.leadId,
        contactId: testTask.contactId,
        opportunityId: testTask.opportunityId,
        ownerId: testTask.ownerId,
        createdAt: testTask.createdAt,
        updatedAt: testTask.updatedAt,
        completedAt: testTask.completedAt,
      };

      const upsertMock = vi.fn().mockResolvedValue(mockRecord);
      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);

      (mockPrisma.task.upsert as any) = upsertMock;
      (mockPrisma.task.findUnique as any) = findUniqueMock;

      await repository.save(testTask);
      const found = await repository.findById(testTask.id);

      expect(found).not.toBeNull();
      expect(found?.title).toBe(testTask.title);
      expect(found?.description).toBe(testTask.description);
      expect(found?.priority).toBe(testTask.priority);
      expect(found?.status).toBe(testTask.status);
      expect(found?.leadId).toBe(testTask.leadId);
      expect(found?.ownerId).toBe(testTask.ownerId);
    });

    it('should handle completed task with completedAt date', async () => {
      const completedTask = Task.create({
        title: 'Completed Task',
        ownerId: 'owner-123',
      });
      completedTask.value.complete('owner-123');

      const mockRecord = {
        id: completedTask.value.id.value,
        title: 'Completed Task',
        description: null,
        dueDate: null,
        priority: 'MEDIUM',
        status: 'COMPLETED',
        leadId: null,
        contactId: null,
        opportunityId: null,
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: new Date(),
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.task.findUnique as any) = findUniqueMock;

      const result = await repository.findById(completedTask.value.id);

      expect(result?.status).toBe('COMPLETED');
      expect(result?.completedAt).toBeDefined();
    });
  });
});
