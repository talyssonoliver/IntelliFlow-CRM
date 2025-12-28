/**
 * CaseEvents Tests
 *
 * Tests for all case-related domain events ensuring proper
 * serialization and payload generation.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
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

describe('CaseEvents', () => {
  describe('CaseCreatedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const event = new CaseCreatedEvent(
        caseId,
        'Contract Review',
        'client-123',
        'lawyer-456',
        'HIGH'
      );

      expect(event.eventType).toBe('case.created');
      expect(event.caseId).toBe(caseId);
      expect(event.title).toBe('Contract Review');
      expect(event.clientId).toBe('client-123');
      expect(event.assignedTo).toBe('lawyer-456');
      expect(event.priority).toBe('HIGH');
      expect(event.eventId).toBeDefined();
      expect(event.occurredAt).toBeInstanceOf(Date);
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const event = new CaseCreatedEvent(caseId, 'New Case', 'client-789', 'lawyer-012', 'URGENT');

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.title).toBe('New Case');
      expect(payload.clientId).toBe('client-789');
      expect(payload.assignedTo).toBe('lawyer-012');
      expect(payload.priority).toBe('URGENT');
    });
  });

  describe('CaseStatusChangedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const event = new CaseStatusChangedEvent(caseId, 'OPEN', 'IN_PROGRESS', 'user-123');

      expect(event.eventType).toBe('case.status_changed');
      expect(event.caseId).toBe(caseId);
      expect(event.previousStatus).toBe('OPEN');
      expect(event.newStatus).toBe('IN_PROGRESS');
      expect(event.changedBy).toBe('user-123');
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const event = new CaseStatusChangedEvent(caseId, 'IN_PROGRESS', 'CLOSED', 'user-456');

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.previousStatus).toBe('IN_PROGRESS');
      expect(payload.newStatus).toBe('CLOSED');
      expect(payload.changedBy).toBe('user-456');
    });
  });

  describe('CaseDeadlineUpdatedEvent', () => {
    it('should create event with previous deadline', () => {
      const caseId = CaseId.generate();
      const previousDeadline = new Date('2025-01-15');
      const newDeadline = new Date('2025-02-01');

      const event = new CaseDeadlineUpdatedEvent(caseId, previousDeadline, newDeadline, 'user-789');

      expect(event.eventType).toBe('case.deadline_updated');
      expect(event.previousDeadline).toEqual(previousDeadline);
      expect(event.newDeadline).toEqual(newDeadline);
    });

    it('should handle null previous deadline', () => {
      const caseId = CaseId.generate();
      const newDeadline = new Date('2025-02-01');

      const event = new CaseDeadlineUpdatedEvent(caseId, null, newDeadline, 'user-789');

      const payload = event.toPayload();

      expect(payload.previousDeadline).toBeNull();
      expect(payload.newDeadline).toBe(newDeadline.toISOString());
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const previousDeadline = new Date('2025-01-15');
      const newDeadline = new Date('2025-02-01');

      const event = new CaseDeadlineUpdatedEvent(caseId, previousDeadline, newDeadline, 'user-012');

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.previousDeadline).toBe(previousDeadline.toISOString());
      expect(payload.newDeadline).toBe(newDeadline.toISOString());
      expect(payload.changedBy).toBe('user-012');
    });
  });

  describe('CaseTaskAddedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const taskId = CaseTaskId.generate();

      const event = new CaseTaskAddedEvent(caseId, taskId, 'Review Documents', 'user-123');

      expect(event.eventType).toBe('case.task_added');
      expect(event.caseId).toBe(caseId);
      expect(event.taskId).toBe(taskId);
      expect(event.title).toBe('Review Documents');
      expect(event.addedBy).toBe('user-123');
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const taskId = CaseTaskId.generate();

      const event = new CaseTaskAddedEvent(caseId, taskId, 'Draft Contract', 'user-456');

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.taskId).toBe(taskId.value);
      expect(payload.title).toBe('Draft Contract');
      expect(payload.addedBy).toBe('user-456');
    });
  });

  describe('CaseTaskRemovedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const taskId = CaseTaskId.generate();

      const event = new CaseTaskRemovedEvent(caseId, taskId, 'user-789');

      expect(event.eventType).toBe('case.task_removed');
      expect(event.caseId).toBe(caseId);
      expect(event.taskId).toBe(taskId);
      expect(event.removedBy).toBe('user-789');
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const taskId = CaseTaskId.generate();

      const event = new CaseTaskRemovedEvent(caseId, taskId, 'user-012');

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.taskId).toBe(taskId.value);
      expect(payload.removedBy).toBe('user-012');
    });
  });

  describe('CaseTaskCompletedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();
      const taskId = CaseTaskId.generate();

      const event = new CaseTaskCompletedEvent(caseId, taskId, 'user-345');

      expect(event.eventType).toBe('case.task_completed');
      expect(event.caseId).toBe(caseId);
      expect(event.taskId).toBe(taskId);
      expect(event.completedBy).toBe('user-345');
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();
      const taskId = CaseTaskId.generate();

      const event = new CaseTaskCompletedEvent(caseId, taskId, 'user-678');

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.taskId).toBe(taskId.value);
      expect(payload.completedBy).toBe('user-678');
    });
  });

  describe('CasePriorityChangedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();

      const event = new CasePriorityChangedEvent(caseId, 'MEDIUM', 'URGENT', 'user-901');

      expect(event.eventType).toBe('case.priority_changed');
      expect(event.caseId).toBe(caseId);
      expect(event.previousPriority).toBe('MEDIUM');
      expect(event.newPriority).toBe('URGENT');
      expect(event.changedBy).toBe('user-901');
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();

      const event = new CasePriorityChangedEvent(caseId, 'LOW', 'HIGH', 'user-234');

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.previousPriority).toBe('LOW');
      expect(payload.newPriority).toBe('HIGH');
      expect(payload.changedBy).toBe('user-234');
    });
  });

  describe('CaseClosedEvent', () => {
    it('should create event with correct properties', () => {
      const caseId = CaseId.generate();

      const event = new CaseClosedEvent(
        caseId,
        'Successfully resolved with client agreement',
        'user-567'
      );

      expect(event.eventType).toBe('case.closed');
      expect(event.caseId).toBe(caseId);
      expect(event.resolution).toBe('Successfully resolved with client agreement');
      expect(event.closedBy).toBe('user-567');
    });

    it('should generate correct payload', () => {
      const caseId = CaseId.generate();

      const event = new CaseClosedEvent(caseId, 'Matter dismissed', 'user-890');

      const payload = event.toPayload();

      expect(payload.caseId).toBe(caseId.value);
      expect(payload.resolution).toBe('Matter dismissed');
      expect(payload.closedBy).toBe('user-890');
    });
  });

  describe('Common Event Properties', () => {
    it('should generate unique event IDs', () => {
      const caseId = CaseId.generate();

      const event1 = new CaseCreatedEvent(caseId, 'Case 1', 'c1', 'l1', 'LOW');
      const event2 = new CaseCreatedEvent(caseId, 'Case 2', 'c2', 'l2', 'LOW');

      expect(event1.eventId).not.toBe(event2.eventId);
    });

    it('should set occurredAt timestamp', () => {
      const beforeCreate = new Date();
      const caseId = CaseId.generate();
      const event = new CaseCreatedEvent(caseId, 'Case', 'c', 'l', 'LOW');
      const afterCreate = new Date();

      expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(event.occurredAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });
  });
});
