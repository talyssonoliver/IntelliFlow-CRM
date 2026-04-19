import { describe, it, expect } from 'vitest';
import {
  TaskCreatedEvent,
  TaskStatusChangedEvent,
  TaskCompletedEvent,
  TaskCancelledEvent,
  TaskPriorityChangedEvent,
  TaskDueDateChangedEvent,
  TaskAssignedEvent,
  TaskLinkedToEntityEvent,
} from '../TaskEvents';
import { TaskId } from '../TaskId';

describe('TaskCreatedEvent', () => {
  it('should create event with correct payload', () => {
    const taskId = TaskId.generate();
    const event = new TaskCreatedEvent(taskId, 'Follow up with lead', 'HIGH', 'owner-123');

    expect(event.eventType).toBe('task.created');
    expect(event.taskId).toBe(taskId);
    expect(event.title).toBe('Follow up with lead');
    expect(event.priority).toBe('HIGH');
    expect(event.ownerId).toBe('owner-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const taskId = TaskId.generate();
    const event = new TaskCreatedEvent(taskId, 'Follow up with lead', 'HIGH', 'owner-123');
    const payload = event.toPayload();

    expect(payload.taskId).toBe(taskId.value);
    expect(payload.title).toBe('Follow up with lead');
    expect(payload.priority).toBe('HIGH');
    expect(payload.ownerId).toBe('owner-123');
  });
});

describe('TaskStatusChangedEvent', () => {
  it('should create event with status change', () => {
    const taskId = TaskId.generate();
    const event = new TaskStatusChangedEvent(taskId, 'PENDING', 'IN_PROGRESS', 'user-123');

    expect(event.eventType).toBe('task.status_changed');
    expect(event.taskId).toBe(taskId);
    expect(event.previousStatus).toBe('PENDING');
    expect(event.newStatus).toBe('IN_PROGRESS');
    expect(event.changedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const taskId = TaskId.generate();
    const event = new TaskStatusChangedEvent(taskId, 'PENDING', 'IN_PROGRESS', 'user-123');
    const payload = event.toPayload();

    expect(payload.taskId).toBe(taskId.value);
    expect(payload.previousStatus).toBe('PENDING');
    expect(payload.newStatus).toBe('IN_PROGRESS');
    expect(payload.changedBy).toBe('user-123');
  });
});

describe('TaskCompletedEvent', () => {
  it('should create event when task is completed', () => {
    const taskId = TaskId.generate();
    const event = new TaskCompletedEvent(taskId, 'user-123');

    expect(event.eventType).toBe('task.completed');
    expect(event.taskId).toBe(taskId);
    expect(event.completedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const taskId = TaskId.generate();
    const event = new TaskCompletedEvent(taskId, 'user-123');
    const payload = event.toPayload();

    expect(payload.taskId).toBe(taskId.value);
    expect(payload.completedBy).toBe('user-123');
  });
});

describe('TaskCancelledEvent', () => {
  it('should create event when task is cancelled', () => {
    const taskId = TaskId.generate();
    const event = new TaskCancelledEvent(taskId, 'No longer needed', 'user-123');

    expect(event.eventType).toBe('task.cancelled');
    expect(event.taskId).toBe(taskId);
    expect(event.reason).toBe('No longer needed');
    expect(event.cancelledBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const taskId = TaskId.generate();
    const event = new TaskCancelledEvent(taskId, 'No longer needed', 'user-123');
    const payload = event.toPayload();

    expect(payload.taskId).toBe(taskId.value);
    expect(payload.reason).toBe('No longer needed');
    expect(payload.cancelledBy).toBe('user-123');
  });
});

describe('TaskPriorityChangedEvent', () => {
  it('should create event with priority change', () => {
    const taskId = TaskId.generate();
    const event = new TaskPriorityChangedEvent(taskId, 'MEDIUM', 'HIGH', 'user-123');

    expect(event.eventType).toBe('task.priority_changed');
    expect(event.taskId).toBe(taskId);
    expect(event.previousPriority).toBe('MEDIUM');
    expect(event.newPriority).toBe('HIGH');
    expect(event.changedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const taskId = TaskId.generate();
    const event = new TaskPriorityChangedEvent(taskId, 'MEDIUM', 'HIGH', 'user-123');
    const payload = event.toPayload();

    expect(payload.taskId).toBe(taskId.value);
    expect(payload.previousPriority).toBe('MEDIUM');
    expect(payload.newPriority).toBe('HIGH');
    expect(payload.changedBy).toBe('user-123');
  });
});

describe('TaskDueDateChangedEvent', () => {
  it('should create event with initial due date (no previous)', () => {
    const taskId = TaskId.generate();
    const newDate = new Date('2025-12-31');
    const event = new TaskDueDateChangedEvent(taskId, null, newDate, 'user-123');

    expect(event.eventType).toBe('task.due_date_changed');
    expect(event.taskId).toBe(taskId);
    expect(event.previousDueDate).toBeNull();
    expect(event.newDueDate).toBe(newDate);
    expect(event.changedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should create event with due date change', () => {
    const taskId = TaskId.generate();
    const previousDate = new Date('2025-12-31');
    const newDate = new Date('2026-01-15');
    const event = new TaskDueDateChangedEvent(taskId, previousDate, newDate, 'user-123');

    expect(event.previousDueDate).toBe(previousDate);
    expect(event.newDueDate).toBe(newDate);
  });

  it('should serialize to payload correctly without previous date', () => {
    const taskId = TaskId.generate();
    const newDate = new Date('2025-12-31');
    const event = new TaskDueDateChangedEvent(taskId, null, newDate, 'user-123');
    const payload = event.toPayload();

    expect(payload.taskId).toBe(taskId.value);
    expect(payload.previousDueDate).toBeNull();
    expect(payload.newDueDate).toBe(newDate.toISOString());
    expect(payload.changedBy).toBe('user-123');
  });

  it('should serialize to payload correctly with previous date', () => {
    const taskId = TaskId.generate();
    const previousDate = new Date('2025-12-31');
    const newDate = new Date('2026-01-15');
    const event = new TaskDueDateChangedEvent(taskId, previousDate, newDate, 'user-123');
    const payload = event.toPayload();

    expect(payload.previousDueDate).toBe(previousDate.toISOString());
    expect(payload.newDueDate).toBe(newDate.toISOString());
  });
});

describe('TaskLinkedToEntityEvent', () => {
  it('should create event when task is linked to a lead', () => {
    const taskId = TaskId.generate();
    const event = new TaskLinkedToEntityEvent(taskId, 'lead', 'lead-123', 'user-456');

    expect(event.eventType).toBe('task.linked_to_entity');
    expect(event.taskId).toBe(taskId);
    expect(event.entityType).toBe('lead');
    expect(event.entityId).toBe('lead-123');
    expect(event.linkedBy).toBe('user-456');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should create event when task is linked to a contact', () => {
    const taskId = TaskId.generate();
    const event = new TaskLinkedToEntityEvent(taskId, 'contact', 'contact-123', 'user-456');

    expect(event.entityType).toBe('contact');
    expect(event.entityId).toBe('contact-123');
  });

  it('should create event when task is linked to an opportunity', () => {
    const taskId = TaskId.generate();
    const event = new TaskLinkedToEntityEvent(taskId, 'opportunity', 'opportunity-123', 'user-456');

    expect(event.entityType).toBe('opportunity');
    expect(event.entityId).toBe('opportunity-123');
  });

  it('should serialize to payload correctly', () => {
    const taskId = TaskId.generate();
    const event = new TaskLinkedToEntityEvent(taskId, 'lead', 'lead-123', 'user-456');
    const payload = event.toPayload();

    expect(payload.taskId).toBe(taskId.value);
    expect(payload.entityType).toBe('lead');
    expect(payload.entityId).toBe('lead-123');
    expect(payload.linkedBy).toBe('user-456');
  });
});

describe('TaskAssignedEvent', () => {
  it('should create event when a task is assigned to a user', () => {
    const taskId = TaskId.generate();
    const dueDate = new Date('2026-05-01T12:00:00Z');
    const event = new TaskAssignedEvent(
      taskId,
      'user-assignee',
      null,
      'user-actor',
      'Follow up',
      dueDate
    );

    expect(event.eventType).toBe('task.assigned');
    expect(event.taskId).toBe(taskId);
    expect(event.assigneeId).toBe('user-assignee');
    expect(event.previousAssigneeId).toBeNull();
    expect(event.assignedBy).toBe('user-actor');
    expect(event.title).toBe('Follow up');
    expect(event.dueDate).toBe(dueDate);
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should carry a null assigneeId when a task is unassigned', () => {
    const taskId = TaskId.generate();
    const event = new TaskAssignedEvent(
      taskId,
      null,
      'user-previous',
      'user-actor',
      'Follow up',
      null
    );

    expect(event.assigneeId).toBeNull();
    expect(event.previousAssigneeId).toBe('user-previous');
    expect(event.dueDate).toBeNull();
  });

  it('should serialize to payload correctly', () => {
    const taskId = TaskId.generate();
    const dueDate = new Date('2026-05-01T12:00:00Z');
    const event = new TaskAssignedEvent(
      taskId,
      'user-assignee',
      'user-previous',
      'user-actor',
      'Follow up',
      dueDate
    );
    const payload = event.toPayload();

    expect(payload.taskId).toBe(taskId.value);
    expect(payload.assigneeId).toBe('user-assignee');
    expect(payload.previousAssigneeId).toBe('user-previous');
    expect(payload.assignedBy).toBe('user-actor');
    expect(payload.title).toBe('Follow up');
    expect(payload.dueDate).toBe(dueDate.toISOString());
  });

  it('should serialize null dueDate as null in payload', () => {
    const taskId = TaskId.generate();
    const event = new TaskAssignedEvent(
      taskId,
      'user-assignee',
      null,
      'user-actor',
      'Follow up',
      null
    );

    expect(event.toPayload().dueDate).toBeNull();
  });
});
