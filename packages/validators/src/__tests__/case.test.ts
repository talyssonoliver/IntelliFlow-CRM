/**
 * Case Validators Tests
 *
 * Tests the Zod validation schemas for legal case management.
 * These schemas validate API inputs for case CRUD operations.
 *
 * Coverage target: >90% for validator layer
 */

import { describe, it, expect } from 'vitest';

// Simple UUID generator for tests (crypto.randomUUID is available in Node 19+)
const uuidv4 = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
import {
  caseStatusSchema,
  casePrioritySchema,
  caseTaskStatusSchema,
  createCaseSchema,
  updateCaseSchema,
  caseQuerySchema,
  changeCaseStatusSchema,
  closeCaseSchema,
  updateDeadlineSchema,
  addCaseTaskSchema,
  removeCaseTaskSchema,
  completeCaseTaskSchema,
  caseTaskResponseSchema,
  caseResponseSchema,
  caseListResponseSchema,
  caseStatisticsSchema,
  type CaseStatus,
  type CasePriority,
  type CaseTaskStatus,
} from '../case';

describe('Case Validators', () => {
  describe('caseStatusSchema', () => {
    it('should accept valid status values', () => {
      const validStatuses: CaseStatus[] = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED'];

      validStatuses.forEach((status) => {
        const result = caseStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid status values', () => {
      const result = caseStatusSchema.safeParse('INVALID_STATUS');
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = caseStatusSchema.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('casePrioritySchema', () => {
    it('should accept valid priority values', () => {
      const validPriorities: CasePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

      validPriorities.forEach((priority) => {
        const result = casePrioritySchema.safeParse(priority);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid priority values', () => {
      const result = casePrioritySchema.safeParse('CRITICAL');
      expect(result.success).toBe(false);
    });
  });

  describe('caseTaskStatusSchema', () => {
    it('should accept valid task status values', () => {
      const validStatuses: CaseTaskStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

      validStatuses.forEach((status) => {
        const result = caseTaskStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid task status values', () => {
      const result = caseTaskStatusSchema.safeParse('DONE');
      expect(result.success).toBe(false);
    });
  });

  describe('createCaseSchema', () => {
    const validUuid = uuidv4();

    it('should accept valid input with required fields', () => {
      const input = {
        title: 'Test Case',
        clientId: validUuid,
      };

      const result = createCaseSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Test Case');
        expect(result.data.clientId).toBe(validUuid);
        expect(result.data.priority).toBe('MEDIUM'); // default
      }
    });

    it('should accept valid input with all fields', () => {
      const deadline = new Date('2024-12-31');
      const assignedTo = uuidv4();

      const input = {
        title: 'Complete Case',
        description: 'Case description',
        priority: 'HIGH',
        deadline,
        clientId: validUuid,
        assignedTo,
      };

      const result = createCaseSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priority).toBe('HIGH');
        expect(result.data.description).toBe('Case description');
        expect(result.data.assignedTo).toBe(assignedTo);
      }
    });

    it('should reject empty title', () => {
      const input = {
        title: '',
        clientId: validUuid,
      };

      const result = createCaseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject title exceeding 300 characters', () => {
      const input = {
        title: 'x'.repeat(301),
        clientId: validUuid,
      };

      const result = createCaseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject description exceeding 5000 characters', () => {
      const input = {
        title: 'Valid Title',
        description: 'x'.repeat(5001),
        clientId: validUuid,
      };

      const result = createCaseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid clientId format', () => {
      const input = {
        title: 'Test Case',
        clientId: 'invalid-uuid',
      };

      const result = createCaseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should coerce date strings to Date objects', () => {
      const input = {
        title: 'Test Case',
        clientId: validUuid,
        deadline: '2024-12-31T00:00:00Z',
      };

      const result = createCaseSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deadline).toBeInstanceOf(Date);
      }
    });
  });

  describe('updateCaseSchema', () => {
    const validUuid = uuidv4();

    it('should accept valid update with only id', () => {
      const input = {
        id: validUuid,
      };

      const result = updateCaseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept valid update with all optional fields', () => {
      const assignedTo = uuidv4();

      const input = {
        id: validUuid,
        title: 'Updated Title',
        description: 'Updated description',
        priority: 'URGENT',
        deadline: new Date('2024-12-31'),
        assignedTo,
      };

      const result = updateCaseSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it('should accept null deadline to clear it', () => {
      const input = {
        id: validUuid,
        deadline: null,
      };

      const result = updateCaseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject missing id', () => {
      const input = {
        title: 'Updated Title',
      };

      const result = updateCaseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('caseQuerySchema', () => {
    it('should accept empty query (defaults)', () => {
      const input = {};

      const result = caseQuerySchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('should accept full query with all filters', () => {
      const clientId = uuidv4();
      const assignedTo = uuidv4();

      const input = {
        page: 2,
        limit: 50,
        search: 'test query',
        status: ['OPEN', 'IN_PROGRESS'],
        priority: ['HIGH', 'URGENT'],
        clientId,
        assignedTo,
        deadlineFrom: '2024-01-01',
        deadlineTo: '2024-12-31',
        overdue: true,
      };

      const result = caseQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject search exceeding 200 characters', () => {
      const input = {
        search: 'x'.repeat(201),
      };

      const result = caseQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject limit exceeding 100', () => {
      const input = {
        limit: 101,
      };

      const result = caseQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('changeCaseStatusSchema', () => {
    const validUuid = uuidv4();

    it('should accept valid status change', () => {
      const input = {
        caseId: validUuid,
        status: 'IN_PROGRESS',
      };

      const result = changeCaseStatusSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid caseId', () => {
      const input = {
        caseId: 'invalid',
        status: 'CLOSED',
      };

      const result = changeCaseStatusSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid status', () => {
      const input = {
        caseId: validUuid,
        status: 'INVALID',
      };

      const result = changeCaseStatusSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('closeCaseSchema', () => {
    const validUuid = uuidv4();

    it('should accept valid close with resolution', () => {
      const input = {
        caseId: validUuid,
        resolution: 'Case resolved successfully',
      };

      const result = closeCaseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty resolution', () => {
      const input = {
        caseId: validUuid,
        resolution: '',
      };

      const result = closeCaseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject resolution exceeding 2000 characters', () => {
      const input = {
        caseId: validUuid,
        resolution: 'x'.repeat(2001),
      };

      const result = closeCaseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('updateDeadlineSchema', () => {
    const validUuid = uuidv4();

    it('should accept valid deadline update', () => {
      const input = {
        caseId: validUuid,
        deadline: new Date('2024-12-31'),
      };

      const result = updateDeadlineSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should coerce string dates', () => {
      const input = {
        caseId: validUuid,
        deadline: '2024-12-31T00:00:00Z',
      };

      const result = updateDeadlineSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deadline).toBeInstanceOf(Date);
      }
    });
  });

  describe('addCaseTaskSchema', () => {
    const validUuid = uuidv4();

    it('should accept valid task with required fields', () => {
      const input = {
        caseId: validUuid,
        title: 'New Task',
      };

      const result = addCaseTaskSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept valid task with all fields', () => {
      const assignee = uuidv4();

      const input = {
        caseId: validUuid,
        title: 'Complete Task',
        description: 'Task description',
        dueDate: new Date('2024-12-31'),
        assignee,
      };

      const result = addCaseTaskSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty title', () => {
      const input = {
        caseId: validUuid,
        title: '',
      };

      const result = addCaseTaskSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject title exceeding 200 characters', () => {
      const input = {
        caseId: validUuid,
        title: 'x'.repeat(201),
      };

      const result = addCaseTaskSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject description exceeding 2000 characters', () => {
      const input = {
        caseId: validUuid,
        title: 'Valid Title',
        description: 'x'.repeat(2001),
      };

      const result = addCaseTaskSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('removeCaseTaskSchema', () => {
    it('should accept valid remove request', () => {
      const input = {
        caseId: uuidv4(),
        taskId: uuidv4(),
      };

      const result = removeCaseTaskSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid task ID', () => {
      const input = {
        caseId: uuidv4(),
        taskId: 'invalid',
      };

      const result = removeCaseTaskSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('completeCaseTaskSchema', () => {
    it('should accept valid complete request', () => {
      const input = {
        caseId: uuidv4(),
        taskId: uuidv4(),
      };

      const result = completeCaseTaskSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('caseTaskResponseSchema', () => {
    it('should accept valid task response', () => {
      const input = {
        id: uuidv4(),
        title: 'Task Title',
        description: null,
        dueDate: null,
        status: 'PENDING',
        assignee: null,
        isOverdue: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      };

      const result = caseTaskResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept completed task', () => {
      const input = {
        id: uuidv4(),
        title: 'Completed Task',
        description: 'Description',
        dueDate: new Date('2024-12-31'),
        status: 'COMPLETED',
        assignee: uuidv4(),
        isOverdue: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: new Date(),
      };

      const result = caseTaskResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('caseResponseSchema', () => {
    it('should accept valid case response', () => {
      const input = {
        id: uuidv4(),
        title: 'Case Title',
        description: null,
        status: 'OPEN',
        priority: 'MEDIUM',
        deadline: null,
        clientId: uuidv4(),
        assignedTo: uuidv4(),
        tasks: [],
        taskProgress: 0,
        pendingTaskCount: 0,
        completedTaskCount: 0,
        isOverdue: false,
        resolution: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        closedAt: null,
      };

      const result = caseResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept case with tasks', () => {
      const task = {
        id: uuidv4(),
        title: 'Task',
        description: null,
        dueDate: null,
        status: 'PENDING',
        assignee: null,
        isOverdue: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      };

      const input = {
        id: uuidv4(),
        title: 'Case with Tasks',
        description: 'Description',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        deadline: new Date('2024-12-31'),
        clientId: uuidv4(),
        assignedTo: uuidv4(),
        tasks: [task],
        taskProgress: 50,
        pendingTaskCount: 1,
        completedTaskCount: 1,
        isOverdue: false,
        resolution: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        closedAt: null,
      };

      const result = caseResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject taskProgress > 100', () => {
      const input = {
        id: uuidv4(),
        title: 'Case',
        description: null,
        status: 'OPEN',
        priority: 'MEDIUM',
        deadline: null,
        clientId: uuidv4(),
        assignedTo: uuidv4(),
        tasks: [],
        taskProgress: 101,
        pendingTaskCount: 0,
        completedTaskCount: 0,
        isOverdue: false,
        resolution: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        closedAt: null,
      };

      const result = caseResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('caseListResponseSchema', () => {
    it('should accept valid list response', () => {
      const input = {
        cases: [],
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = caseListResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept list with cases', () => {
      const caseItem = {
        id: uuidv4(),
        title: 'Case',
        description: null,
        status: 'OPEN',
        priority: 'MEDIUM',
        deadline: null,
        clientId: uuidv4(),
        assignedTo: uuidv4(),
        tasks: [],
        taskProgress: 0,
        pendingTaskCount: 0,
        completedTaskCount: 0,
        isOverdue: false,
        resolution: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        closedAt: null,
      };

      const input = {
        cases: [caseItem],
        total: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = caseListResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject negative total', () => {
      const input = {
        cases: [],
        total: -1,
        page: 1,
        limit: 20,
        hasMore: false,
      };

      const result = caseListResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('caseStatisticsSchema', () => {
    it('should accept valid statistics', () => {
      const input = {
        total: 100,
        byStatus: {
          OPEN: 30,
          IN_PROGRESS: 40,
          ON_HOLD: 10,
          CLOSED: 15,
          CANCELLED: 5,
        },
        byPriority: {
          LOW: 20,
          MEDIUM: 50,
          HIGH: 25,
          URGENT: 5,
        },
        overdue: 8,
        averageTaskCompletion: 75.5,
        closedThisMonth: 15,
      };

      const result = caseStatisticsSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject averageTaskCompletion > 100', () => {
      const input = {
        total: 10,
        byStatus: {},
        byPriority: {},
        overdue: 0,
        averageTaskCompletion: 150,
        closedThisMonth: 0,
      };

      const result = caseStatisticsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject negative values', () => {
      const input = {
        total: -1,
        byStatus: {},
        byPriority: {},
        overdue: 0,
        averageTaskCompletion: 50,
        closedThisMonth: 0,
      };

      const result = caseStatisticsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
