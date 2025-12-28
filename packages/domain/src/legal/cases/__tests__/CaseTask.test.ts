/**
 * CaseTask Entity Tests
 *
 * Tests for the CaseTask entity ensuring proper behavior
 * for task lifecycle management within a case.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CaseTask,
  CaseTaskAlreadyCompletedError,
  CaseTaskAlreadyCancelledError,
} from '../CaseTask';
import { CaseTaskId } from '../CaseTaskId';

describe('CaseTask Entity', () => {
  describe('Factory Method - create()', () => {
    it('should create a new task with valid data', () => {
      const result = CaseTask.create({
        title: 'Review contract',
        description: 'Review the client contract for compliance',
        dueDate: new Date('2025-01-15'),
        assignee: 'user-123',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(CaseTask);

      const task = result.value;
      expect(task.title).toBe('Review contract');
      expect(task.description).toBe('Review the client contract for compliance');
      expect(task.status).toBe('PENDING');
      expect(task.assignee).toBe('user-123');
      expect(task.isCompleted).toBe(false);
      expect(task.isCancelled).toBe(false);
    });

    it('should create a task with minimal data', () => {
      const result = CaseTask.create({
        title: 'Simple task',
      });

      expect(result.isSuccess).toBe(true);

      const task = result.value;
      expect(task.title).toBe('Simple task');
      expect(task.description).toBeUndefined();
      expect(task.dueDate).toBeUndefined();
      expect(task.assignee).toBeUndefined();
      expect(task.status).toBe('PENDING');
    });

    it('should set timestamps on creation', () => {
      const beforeCreate = new Date();
      const result = CaseTask.create({ title: 'Task' });
      const afterCreate = new Date();

      const task = result.value;
      expect(task.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(task.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
      expect(task.updatedAt.getTime()).toBe(task.createdAt.getTime());
    });
  });

  describe('Getters', () => {
    let task: CaseTask;

    beforeEach(() => {
      const result = CaseTask.create({
        title: 'Test task',
        description: 'A test task',
        dueDate: new Date('2025-01-20'),
        assignee: 'user-456',
      });
      task = result.value;
    });

    it('should return correct property values', () => {
      expect(task.title).toBe('Test task');
      expect(task.description).toBe('A test task');
      expect(task.status).toBe('PENDING');
      expect(task.assignee).toBe('user-456');
    });

    it('should check if task is overdue', () => {
      // Create a task with a future due date
      const futureTask = CaseTask.create({
        title: 'Future task',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days in future
      });
      expect(futureTask.value.isOverdue).toBe(false);

      // Create overdue task
      const overdueResult = CaseTask.create({
        title: 'Overdue task',
        dueDate: new Date('2020-01-01'),
      });
      expect(overdueResult.value.isOverdue).toBe(true);
    });

    it('should not be overdue if completed', () => {
      const overdueResult = CaseTask.create({
        title: 'Overdue task',
        dueDate: new Date('2020-01-01'),
      });
      const overdueTask = overdueResult.value;
      overdueTask.complete();

      expect(overdueTask.isOverdue).toBe(false);
    });

    it('should not be overdue if cancelled', () => {
      const overdueResult = CaseTask.create({
        title: 'Overdue task',
        dueDate: new Date('2020-01-01'),
      });
      const overdueTask = overdueResult.value;
      overdueTask.cancel();

      expect(overdueTask.isOverdue).toBe(false);
    });

    it('should not be overdue without due date', () => {
      const noDueDateResult = CaseTask.create({
        title: 'No due date',
      });
      expect(noDueDateResult.value.isOverdue).toBe(false);
    });
  });

  describe('complete()', () => {
    let task: CaseTask;

    beforeEach(() => {
      task = CaseTask.create({ title: 'Task to complete' }).value;
    });

    it('should complete a pending task', () => {
      const result = task.complete();

      expect(result.isSuccess).toBe(true);
      expect(task.status).toBe('COMPLETED');
      expect(task.isCompleted).toBe(true);
      expect(task.completedAt).toBeDefined();
    });

    it('should fail to complete an already completed task', () => {
      task.complete();
      const result = task.complete();

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(CaseTaskAlreadyCompletedError);
      expect(result.error.code).toBe('CASE_TASK_ALREADY_COMPLETED');
    });

    it('should fail to complete a cancelled task', () => {
      task.cancel();
      const result = task.complete();

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(CaseTaskAlreadyCancelledError);
    });
  });

  describe('cancel()', () => {
    let task: CaseTask;

    beforeEach(() => {
      task = CaseTask.create({ title: 'Task to cancel' }).value;
    });

    it('should cancel a pending task', () => {
      const result = task.cancel();

      expect(result.isSuccess).toBe(true);
      expect(task.status).toBe('CANCELLED');
      expect(task.isCancelled).toBe(true);
    });

    it('should fail to cancel an already completed task', () => {
      task.complete();
      const result = task.cancel();

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(CaseTaskAlreadyCompletedError);
    });

    it('should fail to cancel an already cancelled task', () => {
      task.cancel();
      const result = task.cancel();

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(CaseTaskAlreadyCancelledError);
    });
  });

  describe('start()', () => {
    let task: CaseTask;

    beforeEach(() => {
      task = CaseTask.create({ title: 'Task to start' }).value;
    });

    it('should start a pending task', () => {
      const result = task.start();

      expect(result.isSuccess).toBe(true);
      expect(task.status).toBe('IN_PROGRESS');
    });

    it('should fail to start a completed task', () => {
      task.complete();
      const result = task.start();

      expect(result.isFailure).toBe(true);
    });

    it('should fail to start a cancelled task', () => {
      task.cancel();
      const result = task.start();

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateDueDate()', () => {
    let task: CaseTask;

    beforeEach(() => {
      task = CaseTask.create({
        title: 'Task with due date',
        dueDate: new Date('2025-01-15'),
      }).value;
    });

    it('should update the due date', () => {
      const newDueDate = new Date('2025-02-01');
      const result = task.updateDueDate(newDueDate);

      expect(result.isSuccess).toBe(true);
      expect(task.dueDate).toEqual(newDueDate);
    });

    it('should fail to update due date of completed task', () => {
      task.complete();
      const result = task.updateDueDate(new Date('2025-02-01'));

      expect(result.isFailure).toBe(true);
    });

    it('should fail to update due date of cancelled task', () => {
      task.cancel();
      const result = task.updateDueDate(new Date('2025-02-01'));

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateAssignee()', () => {
    it('should update the assignee', () => {
      const task = CaseTask.create({ title: 'Task' }).value;
      task.updateAssignee('new-user-789');

      expect(task.assignee).toBe('new-user-789');
    });
  });

  describe('updateInfo()', () => {
    it('should update title and description', () => {
      const task = CaseTask.create({
        title: 'Original title',
        description: 'Original description',
      }).value;

      task.updateInfo({
        title: 'Updated title',
        description: 'Updated description',
      });

      expect(task.title).toBe('Updated title');
      expect(task.description).toBe('Updated description');
    });

    it('should update only provided fields', () => {
      const task = CaseTask.create({
        title: 'Original title',
        description: 'Original description',
      }).value;

      task.updateInfo({ title: 'New title' });

      expect(task.title).toBe('New title');
      expect(task.description).toBe('Original description');
    });
  });

  describe('reconstitute()', () => {
    it('should reconstitute a task from persistence', () => {
      const id = CaseTaskId.generate();
      const now = new Date();

      const task = CaseTask.reconstitute(id, {
        title: 'Reconstituted task',
        description: 'From database',
        dueDate: new Date('2025-01-20'),
        status: 'IN_PROGRESS',
        assignee: 'user-123',
        createdAt: now,
        updatedAt: now,
      });

      expect(task.id).toBe(id);
      expect(task.title).toBe('Reconstituted task');
      expect(task.status).toBe('IN_PROGRESS');
    });
  });

  describe('toJSON()', () => {
    it('should serialize task to JSON', () => {
      const dueDate = new Date('2025-01-20');
      const result = CaseTask.create({
        title: 'JSON task',
        description: 'For serialization',
        dueDate,
        assignee: 'user-123',
      });

      const json = result.value.toJSON();

      expect(json).toHaveProperty('id');
      expect(json.title).toBe('JSON task');
      expect(json.description).toBe('For serialization');
      expect(json.status).toBe('PENDING');
      expect(json.assignee).toBe('user-123');
      expect(json).toHaveProperty('createdAt');
      expect(json).toHaveProperty('updatedAt');
    });

    it('should include isOverdue flag', () => {
      const overdueTask = CaseTask.create({
        title: 'Overdue',
        dueDate: new Date('2020-01-01'),
      }).value;

      const json = overdueTask.toJSON();
      expect(json.isOverdue).toBe(true);
    });
  });
});
