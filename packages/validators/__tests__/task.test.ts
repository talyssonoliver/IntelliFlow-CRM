/**
 * Task Validator Tests
 *
 * These tests verify the Zod validation schemas for Task-related operations.
 * They ensure that input validation works correctly for all API endpoints
 * that deal with tasks.
 */

import { describe, it, expect } from 'vitest';
import {
  taskPrioritySchema,
  taskStatusSchema,
  createTaskSchema,
  updateTaskSchema,
  taskQuerySchema,
  taskResponseSchema,
  taskListResponseSchema,
  completeTaskSchema,
} from '../src/task';

describe('Task Validators', () => {
  describe('taskPrioritySchema', () => {
    it('should validate valid task priorities', () => {
      const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

      validPriorities.forEach((priority) => {
        const result = taskPrioritySchema.safeParse(priority);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid task priority', () => {
      const result = taskPrioritySchema.safeParse('INVALID_PRIORITY');
      expect(result.success).toBe(false);
    });
  });

  describe('taskStatusSchema', () => {
    it('should validate valid task statuses', () => {
      const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

      validStatuses.forEach((status) => {
        const result = taskStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid task status', () => {
      const result = taskStatusSchema.safeParse('INVALID_STATUS');
      expect(result.success).toBe(false);
    });
  });

  describe('createTaskSchema', () => {
    it('should validate valid task creation data', () => {
      const validData = {
        title: 'Follow up with lead',
        description: 'Send follow-up email after demo',
        dueDate: '2024-12-31',
        priority: 'HIGH' as const,
        status: 'PENDING' as const,
        leadId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = createTaskSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate task with minimal required data', () => {
      const minimalData = {
        title: 'Simple task',
      };

      const result = createTaskSchema.safeParse(minimalData);
      expect(result.success).toBe(true);

      if (result.success) {
        // Default values should be applied
        expect(result.data.priority).toBe('MEDIUM');
        expect(result.data.status).toBe('PENDING');
      }
    });

    it('should reject empty title', () => {
      const invalidData = {
        title: '',
      };

      const result = createTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject title exceeding max length', () => {
      const invalidData = {
        title: 'T'.repeat(201), // Max is 200
      };

      const result = createTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject description exceeding max length', () => {
      const invalidData = {
        title: 'Valid title',
        description: 'D'.repeat(2001), // Max is 2000
      };

      const result = createTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should coerce dueDate to Date', () => {
      const validData = {
        title: 'Task with due date',
        dueDate: '2024-12-31',
      };

      const result = createTaskSchema.safeParse(validData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.dueDate).toBeInstanceOf(Date);
      }
    });

    it('should reject invalid priority', () => {
      const invalidData = {
        title: 'Valid title',
        priority: 'INVALID_PRIORITY',
      };

      const result = createTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid status', () => {
      const invalidData = {
        title: 'Valid title',
        status: 'INVALID_STATUS',
      };

      const result = createTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate all priorities', () => {
      const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

      priorities.forEach((priority) => {
        const validData = {
          title: 'Task',
          priority,
        };

        const result = createTaskSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });
    });

    it('should validate all statuses', () => {
      const statuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

      statuses.forEach((status) => {
        const validData = {
          title: 'Task',
          status,
        };

        const result = createTaskSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid leadId', () => {
      const invalidData = {
        title: 'Valid title',
        leadId: 'not-a-uuid',
      };

      const result = createTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid contactId', () => {
      const invalidData = {
        title: 'Valid title',
        contactId: 'not-a-uuid',
      };

      const result = createTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid opportunityId', () => {
      const invalidData = {
        title: 'Valid title',
        opportunityId: 'not-a-uuid',
      };

      const result = createTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate task with all entity relations', () => {
      const validData = {
        title: 'Complex task',
        description: 'Task related to multiple entities',
        leadId: '123e4567-e89b-12d3-a456-426614174000',
        contactId: '456e4567-e89b-12d3-a456-426614174000',
        opportunityId: '789e4567-e89b-12d3-a456-426614174000',
      };

      const result = createTaskSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('updateTaskSchema', () => {
    it('should validate valid update data', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Updated task',
        status: 'IN_PROGRESS' as const,
        priority: 'URGENT' as const,
      };

      const result = updateTaskSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require id field', () => {
      const invalidData = {
        title: 'Updated task',
      };

      const result = updateTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate partial updates', () => {
      const partialData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        priority: 'HIGH' as const,
      };

      const result = updateTaskSchema.safeParse(partialData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const invalidData = {
        id: 'not-a-uuid',
        title: 'Updated task',
      };

      const result = updateTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject empty title when provided', () => {
      const invalidData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: '',
      };

      const result = updateTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should allow null dueDate', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        dueDate: null,
      };

      const result = updateTaskSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should allow null leadId', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        leadId: null,
      };

      const result = updateTaskSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should allow null contactId', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        contactId: null,
      };

      const result = updateTaskSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should allow null opportunityId', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        opportunityId: null,
      };

      const result = updateTaskSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate update with all fields', () => {
      const fullUpdate = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Fully updated task',
        description: 'Updated description',
        dueDate: '2024-12-31',
        priority: 'LOW' as const,
        status: 'COMPLETED' as const,
        leadId: '456e4567-e89b-12d3-a456-426614174000',
        contactId: '789e4567-e89b-12d3-a456-426614174000',
        opportunityId: 'abce4567-e89b-12d3-a456-426614174000',
      };

      const result = updateTaskSchema.safeParse(fullUpdate);
      expect(result.success).toBe(true);
    });
  });

  describe('taskQuerySchema', () => {
    it('should validate valid query params', () => {
      const validQuery = {
        page: 1,
        limit: 20,
        search: 'follow up',
        status: ['PENDING', 'IN_PROGRESS'] as const,
        priority: ['HIGH', 'URGENT'] as const,
      };

      const result = taskQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should validate minimal query', () => {
      const minimalQuery = {};

      const result = taskQuerySchema.safeParse(minimalQuery);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('should reject search exceeding max length', () => {
      const invalidQuery = {
        search: 'S'.repeat(201), // Max is 200
      };

      const result = taskQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate status array filter', () => {
      const queryWithStatuses = {
        status: ['PENDING', 'IN_PROGRESS'] as const,
      };

      const result = taskQuerySchema.safeParse(queryWithStatuses);
      expect(result.success).toBe(true);
    });

    it('should reject invalid status in array', () => {
      const invalidQuery = {
        status: ['PENDING', 'INVALID_STATUS'],
      };

      const result = taskQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate priority array filter', () => {
      const queryWithPriorities = {
        priority: ['HIGH', 'URGENT'] as const,
      };

      const result = taskQuerySchema.safeParse(queryWithPriorities);
      expect(result.success).toBe(true);
    });

    it('should reject invalid priority in array', () => {
      const invalidQuery = {
        priority: ['HIGH', 'INVALID_PRIORITY'],
      };

      const result = taskQuerySchema.safeParse(invalidQuery);
      expect(result.success).toBe(false);
    });

    it('should validate ownerId filter', () => {
      const queryWithOwner = {
        ownerId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = taskQuerySchema.safeParse(queryWithOwner);
      expect(result.success).toBe(true);
    });

    it('should validate leadId filter', () => {
      const queryWithLead = {
        leadId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = taskQuerySchema.safeParse(queryWithLead);
      expect(result.success).toBe(true);
    });

    it('should validate contactId filter', () => {
      const queryWithContact = {
        contactId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = taskQuerySchema.safeParse(queryWithContact);
      expect(result.success).toBe(true);
    });

    it('should validate opportunityId filter', () => {
      const queryWithOpportunity = {
        opportunityId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = taskQuerySchema.safeParse(queryWithOpportunity);
      expect(result.success).toBe(true);
    });

    it('should validate due date range filters', () => {
      const queryWithDates = {
        dueDateFrom: '2024-01-01',
        dueDateTo: '2024-12-31',
      };

      const result = taskQuerySchema.safeParse(queryWithDates);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.dueDateFrom).toBeInstanceOf(Date);
        expect(result.data.dueDateTo).toBeInstanceOf(Date);
      }
    });

    it('should validate overdue filter', () => {
      const queryWithOverdue = {
        overdue: true,
      };

      const result = taskQuerySchema.safeParse(queryWithOverdue);
      expect(result.success).toBe(true);
    });

    it('should validate complex filter combination', () => {
      const complexQuery = {
        page: 2,
        limit: 50,
        search: 'urgent tasks',
        status: ['PENDING', 'IN_PROGRESS'] as const,
        priority: ['HIGH', 'URGENT'] as const,
        ownerId: '123e4567-e89b-12d3-a456-426614174000',
        leadId: '456e4567-e89b-12d3-a456-426614174000',
        contactId: '789e4567-e89b-12d3-a456-426614174000',
        opportunityId: 'abce4567-e89b-12d3-a456-426614174000',
        dueDateFrom: '2024-01-01',
        dueDateTo: '2024-12-31',
        overdue: false,
        sortBy: 'dueDate',
        sortOrder: 'asc' as const,
      };

      const result = taskQuerySchema.safeParse(complexQuery);
      expect(result.success).toBe(true);
    });
  });

  describe('taskResponseSchema', () => {
    it('should validate valid task response', () => {
      const validResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Follow up with lead',
        description: 'Send follow-up email',
        dueDate: '2024-12-31T00:00:00Z',
        priority: 'HIGH' as const,
        status: 'PENDING' as const,
        ownerId: '456e4567-e89b-12d3-a456-426614174000',
        leadId: '789e4567-e89b-12d3-a456-426614174000',
        contactId: 'abce4567-e89b-12d3-a456-426614174000',
        opportunityId: 'defe4567-e89b-12d3-a456-426614174000',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        completedAt: null,
      };

      const result = taskResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should accept null for optional fields', () => {
      const responseWithNulls = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Minimal task',
        description: null,
        dueDate: null,
        priority: 'MEDIUM' as const,
        status: 'PENDING' as const,
        ownerId: '456e4567-e89b-12d3-a456-426614174000',
        leadId: null,
        contactId: null,
        opportunityId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        completedAt: null,
      };

      const result = taskResponseSchema.safeParse(responseWithNulls);
      expect(result.success).toBe(true);
    });

    it('should coerce date strings to Date objects', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Task with dates',
        description: null,
        dueDate: '2024-12-31T00:00:00Z',
        priority: 'MEDIUM' as const,
        status: 'COMPLETED' as const,
        ownerId: '456e4567-e89b-12d3-a456-426614174000',
        leadId: null,
        contactId: null,
        opportunityId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        completedAt: '2024-01-15T00:00:00Z',
      };

      const result = taskResponseSchema.safeParse(response);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
        expect(result.data.dueDate).toBeInstanceOf(Date);
        expect(result.data.completedAt).toBeInstanceOf(Date);
      }
    });

    it('should validate all priorities in response', () => {
      const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

      priorities.forEach((priority) => {
        const response = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Task',
          description: null,
          dueDate: null,
          priority,
          status: 'PENDING' as const,
          ownerId: '456e4567-e89b-12d3-a456-426614174000',
          leadId: null,
          contactId: null,
          opportunityId: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          completedAt: null,
        };

        const result = taskResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      });
    });

    it('should validate all statuses in response', () => {
      const statuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

      statuses.forEach((status) => {
        const response = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Task',
          description: null,
          dueDate: null,
          priority: 'MEDIUM' as const,
          status,
          ownerId: '456e4567-e89b-12d3-a456-426614174000',
          leadId: null,
          contactId: null,
          opportunityId: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          completedAt: null,
        };

        const result = taskResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('taskListResponseSchema', () => {
    it('should validate valid task list response', () => {
      const validList = {
        tasks: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            title: 'Follow up',
            description: 'Follow up email',
            dueDate: '2024-12-31T00:00:00Z',
            priority: 'HIGH' as const,
            status: 'PENDING' as const,
            ownerId: '456e4567-e89b-12d3-a456-426614174000',
            leadId: '789e4567-e89b-12d3-a456-426614174000',
            contactId: null,
            opportunityId: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            completedAt: null,
          },
        ],
        total: 100,
        page: 1,
        limit: 20,
        hasMore: true,
      };

      const result = taskListResponseSchema.safeParse(validList);
      expect(result.success).toBe(true);
    });

    it('should validate empty task list', () => {
      const emptyList = {
        tasks: [],
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = taskListResponseSchema.safeParse(emptyList);
      expect(result.success).toBe(true);
    });

    it('should reject negative total', () => {
      const invalidList = {
        tasks: [],
        total: -1,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = taskListResponseSchema.safeParse(invalidList);
      expect(result.success).toBe(false);
    });

    it('should reject zero page', () => {
      const invalidList = {
        tasks: [],
        total: 0,
        page: 0,
        limit: 20,
        hasMore: false,
      };

      const result = taskListResponseSchema.safeParse(invalidList);
      expect(result.success).toBe(false);
    });

    it('should validate multiple tasks', () => {
      const multipleTasks = {
        tasks: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            title: 'Task 1',
            description: 'First task',
            dueDate: '2024-12-31T00:00:00Z',
            priority: 'HIGH' as const,
            status: 'PENDING' as const,
            ownerId: '456e4567-e89b-12d3-a456-426614174000',
            leadId: null,
            contactId: null,
            opportunityId: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            completedAt: null,
          },
          {
            id: '321e4567-e89b-12d3-a456-426614174000',
            title: 'Task 2',
            description: null,
            dueDate: null,
            priority: 'LOW' as const,
            status: 'COMPLETED' as const,
            ownerId: '456e4567-e89b-12d3-a456-426614174000',
            leadId: null,
            contactId: null,
            opportunityId: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            completedAt: '2024-01-03T00:00:00Z',
          },
        ],
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = taskListResponseSchema.safeParse(multipleTasks);
      expect(result.success).toBe(true);
    });
  });

  describe('completeTaskSchema', () => {
    it('should validate valid complete task data', () => {
      const validData = {
        taskId: '123e4567-e89b-12d3-a456-426614174000',
        notes: 'Task completed successfully',
      };

      const result = completeTaskSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate complete without notes', () => {
      const minimalData = {
        taskId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = completeTaskSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
    });

    it('should require taskId field', () => {
      const invalidData = {
        notes: 'Some notes',
      };

      const result = completeTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid taskId', () => {
      const invalidData = {
        taskId: 'not-a-uuid',
        notes: 'Some notes',
      };

      const result = completeTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject notes exceeding max length', () => {
      const invalidData = {
        taskId: '123e4567-e89b-12d3-a456-426614174000',
        notes: 'N'.repeat(1001), // Max is 1000
      };

      const result = completeTaskSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept notes at max length', () => {
      const validData = {
        taskId: '123e4567-e89b-12d3-a456-426614174000',
        notes: 'N'.repeat(1000), // Exactly max
      };

      const result = completeTaskSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });
});
