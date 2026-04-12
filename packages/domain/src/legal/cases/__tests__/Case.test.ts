/**
 * Case Aggregate Root Tests
 *
 * These tests verify the domain logic of the Case entity.
 * They ensure business rules are enforced and domain events are correctly emitted.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Case,
  CaseAlreadyClosedError,
  CaseAlreadyCancelledError,
  CaseTaskNotFoundError,
  CaseInvalidStatusTransitionError,
} from '../Case';
import { CaseId } from '../CaseId';
import { CaseTaskId } from '../CaseTaskId';
import {
  CaseCreatedEvent,
  CaseStatusChangedEvent,
  CaseDeadlineUpdatedEvent,
  CaseTaskAddedEvent,
  CaseTaskRemovedEvent,
  CaseTaskCompletedEvent,
  CasePriorityChangedEvent,
  CaseClosedEvent,
} from '../CaseEvents';

describe('Case Aggregate', () => {
  describe('Factory Method - create()', () => {
    it('should create a new case with valid data', () => {
      const result = Case.create({
        title: 'Client Matter - Contract Review',
        description: 'Annual contract review for ABC Corp',
        priority: 'HIGH',
        deadline: new Date('2025-02-01'),
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeInstanceOf(Case);

      const legalCase = result.value;
      expect(legalCase.title).toBe('Client Matter - Contract Review');
      expect(legalCase.description).toBe('Annual contract review for ABC Corp');
      expect(legalCase.status).toBe('OPEN');
      expect(legalCase.priority).toBe('HIGH');
      expect(legalCase.clientId).toBe('client-123');
      expect(legalCase.assignedTo).toBe('lawyer-456');
      expect(legalCase.isClosed).toBe(false);
      expect(legalCase.isCancelled).toBe(false);
      expect(legalCase.tasks).toHaveLength(0);
    });

    it('should create a case with minimal data', () => {
      const result = Case.create({
        title: 'Simple Matter',
        clientId: 'client-789',
        assignedTo: 'lawyer-123',
      });

      expect(result.isSuccess).toBe(true);

      const legalCase = result.value;
      expect(legalCase.title).toBe('Simple Matter');
      expect(legalCase.description).toBeUndefined();
      expect(legalCase.priority).toBe('MEDIUM'); // Default priority
      expect(legalCase.deadline).toBeUndefined();
    });

    it('should emit CaseCreatedEvent on creation', () => {
      const result = Case.create({
        title: 'New Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
        priority: 'URGENT',
      });

      const legalCase = result.value;
      const events = legalCase.getDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(CaseCreatedEvent);

      const createdEvent = events[0] as CaseCreatedEvent;
      expect(createdEvent.caseId).toBe(legalCase.id);
      expect(createdEvent.title).toBe('New Case');
      expect(createdEvent.clientId).toBe('client-123');
      expect(createdEvent.assignedTo).toBe('lawyer-456');
      expect(createdEvent.priority).toBe('URGENT');
    });
  });

  describe('Getters', () => {
    let legalCase: Case;

    beforeEach(() => {
      const result = Case.create({
        title: 'Test Case',
        description: 'Test description',
        priority: 'HIGH',
        deadline: new Date('2025-03-01'),
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      });
      legalCase = result.value;
    });

    it('should return correct property values', () => {
      expect(legalCase.title).toBe('Test Case');
      expect(legalCase.description).toBe('Test description');
      expect(legalCase.status).toBe('OPEN');
      expect(legalCase.priority).toBe('HIGH');
      expect(legalCase.clientId).toBe('client-123');
      expect(legalCase.assignedTo).toBe('lawyer-456');
    });

    it('should check if case is overdue', () => {
      // Create a case with a future deadline
      const futureCase = Case.create({
        title: 'Future Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days in future
      });
      expect(futureCase.value.isOverdue).toBe(false);

      // Create overdue case
      const overdueResult = Case.create({
        title: 'Overdue Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
        deadline: new Date('2020-01-01'),
      });
      expect(overdueResult.value.isOverdue).toBe(true);
    });

    it('should not be overdue if closed', () => {
      const overdueResult = Case.create({
        title: 'Overdue Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
        deadline: new Date('2020-01-01'),
      });
      const overdueCase = overdueResult.value;
      overdueCase.close('Resolved', 'user-123');

      expect(overdueCase.isOverdue).toBe(false);
    });

    it('should calculate task progress correctly', () => {
      expect(legalCase.taskProgress).toBe(0); // No tasks
      expect(legalCase.pendingTaskCount).toBe(0);
      expect(legalCase.completedTaskCount).toBe(0);

      // Add tasks
      legalCase.addTask({ title: 'Task 1' }, 'user-123');
      legalCase.addTask({ title: 'Task 2' }, 'user-123');

      expect(legalCase.taskProgress).toBe(0); // 0% complete
      expect(legalCase.pendingTaskCount).toBe(2);
      expect(legalCase.completedTaskCount).toBe(0);

      // Complete one task
      const task = legalCase.tasks[0];
      legalCase.completeTask(task.id, 'user-123');

      expect(legalCase.taskProgress).toBe(50); // 50% complete
      expect(legalCase.completedTaskCount).toBe(1);
    });
  });

  describe('changeStatus()', () => {
    let legalCase: Case;

    beforeEach(() => {
      const result = Case.create({
        title: 'Status Test Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      });
      legalCase = result.value;
      legalCase.clearDomainEvents();
    });

    it('should change status from OPEN to IN_PROGRESS', () => {
      const result = legalCase.changeStatus('IN_PROGRESS', 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(legalCase.status).toBe('IN_PROGRESS');
    });

    it('should emit CaseStatusChangedEvent', () => {
      legalCase.changeStatus('IN_PROGRESS', 'user-456');

      const events = legalCase.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(CaseStatusChangedEvent);

      const statusEvent = events[0] as CaseStatusChangedEvent;
      expect(statusEvent.caseId).toBe(legalCase.id);
      expect(statusEvent.previousStatus).toBe('OPEN');
      expect(statusEvent.newStatus).toBe('IN_PROGRESS');
      expect(statusEvent.changedBy).toBe('user-456');
    });

    it('should fail to change status of closed case', () => {
      legalCase.close('Resolved', 'user-123');
      legalCase.clearDomainEvents();

      const result = legalCase.changeStatus('IN_PROGRESS', 'user-999');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(CaseAlreadyClosedError);
      expect(result.error.code).toBe('CASE_ALREADY_CLOSED');
    });

    it('should fail to change status of cancelled case', () => {
      legalCase.cancel('No longer needed', 'user-123');
      legalCase.clearDomainEvents();

      const result = legalCase.changeStatus('IN_PROGRESS', 'user-999');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(CaseAlreadyCancelledError);
    });

    it('should fail for invalid status transitions', () => {
      legalCase.changeStatus('CLOSED', 'user-123');
      legalCase.clearDomainEvents();

      // Trying to transition from CLOSED to IN_PROGRESS
      const closedCase = Case.create({
        title: 'Test',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      }).value;
      closedCase.changeStatus('CLOSED', 'user-123');
      closedCase.clearDomainEvents();

      const result = closedCase.changeStatus('IN_PROGRESS', 'user-123');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(CaseAlreadyClosedError);
    });

    it('should validate transition from ON_HOLD', () => {
      legalCase.changeStatus('IN_PROGRESS', 'user-123');
      legalCase.changeStatus('ON_HOLD', 'user-123');
      legalCase.clearDomainEvents();

      // Valid: ON_HOLD -> IN_PROGRESS
      const result = legalCase.changeStatus('IN_PROGRESS', 'user-123');
      expect(result.isSuccess).toBe(true);
    });
  });

  describe('close()', () => {
    let legalCase: Case;

    beforeEach(() => {
      const result = Case.create({
        title: 'Close Test Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      });
      legalCase = result.value;
      legalCase.clearDomainEvents();
    });

    it('should close a case with resolution', () => {
      const result = legalCase.close('Successfully resolved', 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(legalCase.status).toBe('CLOSED');
      expect(legalCase.isClosed).toBe(true);
      expect(legalCase.resolution).toBe('Successfully resolved');
      expect(legalCase.closedAt).toBeDefined();
    });

    it('should emit CaseClosedEvent', () => {
      legalCase.close('Case closed', 'user-789');

      const events = legalCase.getDomainEvents();
      expect(events).toHaveLength(2); // StatusChanged + Closed

      const closedEvent = events.find((e) => e instanceof CaseClosedEvent) as CaseClosedEvent;
      expect(closedEvent).toBeDefined();
      expect(closedEvent.caseId).toBe(legalCase.id);
      expect(closedEvent.resolution).toBe('Case closed');
      expect(closedEvent.closedBy).toBe('user-789');
    });

    it('should fail to close already closed case', () => {
      legalCase.close('First close', 'user-123');

      const result = legalCase.close('Second close', 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(CaseAlreadyClosedError);
    });
  });

  describe('cancel()', () => {
    let legalCase: Case;

    beforeEach(() => {
      const result = Case.create({
        title: 'Cancel Test Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      });
      legalCase = result.value;
      legalCase.clearDomainEvents();
    });

    it('should cancel a case with reason', () => {
      const result = legalCase.cancel('Client withdrew', 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(legalCase.status).toBe('CANCELLED');
      expect(legalCase.isCancelled).toBe(true);
      expect(legalCase.resolution).toBe('Client withdrew');
    });

    it('should fail to cancel already closed case', () => {
      legalCase.close('Resolved', 'user-123');

      const result = legalCase.cancel('Try to cancel', 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(CaseAlreadyClosedError);
    });

    it('should fail to cancel already cancelled case', () => {
      legalCase.cancel('First cancel', 'user-123');

      const result = legalCase.cancel('Second cancel', 'user-456');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(CaseAlreadyCancelledError);
    });
  });

  describe('updateDeadline()', () => {
    let legalCase: Case;

    beforeEach(() => {
      const result = Case.create({
        title: 'Deadline Test Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
        deadline: new Date('2025-01-15'),
      });
      legalCase = result.value;
      legalCase.clearDomainEvents();
    });

    it('should update the deadline', () => {
      const newDeadline = new Date('2025-02-01');
      const result = legalCase.updateDeadline(newDeadline, 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(legalCase.deadline).toEqual(newDeadline);
    });

    it('should emit CaseDeadlineUpdatedEvent', () => {
      const newDeadline = new Date('2025-02-15');
      legalCase.updateDeadline(newDeadline, 'user-456');

      const events = legalCase.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(CaseDeadlineUpdatedEvent);

      const deadlineEvent = events[0] as CaseDeadlineUpdatedEvent;
      expect(deadlineEvent.caseId).toBe(legalCase.id);
      expect(deadlineEvent.newDeadline).toEqual(newDeadline);
      expect(deadlineEvent.changedBy).toBe('user-456');
    });

    it('should fail to update deadline of closed case', () => {
      legalCase.close('Done', 'user-123');

      const result = legalCase.updateDeadline(new Date('2025-03-01'), 'user-456');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('changePriority()', () => {
    let legalCase: Case;

    beforeEach(() => {
      const result = Case.create({
        title: 'Priority Test Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
        priority: 'MEDIUM',
      });
      legalCase = result.value;
      legalCase.clearDomainEvents();
    });

    it('should change the priority', () => {
      const result = legalCase.changePriority('URGENT', 'user-123');

      expect(result.isSuccess).toBe(true);
      expect(legalCase.priority).toBe('URGENT');
    });

    it('should emit CasePriorityChangedEvent', () => {
      legalCase.changePriority('HIGH', 'user-456');

      const events = legalCase.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(CasePriorityChangedEvent);

      const priorityEvent = events[0] as CasePriorityChangedEvent;
      expect(priorityEvent.caseId).toBe(legalCase.id);
      expect(priorityEvent.previousPriority).toBe('MEDIUM');
      expect(priorityEvent.newPriority).toBe('HIGH');
    });

    it('should fail to change priority of closed case', () => {
      legalCase.close('Done', 'user-123');

      const result = legalCase.changePriority('URGENT', 'user-456');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('Task Management', () => {
    let legalCase: Case;

    beforeEach(() => {
      const result = Case.create({
        title: 'Task Management Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      });
      legalCase = result.value;
      legalCase.clearDomainEvents();
    });

    describe('addTask()', () => {
      it('should add a task to the case', () => {
        const result = legalCase.addTask(
          {
            title: 'Review documents',
            description: 'Review all client documents',
            dueDate: new Date('2025-01-20'),
            assignee: 'user-789',
          },
          'user-123'
        );

        expect(result.isSuccess).toBe(true);
        expect(legalCase.tasks).toHaveLength(1);
        expect(legalCase.tasks[0].title).toBe('Review documents');
      });

      it('should emit CaseTaskAddedEvent', () => {
        legalCase.addTask({ title: 'New task' }, 'user-123');

        const events = legalCase.getDomainEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(CaseTaskAddedEvent);

        const taskEvent = events[0] as CaseTaskAddedEvent;
        expect(taskEvent.caseId).toBe(legalCase.id);
        expect(taskEvent.title).toBe('New task');
        expect(taskEvent.addedBy).toBe('user-123');
      });

      it('should fail to add task to closed case', () => {
        legalCase.close('Done', 'user-123');

        const result = legalCase.addTask({ title: 'New task' }, 'user-456');

        expect(result.isFailure).toBe(true);
      });
    });

    describe('removeTask()', () => {
      it('should remove a task from the case', () => {
        const addResult = legalCase.addTask({ title: 'Task to remove' }, 'user-123');
        const taskId = addResult.value.id;
        legalCase.clearDomainEvents();

        const result = legalCase.removeTask(taskId, 'user-456');

        expect(result.isSuccess).toBe(true);
        expect(legalCase.tasks).toHaveLength(0);
      });

      it('should emit CaseTaskRemovedEvent', () => {
        const addResult = legalCase.addTask({ title: 'Task to remove' }, 'user-123');
        const taskId = addResult.value.id;
        legalCase.clearDomainEvents();

        legalCase.removeTask(taskId, 'user-456');

        const events = legalCase.getDomainEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(CaseTaskRemovedEvent);

        const removeEvent = events[0] as CaseTaskRemovedEvent;
        expect(removeEvent.caseId).toBe(legalCase.id);
        expect(removeEvent.taskId).toBe(taskId);
        expect(removeEvent.removedBy).toBe('user-456');
      });

      it('should fail to remove non-existent task', () => {
        const fakeTaskId = CaseTaskId.generate();
        const result = legalCase.removeTask(fakeTaskId, 'user-123');

        expect(result.isFailure).toBe(true);
        expect(result.error).toBeInstanceOf(CaseTaskNotFoundError);
      });

      it('should fail to remove task from closed case', () => {
        const addResult = legalCase.addTask({ title: 'Task' }, 'user-123');
        const taskId = addResult.value.id;
        legalCase.close('Done', 'user-123');

        const result = legalCase.removeTask(taskId, 'user-456');

        expect(result.isFailure).toBe(true);
      });
    });

    describe('completeTask()', () => {
      it('should complete a task in the case', () => {
        const addResult = legalCase.addTask({ title: 'Task to complete' }, 'user-123');
        const taskId = addResult.value.id;
        legalCase.clearDomainEvents();

        const result = legalCase.completeTask(taskId, 'user-456');

        expect(result.isSuccess).toBe(true);
        expect(legalCase.tasks[0].status).toBe('COMPLETED');
        expect(legalCase.tasks[0].completedAt).toBeDefined();
      });

      it('should emit CaseTaskCompletedEvent', () => {
        const addResult = legalCase.addTask({ title: 'Task to complete' }, 'user-123');
        const taskId = addResult.value.id;
        legalCase.clearDomainEvents();

        legalCase.completeTask(taskId, 'user-789');

        const events = legalCase.getDomainEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(CaseTaskCompletedEvent);

        const completeEvent = events[0] as CaseTaskCompletedEvent;
        expect(completeEvent.caseId).toBe(legalCase.id);
        expect(completeEvent.taskId).toBe(taskId);
        expect(completeEvent.completedBy).toBe('user-789');
      });

      it('should fail to complete non-existent task', () => {
        const fakeTaskId = CaseTaskId.generate();
        const result = legalCase.completeTask(fakeTaskId, 'user-123');

        expect(result.isFailure).toBe(true);
        expect(result.error).toBeInstanceOf(CaseTaskNotFoundError);
      });
    });

    describe('findTask()', () => {
      it('should find existing task', () => {
        const addResult = legalCase.addTask({ title: 'Findable task' }, 'user-123');
        const taskId = addResult.value.id;

        const foundTask = legalCase.findTask(taskId);

        expect(foundTask).toBeDefined();
        expect(foundTask?.title).toBe('Findable task');
      });

      it('should return undefined for non-existent task', () => {
        const fakeTaskId = CaseTaskId.generate();
        const foundTask = legalCase.findTask(fakeTaskId);

        expect(foundTask).toBeUndefined();
      });
    });
  });

  describe('updateCaseInfo()', () => {
    it('should update case title and description', () => {
      const legalCase = Case.create({
        title: 'Original Title',
        description: 'Original Description',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      }).value;

      legalCase.updateCaseInfo({
        title: 'Updated Title',
        description: 'Updated Description',
      });

      expect(legalCase.title).toBe('Updated Title');
      expect(legalCase.description).toBe('Updated Description');
    });
  });

  describe('reassign()', () => {
    it('should reassign the case', () => {
      const legalCase = Case.create({
        title: 'Case to reassign',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      }).value;

      legalCase.reassign('new-lawyer-789');

      expect(legalCase.assignedTo).toBe('new-lawyer-789');
    });
  });

  describe('reconstitute()', () => {
    it('should reconstitute case from persistence', () => {
      const id = CaseId.generate();
      const now = new Date();

      const legalCase = Case.reconstitute(id, {
        title: 'Reconstituted Case',
        description: 'From database',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        deadline: new Date('2025-02-01'),
        clientId: 'client-999',
        assignedTo: 'lawyer-888',
        tasks: [],
        createdAt: now,
        updatedAt: now,
      });

      expect(legalCase.id).toBe(id);
      expect(legalCase.title).toBe('Reconstituted Case');
      expect(legalCase.status).toBe('IN_PROGRESS');
      expect(legalCase.priority).toBe('HIGH');
    });
  });

  describe('toJSON()', () => {
    it('should serialize case to JSON', () => {
      const legalCase = Case.create({
        title: 'JSON Case',
        description: 'For serialization',
        priority: 'URGENT',
        deadline: new Date('2025-03-01'),
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      }).value;

      // Add a task
      legalCase.addTask({ title: 'Task 1' }, 'user-123');

      const json = legalCase.toJSON();

      expect(json).toHaveProperty('id');
      expect(json.title).toBe('JSON Case');
      expect(json.description).toBe('For serialization');
      expect(json.status).toBe('OPEN');
      expect(json.priority).toBe('URGENT');
      expect(json.clientId).toBe('client-123');
      expect(json.assignedTo).toBe('lawyer-456');
      expect(json.tasks).toHaveLength(1);
      expect(json.taskProgress).toBe(0);
      expect(json.pendingTaskCount).toBe(1);
      expect(json.completedTaskCount).toBe(0);
      expect(json).toHaveProperty('createdAt');
      expect(json).toHaveProperty('updatedAt');
    });
  });

  describe('Domain Events', () => {
    it('should accumulate multiple domain events', () => {
      const legalCase = Case.create({
        title: 'Events Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      }).value;

      // Creation event is already added
      expect(legalCase.getDomainEvents()).toHaveLength(1);

      legalCase.changeStatus('IN_PROGRESS', 'user-123');
      expect(legalCase.getDomainEvents()).toHaveLength(2);

      legalCase.changePriority('HIGH', 'user-456');
      expect(legalCase.getDomainEvents()).toHaveLength(3);

      legalCase.addTask({ title: 'Task' }, 'user-789');
      expect(legalCase.getDomainEvents()).toHaveLength(4);
    });

    it('should clear domain events', () => {
      const legalCase = Case.create({
        title: 'Clear Events Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      }).value;

      expect(legalCase.getDomainEvents()).toHaveLength(1);

      legalCase.clearDomainEvents();
      expect(legalCase.getDomainEvents()).toHaveLength(0);
    });
  });
});
