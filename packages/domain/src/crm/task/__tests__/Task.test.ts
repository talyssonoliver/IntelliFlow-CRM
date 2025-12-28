/**
 * Task Aggregate Root Tests
 *
 * These tests verify the domain logic of the Task entity.
 * They ensure business rules are enforced and domain events are correctly emitted.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Task, TaskAlreadyCompletedError, TaskAlreadyCancelledError } from '../Task';
import { TaskId } from '../TaskId';
import {
  TaskStatus,
  TaskPriority,
  TaskCreatedEvent,
  TaskStatusChangedEvent,
  TaskCompletedEvent,
  TaskCancelledEvent,
  TaskPriorityChangedEvent,
  TaskDueDateChangedEvent,
  TaskAssignedEvent,
} from '../TaskEvents';

describe('Task Aggregate', () => {
  describe('Factory Method - create()', () => {
    it('should create a new task with valid data', () => {
      const dueDate = new Date('2024-12-31');
      const result = Task.create({
        title: 'Follow up with client',
        description: 'Send proposal and schedule demo',
        dueDate,
        priority: 'HIGH',
        leadId: 'lead-123',
        ownerId: 'owner-456',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(Task);

      const task = result.value;
      expect(task.title).toBe('Follow up with client');
      expect(task.description).toBe('Send proposal and schedule demo');
      expect(task.dueDate).toBe(dueDate);
      expect(task.priority).toBe('HIGH');
      expect(task.status).toBe('PENDING');
      expect(task.leadId).toBe('lead-123');
      expect(task.ownerId).toBe('owner-456');
      expect(task.isCompleted).toBe(false);
      expect(task.isCancelled).toBe(false);
    });

    it('should create a task with minimal data', () => {
      const result = Task.create({
        title: 'Simple task',
        ownerId: 'owner-789',
      });

      expect(result.isSuccess).toBe(true);

      const task = result.value;
      expect(task.title).toBe('Simple task');
      expect(task.description).toBeUndefined();
      expect(task.dueDate).toBeUndefined();
      expect(task.priority).toBe('MEDIUM'); // Default priority
      expect(task.status).toBe('PENDING');
      expect(task.leadId).toBeUndefined();
      expect(task.contactId).toBeUndefined();
      expect(task.opportunityId).toBeUndefined();
    });

    it('should create task with contact association', () => {
      const result = Task.create({
        title: 'Contact task',
        contactId: 'contact-123',
        priority: 'LOW',
        ownerId: 'owner-456',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.contactId).toBe('contact-123');
      expect(result.value.priority).toBe('LOW');
    });

    it('should create task with opportunity association', () => {
      const result = Task.create({
        title: 'Opportunity task',
        opportunityId: 'opportunity-789',
        priority: 'URGENT',
        ownerId: 'owner-999',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.opportunityId).toBe('opportunity-789');
      expect(result.value.priority).toBe('URGENT');
    });

    it('should emit TaskCreatedEvent on creation', () => {
      const result = Task.create({
        title: 'Event task',
        priority: 'HIGH',
        ownerId: 'owner-123',
      });

      const task = result.value;
      const events = task.getDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskCreatedEvent);

      const createdEvent = events[0] as TaskCreatedEvent;
      expect(createdEvent.taskId).toBe(task.id);
      expect(createdEvent.title).toBe('Event task');
      expect(createdEvent.priority).toBe('HIGH');
      expect(createdEvent.ownerId).toBe('owner-123');
    });
  });

  describe('Getters', () => {
    let task: Task;
    let dueDate: Date;

    beforeEach(() => {
      dueDate = new Date('2024-12-31');
      const result = Task.create({
        title: 'Test task',
        description: 'Test description',
        dueDate,
        priority: 'MEDIUM',
        leadId: 'lead-123',
        ownerId: 'owner-456',
      });
      task = result.value;
    });

    it('should return all properties correctly', () => {
      expect(task.title).toBe('Test task');
      expect(task.description).toBe('Test description');
      expect(task.dueDate).toBe(dueDate);
      expect(task.priority).toBe('MEDIUM');
      expect(task.status).toBe('PENDING');
      expect(task.leadId).toBe('lead-123');
      expect(task.ownerId).toBe('owner-456');
    });

    it('should check if task is completed', () => {
      expect(task.isCompleted).toBe(false);

      task.complete('user-123');
      expect(task.isCompleted).toBe(true);
    });

    it('should check if task is cancelled', () => {
      expect(task.isCancelled).toBe(false);

      task.cancel('Not needed', 'user-123');
      expect(task.isCancelled).toBe(true);
    });

    it('should check if task is overdue', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const overdueResult = Task.create({
        title: 'Overdue task',
        dueDate: pastDate,
        ownerId: 'owner-123',
      });

      expect(overdueResult.value.isOverdue).toBe(true);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const futureResult = Task.create({
        title: 'Future task',
        dueDate: futureDate,
        ownerId: 'owner-456',
      });

      expect(futureResult.value.isOverdue).toBe(false);
    });

    it('should not be overdue when completed', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const result = Task.create({
        title: 'Completed task',
        dueDate: pastDate,
        ownerId: 'owner-123',
      });

      const completedTask = result.value;
      completedTask.complete('user-456');

      expect(completedTask.isOverdue).toBe(false);
    });

    it('should check if task is due soon', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const dueSoonResult = Task.create({
        title: 'Due soon task',
        dueDate: tomorrow,
        ownerId: 'owner-123',
      });

      expect(dueSoonResult.value.isDueSoon).toBe(true);

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const futureResult = Task.create({
        title: 'Future task',
        dueDate: nextWeek,
        ownerId: 'owner-456',
      });

      expect(futureResult.value.isDueSoon).toBe(false);
    });

    it('should not be due soon when completed', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const result = Task.create({
        title: 'Completed task',
        dueDate: tomorrow,
        ownerId: 'owner-123',
      });

      const completedTask = result.value;
      completedTask.complete('user-456');

      expect(completedTask.isDueSoon).toBe(false);
    });
  });

  describe('changeStatus()', () => {
    let task: Task;

    beforeEach(() => {
      const result = Task.create({
        title: 'Status test',
        ownerId: 'owner-123',
      });
      task = result.value;
      task.clearDomainEvents();
    });

    it('should change status successfully', () => {
      const result = task.changeStatus('IN_PROGRESS', 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(task.status).toBe('IN_PROGRESS');
    });

    it('should emit TaskStatusChangedEvent', () => {
      task.changeStatus('IN_PROGRESS', 'user-456');

      const events = task.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskStatusChangedEvent);

      const statusEvent = events[0] as TaskStatusChangedEvent;
      expect(statusEvent.taskId).toBe(task.id);
      expect(statusEvent.previousStatus).toBe('PENDING');
      expect(statusEvent.newStatus).toBe('IN_PROGRESS');
      expect(statusEvent.changedBy).toBe('user-456');
    });

    it('should fail to change status when already completed', () => {
      task.complete('user-123');
      task.clearDomainEvents();

      const result = task.changeStatus('PENDING', 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCompletedError);
      expect(result.error.code).toBe('TASK_ALREADY_COMPLETED');
    });

    it('should fail to change status when already cancelled', () => {
      task.cancel('Not needed', 'user-123');
      task.clearDomainEvents();

      const result = task.changeStatus('PENDING', 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCancelledError);
      expect(result.error.code).toBe('TASK_ALREADY_CANCELLED');
    });
  });

  describe('start()', () => {
    let task: Task;

    beforeEach(() => {
      const result = Task.create({
        title: 'Start test',
        ownerId: 'owner-123',
      });
      task = result.value;
      task.clearDomainEvents();
    });

    it('should start task successfully', () => {
      const result = task.start('user-123');

      expect(result.isSuccess).toBe(true);
      expect(task.status).toBe('IN_PROGRESS');
    });

    it('should emit TaskStatusChangedEvent', () => {
      task.start('user-456');

      const events = task.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskStatusChangedEvent);

      const statusEvent = events[0] as TaskStatusChangedEvent;
      expect(statusEvent.previousStatus).toBe('PENDING');
      expect(statusEvent.newStatus).toBe('IN_PROGRESS');
    });
  });

  describe('complete()', () => {
    let task: Task;

    beforeEach(() => {
      const result = Task.create({
        title: 'Complete test',
        ownerId: 'owner-123',
      });
      task = result.value;
      task.clearDomainEvents();
    });

    it('should complete task successfully', () => {
      const result = task.complete('user-123');

      expect(result.isSuccess).toBe(true);
      expect(task.status).toBe('COMPLETED');
      expect(task.isCompleted).toBe(true);
      expect(task.completedAt).toBeInstanceOf(Date);
    });

    it('should emit TaskCompletedEvent', () => {
      task.complete('user-456');

      const events = task.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskCompletedEvent);

      const completedEvent = events[0] as TaskCompletedEvent;
      expect(completedEvent.taskId).toBe(task.id);
      expect(completedEvent.completedBy).toBe('user-456');
    });

    it('should fail to complete already completed task', () => {
      task.complete('user-123');
      task.clearDomainEvents();

      const result = task.complete('user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCompletedError);
    });

    it('should fail to complete cancelled task', () => {
      task.cancel('Not needed', 'user-123');
      task.clearDomainEvents();

      const result = task.complete('user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCancelledError);
    });
  });

  describe('cancel()', () => {
    let task: Task;

    beforeEach(() => {
      const result = Task.create({
        title: 'Cancel test',
        ownerId: 'owner-123',
      });
      task = result.value;
      task.clearDomainEvents();
    });

    it('should cancel task successfully', () => {
      const result = task.cancel('No longer needed', 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(task.status).toBe('CANCELLED');
      expect(task.isCancelled).toBe(true);
    });

    it('should emit TaskCancelledEvent', () => {
      task.cancel('Duplicate task', 'user-456');

      const events = task.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskCancelledEvent);

      const cancelledEvent = events[0] as TaskCancelledEvent;
      expect(cancelledEvent.taskId).toBe(task.id);
      expect(cancelledEvent.reason).toBe('Duplicate task');
      expect(cancelledEvent.cancelledBy).toBe('user-456');
    });

    it('should fail to cancel already completed task', () => {
      task.complete('user-123');
      task.clearDomainEvents();

      const result = task.cancel('Too late', 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCompletedError);
    });

    it('should fail to cancel already cancelled task', () => {
      task.cancel('First reason', 'user-123');
      task.clearDomainEvents();

      const result = task.cancel('Second reason', 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCancelledError);
    });
  });

  describe('changePriority()', () => {
    let task: Task;

    beforeEach(() => {
      const result = Task.create({
        title: 'Priority test',
        priority: 'MEDIUM',
        ownerId: 'owner-123',
      });
      task = result.value;
      task.clearDomainEvents();
    });

    it('should change priority successfully', () => {
      const result = task.changePriority('HIGH', 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(task.priority).toBe('HIGH');
    });

    it('should emit TaskPriorityChangedEvent', () => {
      task.changePriority('URGENT', 'user-456');

      const events = task.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskPriorityChangedEvent);

      const priorityEvent = events[0] as TaskPriorityChangedEvent;
      expect(priorityEvent.taskId).toBe(task.id);
      expect(priorityEvent.previousPriority).toBe('MEDIUM');
      expect(priorityEvent.newPriority).toBe('URGENT');
      expect(priorityEvent.changedBy).toBe('user-456');
    });

    it('should fail to change priority when completed', () => {
      task.complete('user-123');
      task.clearDomainEvents();

      const result = task.changePriority('LOW', 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCompletedError);
      expect(task.priority).toBe('MEDIUM'); // Unchanged
    });

    it('should fail to change priority when cancelled', () => {
      task.cancel('Not needed', 'user-123');
      task.clearDomainEvents();

      const result = task.changePriority('LOW', 'user-456');

      expect(result.isFailure).toBe(true);
      expect(task.priority).toBe('MEDIUM'); // Unchanged
    });
  });

  describe('updateDueDate()', () => {
    let task: Task;
    let originalDate: Date;

    beforeEach(() => {
      originalDate = new Date('2024-12-31');
      const result = Task.create({
        title: 'Due date test',
        dueDate: originalDate,
        ownerId: 'owner-123',
      });
      task = result.value;
      task.clearDomainEvents();
    });

    it('should update due date successfully', () => {
      const newDate = new Date('2025-01-15');
      const result = task.updateDueDate(newDate, 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(task.dueDate).toBe(newDate);
    });

    it('should emit TaskDueDateChangedEvent', () => {
      const newDate = new Date('2025-02-28');
      task.updateDueDate(newDate, 'user-456');

      const events = task.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskDueDateChangedEvent);

      const dueDateEvent = events[0] as TaskDueDateChangedEvent;
      expect(dueDateEvent.taskId).toBe(task.id);
      expect(dueDateEvent.previousDueDate).toEqual(originalDate);
      expect(dueDateEvent.newDueDate).toBe(newDate);
      expect(dueDateEvent.changedBy).toBe('user-456');
    });

    it('should handle null previous due date when not set', () => {
      const noDateResult = Task.create({
        title: 'No date task',
        ownerId: 'owner-789',
      });

      const task2 = noDateResult.value;
      task2.clearDomainEvents();

      const newDate = new Date('2025-01-01');
      task2.updateDueDate(newDate, 'user-123');

      const events = task2.getDomainEvents();
      const dueDateEvent = events[0] as TaskDueDateChangedEvent;
      expect(dueDateEvent.previousDueDate).toBeNull();
    });

    it('should fail to update due date when completed', () => {
      task.complete('user-123');
      task.clearDomainEvents();

      const newDate = new Date('2025-01-01');
      const result = task.updateDueDate(newDate, 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCompletedError);
      expect(task.dueDate).toEqual(originalDate); // Unchanged
    });

    it('should fail to update due date when cancelled', () => {
      task.cancel('Not needed', 'user-123');
      task.clearDomainEvents();

      const newDate = new Date('2025-01-01');
      const result = task.updateDueDate(newDate, 'user-456');

      expect(result.isFailure).toBe(true);
      expect(task.dueDate).toEqual(originalDate); // Unchanged
    });
  });

  describe('assignToLead()', () => {
    let task: Task;

    beforeEach(() => {
      const result = Task.create({
        title: 'Assign test',
        ownerId: 'owner-123',
      });
      task = result.value;
      task.clearDomainEvents();
    });

    it('should assign task to lead successfully', () => {
      task.assignToLead('lead-123', 'user-456');

      expect(task.leadId).toBe('lead-123');
      expect(task.contactId).toBeUndefined();
      expect(task.opportunityId).toBeUndefined();
    });

    it('should emit TaskAssignedEvent', () => {
      task.assignToLead('lead-789', 'user-999');

      const events = task.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskAssignedEvent);

      const assignedEvent = events[0] as TaskAssignedEvent;
      expect(assignedEvent.taskId).toBe(task.id);
      expect(assignedEvent.entityType).toBe('lead');
      expect(assignedEvent.entityId).toBe('lead-789');
      expect(assignedEvent.assignedBy).toBe('user-999');
    });

    it('should clear previous contact assignment', () => {
      task.assignToContact('contact-123', 'user-456');
      task.clearDomainEvents();

      task.assignToLead('lead-456', 'user-789');

      expect(task.leadId).toBe('lead-456');
      expect(task.contactId).toBeUndefined();
    });

    it('should clear previous opportunity assignment', () => {
      task.assignToOpportunity('opportunity-123', 'user-456');
      task.clearDomainEvents();

      task.assignToLead('lead-789', 'user-999');

      expect(task.leadId).toBe('lead-789');
      expect(task.opportunityId).toBeUndefined();
    });
  });

  describe('assignToContact()', () => {
    let task: Task;

    beforeEach(() => {
      const result = Task.create({
        title: 'Assign test',
        ownerId: 'owner-123',
      });
      task = result.value;
      task.clearDomainEvents();
    });

    it('should assign task to contact successfully', () => {
      task.assignToContact('contact-123', 'user-456');

      expect(task.contactId).toBe('contact-123');
      expect(task.leadId).toBeUndefined();
      expect(task.opportunityId).toBeUndefined();
    });

    it('should emit TaskAssignedEvent', () => {
      task.assignToContact('contact-789', 'user-999');

      const events = task.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskAssignedEvent);

      const assignedEvent = events[0] as TaskAssignedEvent;
      expect(assignedEvent.entityType).toBe('contact');
      expect(assignedEvent.entityId).toBe('contact-789');
    });

    it('should clear previous lead assignment', () => {
      task.assignToLead('lead-123', 'user-456');
      task.clearDomainEvents();

      task.assignToContact('contact-456', 'user-789');

      expect(task.contactId).toBe('contact-456');
      expect(task.leadId).toBeUndefined();
    });
  });

  describe('assignToOpportunity()', () => {
    let task: Task;

    beforeEach(() => {
      const result = Task.create({
        title: 'Assign test',
        ownerId: 'owner-123',
      });
      task = result.value;
      task.clearDomainEvents();
    });

    it('should assign task to opportunity successfully', () => {
      task.assignToOpportunity('opportunity-123', 'user-456');

      expect(task.opportunityId).toBe('opportunity-123');
      expect(task.leadId).toBeUndefined();
      expect(task.contactId).toBeUndefined();
    });

    it('should emit TaskAssignedEvent', () => {
      task.assignToOpportunity('opportunity-789', 'user-999');

      const events = task.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskAssignedEvent);

      const assignedEvent = events[0] as TaskAssignedEvent;
      expect(assignedEvent.entityType).toBe('opportunity');
      expect(assignedEvent.entityId).toBe('opportunity-789');
    });

    it('should clear previous contact assignment', () => {
      task.assignToContact('contact-123', 'user-456');
      task.clearDomainEvents();

      task.assignToOpportunity('opportunity-456', 'user-789');

      expect(task.opportunityId).toBe('opportunity-456');
      expect(task.contactId).toBeUndefined();
    });
  });

  describe('updateTaskInfo()', () => {
    let task: Task;

    beforeEach(() => {
      const result = Task.create({
        title: 'Original title',
        description: 'Original description',
        ownerId: 'owner-123',
      });
      task = result.value;
    });

    it('should update task title successfully', () => {
      task.updateTaskInfo({ title: 'New title' });

      expect(task.title).toBe('New title');
      expect(task.description).toBe('Original description'); // Unchanged
    });

    it('should update task description successfully', () => {
      task.updateTaskInfo({ description: 'New description' });

      expect(task.title).toBe('Original title'); // Unchanged
      expect(task.description).toBe('New description');
    });

    it('should update both title and description', () => {
      task.updateTaskInfo({
        title: 'Updated title',
        description: 'Updated description',
      });

      expect(task.title).toBe('Updated title');
      expect(task.description).toBe('Updated description');
    });

    it('should not emit domain event for info update', () => {
      task.clearDomainEvents();
      task.updateTaskInfo({ title: 'New title' });

      const events = task.getDomainEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('State Transitions', () => {
    it('should transition from pending to in progress to completed', () => {
      const result = Task.create({
        title: 'Transition test',
        ownerId: 'owner-123',
      });

      const task = result.value;
      expect(task.status).toBe('PENDING');

      task.start('user-456');
      expect(task.status).toBe('IN_PROGRESS');

      task.complete('user-789');
      expect(task.status).toBe('COMPLETED');
    });

    it('should allow completion from pending without starting', () => {
      const result = Task.create({
        title: 'Direct complete',
        ownerId: 'owner-123',
      });

      const task = result.value;
      const completeResult = task.complete('user-456');

      expect(completeResult.isSuccess).toBe(true);
      expect(task.status).toBe('COMPLETED');
    });

    it('should reject transitions from completed state', () => {
      const result = Task.create({
        title: 'Completed transition test',
        ownerId: 'owner-123',
      });

      const task = result.value;
      task.complete('user-456');

      const statusResult = task.changeStatus('PENDING', 'user-789');
      expect(statusResult.isFailure).toBe(true);

      const priorityResult = task.changePriority('HIGH', 'user-999');
      expect(priorityResult.isFailure).toBe(true);

      const dueDateResult = task.updateDueDate(new Date(), 'user-111');
      expect(dueDateResult.isFailure).toBe(true);
    });

    it('should reject transitions from cancelled state', () => {
      const result = Task.create({
        title: 'Cancelled transition test',
        ownerId: 'owner-123',
      });

      const task = result.value;
      task.cancel('Not needed', 'user-456');

      const statusResult = task.changeStatus('PENDING', 'user-789');
      expect(statusResult.isFailure).toBe(true);

      const completeResult = task.complete('user-999');
      expect(completeResult.isFailure).toBe(true);
    });
  });

  describe('Serialization', () => {
    it('should serialize task to JSON', () => {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7); // 7 days in the future
      const result = Task.create({
        title: 'JSON test task',
        description: 'JSON test description',
        dueDate,
        priority: 'HIGH',
        leadId: 'lead-123',
        ownerId: 'owner-456',
      });

      const task = result.value;
      task.start('user-789');

      const json = task.toJSON();

      expect(json).toHaveProperty('id');
      expect(json.title).toBe('JSON test task');
      expect(json.description).toBe('JSON test description');
      expect(json.dueDate).toBe(dueDate.toISOString());
      expect(json.priority).toBe('HIGH');
      expect(json.status).toBe('IN_PROGRESS');
      expect(json.leadId).toBe('lead-123');
      expect(json.ownerId).toBe('owner-456');
      expect(json.isOverdue).toBe(false);
      expect(json.isDueSoon).toBe(false);
      expect(json).toHaveProperty('createdAt');
      expect(json).toHaveProperty('updatedAt');
      expect(json.completedAt).toBeUndefined();
    });

    it('should include completedAt when task is completed', () => {
      const result = Task.create({
        title: 'Completed JSON',
        ownerId: 'owner-123',
      });

      const task = result.value;
      task.complete('user-456');

      const json = task.toJSON();
      expect(json.completedAt).toBeDefined();
      expect(json.status).toBe('COMPLETED');
    });

    it('should include isOverdue and isDueSoon flags', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const result = Task.create({
        title: 'Due soon task',
        dueDate: tomorrow,
        ownerId: 'owner-123',
      });

      const task = result.value;
      const json = task.toJSON();

      expect(json.isDueSoon).toBe(true);
      expect(json.isOverdue).toBe(false);
    });
  });

  describe('reconstitute()', () => {
    it('should reconstitute task from persistence', () => {
      const id = TaskId.generate();
      const now = new Date();
      const dueDate = new Date('2024-12-31');

      const task = Task.reconstitute(id, {
        title: 'Reconstituted task',
        description: 'Reconstituted description',
        dueDate,
        priority: 'URGENT',
        status: 'IN_PROGRESS',
        leadId: 'lead-999',
        contactId: undefined,
        opportunityId: undefined,
        ownerId: 'owner-777',
        createdAt: now,
        updatedAt: now,
      });

      expect(task.id).toBe(id);
      expect(task.title).toBe('Reconstituted task');
      expect(task.description).toBe('Reconstituted description');
      expect(task.dueDate).toBe(dueDate);
      expect(task.priority).toBe('URGENT');
      expect(task.status).toBe('IN_PROGRESS');
      expect(task.leadId).toBe('lead-999');
      expect(task.ownerId).toBe('owner-777');
    });

    it('should reconstitute completed task', () => {
      const id = TaskId.generate();
      const completedAt = new Date();

      const task = Task.reconstitute(id, {
        title: 'Completed task',
        priority: 'MEDIUM',
        status: 'COMPLETED',
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt,
      });

      expect(task.status).toBe('COMPLETED');
      expect(task.isCompleted).toBe(true);
      expect(task.completedAt).toBe(completedAt);
    });

    it('should reconstitute task with multiple entity associations', () => {
      const id = TaskId.generate();

      const task = Task.reconstitute(id, {
        title: 'Multi-entity task',
        priority: 'LOW',
        status: 'PENDING',
        leadId: 'lead-123',
        contactId: 'contact-456',
        opportunityId: 'opportunity-789',
        ownerId: 'owner-999',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(task.leadId).toBe('lead-123');
      expect(task.contactId).toBe('contact-456');
      expect(task.opportunityId).toBe('opportunity-789');
    });
  });

  describe('Domain Events', () => {
    it('should accumulate multiple domain events', () => {
      const result = Task.create({
        title: 'Events test',
        priority: 'MEDIUM',
        ownerId: 'owner-123',
      });

      const task = result.value;

      // Creation event is already added
      expect(task.getDomainEvents()).toHaveLength(1);

      task.start('user-123');
      expect(task.getDomainEvents()).toHaveLength(2);

      task.changePriority('HIGH', 'user-456');
      expect(task.getDomainEvents()).toHaveLength(3);

      task.assignToLead('lead-789', 'user-999');
      expect(task.getDomainEvents()).toHaveLength(4);
    });

    it('should clear domain events', () => {
      const result = Task.create({
        title: 'Clear test',
        ownerId: 'owner-123',
      });

      const task = result.value;
      expect(task.getDomainEvents()).toHaveLength(1);

      task.clearDomainEvents();
      expect(task.getDomainEvents()).toHaveLength(0);
    });
  });
});
