import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  Deadline,
  DeadlineAlreadyCompletedError,
  DeadlineAlreadyWaivedError,
} from '../Deadline';
import { DeadlineId } from '../DeadlineId';
import { DeadlineRule } from '../DeadlineRule';
import { CaseId } from '../../cases/CaseId';

describe('Deadline', () => {
  let caseId: CaseId;
  let rule: DeadlineRule;

  beforeEach(() => {
    caseId = CaseId.generate();
    rule = DeadlineRule.usFederalResponseToComplaint();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('should create a valid Deadline', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const triggerDate = new Date(2025, 0, 1);
      const dueDate = new Date(2025, 0, 22); // 21 days later

      const result = Deadline.create({
        caseId,
        rule,
        triggerDate,
        dueDate,
        title: 'Response to Complaint',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.caseId).toBe(caseId);
      expect(result.value.rule).toBe(rule);
      expect(result.value.title).toBe('Response to Complaint');
      expect(result.value.triggerDate).toEqual(triggerDate);
      expect(result.value.dueDate).toEqual(dueDate);
    });

    it('should set PENDING status for future deadline', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const result = Deadline.create({
        caseId,
        rule,
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 1, 1), // 1 month in future
        title: 'Future Deadline',
      });

      expect(result.value.status).toBe('PENDING');
    });

    it('should set APPROACHING status for deadline within 3 days', () => {
      const now = new Date(2025, 0, 10);
      vi.setSystemTime(now);

      const result = Deadline.create({
        caseId,
        rule,
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 12), // 2 days in future
        title: 'Approaching Deadline',
      });

      expect(result.value.status).toBe('APPROACHING');
    });

    it('should set DUE_TODAY status for same-day deadline', () => {
      const now = new Date(2025, 0, 10);
      vi.setSystemTime(now);

      const result = Deadline.create({
        caseId,
        rule,
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 10), // Same day
        title: 'Today Deadline',
      });

      expect(result.value.status).toBe('DUE_TODAY');
    });

    it('should set OVERDUE status for past deadline', () => {
      const now = new Date(2025, 0, 15);
      vi.setSystemTime(now);

      const result = Deadline.create({
        caseId,
        rule,
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 10), // 5 days ago
        title: 'Overdue Deadline',
      });

      expect(result.value.status).toBe('OVERDUE');
    });

    it('should calculate priority based on due date', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      // LOW priority (> 7 days)
      const lowResult = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 20),
        title: 'Low Priority',
      });
      expect(lowResult.value.priority).toBe('LOW');

      // MEDIUM priority (2-7 days)
      const mediumResult = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 5),
        title: 'Medium Priority',
      });
      expect(mediumResult.value.priority).toBe('MEDIUM');

      // HIGH priority (1 day)
      const highResult = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 2),
        title: 'High Priority',
      });
      expect(highResult.value.priority).toBe('HIGH');

      // CRITICAL priority (overdue)
      vi.setSystemTime(new Date(2025, 0, 15));
      const criticalResult = Deadline.create({
        caseId,
        rule,
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 10),
        title: 'Critical Priority',
      });
      expect(criticalResult.value.priority).toBe('CRITICAL');
    });

    it('should use provided priority if specified', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const result = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 20),
        title: 'Custom Priority',
        priority: 'HIGH',
      });

      expect(result.value.priority).toBe('HIGH');
    });

    it('should set optional fields', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const result = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Full Deadline',
        description: 'Detailed description',
        assignedTo: 'user-123',
      });

      expect(result.value.description).toBe('Detailed description');
      expect(result.value.assignedTo).toBe('user-123');
    });

    it('should initialize with zero reminders sent', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const result = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      });

      expect(result.value.remindersSent).toBe(0);
    });
  });

  describe('reconstitute', () => {
    it('should reconstitute deadline from persistence', () => {
      const id = DeadlineId.generate();
      const now = new Date(2025, 0, 1);

      const deadline = Deadline.reconstitute(id, {
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        status: 'PENDING',
        priority: 'MEDIUM',
        title: 'Reconstituted Deadline',
        remindersSent: 2,
        createdAt: now,
        updatedAt: now,
      });

      expect(deadline.id).toBe(id);
      expect(deadline.title).toBe('Reconstituted Deadline');
      expect(deadline.remindersSent).toBe(2);
    });
  });

  describe('complete', () => {
    it('should complete an active deadline', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      const result = deadline.complete('user-123');

      expect(result.isSuccess).toBe(true);
      expect(deadline.status).toBe('COMPLETED');
      expect(deadline.completedBy).toBe('user-123');
      expect(deadline.completedAt).toBeInstanceOf(Date);
      expect(deadline.isCompleted).toBe(true);
    });

    it('should fail to complete already completed deadline', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      deadline.complete('user-123');
      const result = deadline.complete('user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(DeadlineAlreadyCompletedError);
    });

    it('should fail to complete waived deadline', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      deadline.waive('user-123', 'No longer needed');
      const result = deadline.complete('user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(DeadlineAlreadyWaivedError);
    });
  });

  describe('waive', () => {
    it('should waive an active deadline', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      const result = deadline.waive('user-123', 'Settlement reached');

      expect(result.isSuccess).toBe(true);
      expect(deadline.status).toBe('WAIVED');
      expect(deadline.waivedBy).toBe('user-123');
      expect(deadline.waiverReason).toBe('Settlement reached');
      expect(deadline.waivedAt).toBeInstanceOf(Date);
      expect(deadline.isWaived).toBe(true);
    });

    it('should fail to waive completed deadline', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      deadline.complete('user-123');
      const result = deadline.waive('user-456', 'Reason');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(DeadlineAlreadyCompletedError);
    });

    it('should fail to waive already waived deadline', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      deadline.waive('user-123', 'First waive');
      const result = deadline.waive('user-456', 'Second waive');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(DeadlineAlreadyWaivedError);
    });
  });

  describe('extend', () => {
    it('should extend an active deadline', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      const newDueDate = new Date(2025, 1, 15);
      const result = deadline.extend(newDueDate);

      expect(result.isSuccess).toBe(true);
      expect(deadline.dueDate).toEqual(newDueDate);
    });

    it('should update status after extending', () => {
      const now = new Date(2025, 0, 20);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 22), // APPROACHING
        title: 'Test Deadline',
      }).value;

      expect(deadline.status).toBe('APPROACHING');

      deadline.extend(new Date(2025, 1, 28));

      expect(deadline.status).toBe('PENDING');
    });

    it('should fail to extend completed deadline', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      deadline.complete('user-123');
      const result = deadline.extend(new Date(2025, 1, 15));

      expect(result.isFailure).toBe(true);
    });
  });

  describe('recordReminderSent', () => {
    it('should increment reminders sent count', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      expect(deadline.remindersSent).toBe(0);

      deadline.recordReminderSent();
      expect(deadline.remindersSent).toBe(1);

      deadline.recordReminderSent();
      expect(deadline.remindersSent).toBe(2);
    });

    it('should update lastReminderAt timestamp', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      expect(deadline.lastReminderAt).toBeUndefined();

      deadline.recordReminderSent();

      expect(deadline.lastReminderAt).toBeInstanceOf(Date);
    });
  });

  describe('assignTo', () => {
    it('should assign deadline to user', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      deadline.assignTo('user-456');

      expect(deadline.assignedTo).toBe('user-456');
    });

    it('should update assignee', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
        assignedTo: 'user-123',
      }).value;

      deadline.assignTo('user-789');

      expect(deadline.assignedTo).toBe('user-789');
    });
  });

  describe('updateStatus', () => {
    it('should update status based on current date', () => {
      const createTime = new Date(2025, 0, 1);
      vi.setSystemTime(createTime);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: createTime,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      expect(deadline.status).toBe('PENDING');

      // Move time to 3 days before due date
      vi.setSystemTime(new Date(2025, 0, 20));
      deadline.updateStatus();
      expect(deadline.status).toBe('APPROACHING');

      // Move time to due date
      vi.setSystemTime(new Date(2025, 0, 22));
      deadline.updateStatus();
      expect(deadline.status).toBe('DUE_TODAY');

      // Move time past due date
      vi.setSystemTime(new Date(2025, 0, 25));
      deadline.updateStatus();
      expect(deadline.status).toBe('OVERDUE');
    });

    it('should not update status for completed deadline', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      deadline.complete('user-123');

      vi.setSystemTime(new Date(2025, 0, 25));
      deadline.updateStatus();

      expect(deadline.status).toBe('COMPLETED');
    });
  });

  describe('computed properties', () => {
    it('should calculate daysRemaining correctly', () => {
      const now = new Date(2025, 0, 10);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 20),
        title: 'Test Deadline',
      }).value;

      expect(deadline.daysRemaining).toBe(10);
    });

    it('should return negative daysRemaining for overdue', () => {
      const now = new Date(2025, 0, 25);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: new Date(2025, 0, 1),
        dueDate: new Date(2025, 0, 20),
        title: 'Test Deadline',
      }).value;

      expect(deadline.daysRemaining).toBeLessThan(0);
    });

    it('should return isActive true for pending deadline', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
      }).value;

      expect(deadline.isActive).toBe(true);
    });

    it('should return isActive false for completed/waived', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const completedDeadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Completed',
      }).value;
      completedDeadline.complete('user');
      expect(completedDeadline.isActive).toBe(false);

      const waivedDeadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Waived',
      }).value;
      waivedDeadline.waive('user', 'reason');
      expect(waivedDeadline.isActive).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should serialize deadline to JSON', () => {
      const now = new Date(2025, 0, 1);
      vi.setSystemTime(now);

      const deadline = Deadline.create({
        caseId,
        rule,
        triggerDate: now,
        dueDate: new Date(2025, 0, 22),
        title: 'Test Deadline',
        description: 'Test Description',
        assignedTo: 'user-123',
      }).value;

      const json = deadline.toJSON();

      expect(json.id).toBe(deadline.id.value);
      expect(json.caseId).toBe(caseId.value);
      expect(json.title).toBe('Test Deadline');
      expect(json.description).toBe('Test Description');
      expect(json.assignedTo).toBe('user-123');
      expect(json.status).toBe('PENDING');
      expect(json.priority).toBe('LOW');
      expect(json.rule).toBeDefined();
      expect(json.dueDate).toBe(new Date(2025, 0, 22).toISOString());
      expect(json.triggerDate).toBe(now.toISOString());
      expect(json.remindersSent).toBe(0);
      expect(json.isActive).toBe(true);
      expect(json.isOverdue).toBe(false);
    });
  });

  describe('error classes', () => {
    it('DeadlineAlreadyCompletedError should have correct code', () => {
      const error = new DeadlineAlreadyCompletedError();

      expect(error.code).toBe('DEADLINE_ALREADY_COMPLETED');
      expect(error.message).toBe('Deadline has already been completed');
    });

    it('DeadlineAlreadyWaivedError should have correct code', () => {
      const error = new DeadlineAlreadyWaivedError();

      expect(error.code).toBe('DEADLINE_ALREADY_WAIVED');
      expect(error.message).toBe('Deadline has already been waived');
    });
  });
});
