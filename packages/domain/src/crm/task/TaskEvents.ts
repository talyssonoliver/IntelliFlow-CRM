import { DomainEvent } from '../../shared/DomainEvent';
import { TaskId } from './TaskId';

// Canonical enum values - single source of truth
export const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

// Derive types from const arrays
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/**
 * Event: Task was created
 */
export class TaskCreatedEvent extends DomainEvent {
  readonly eventType = 'task.created';

  constructor(
    public readonly taskId: TaskId,
    public readonly title: string,
    public readonly priority: TaskPriority,
    public readonly ownerId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      taskId: this.taskId.value,
      title: this.title,
      priority: this.priority,
      ownerId: this.ownerId,
    };
  }
}

/**
 * Event: Task status changed
 */
export class TaskStatusChangedEvent extends DomainEvent {
  readonly eventType = 'task.status_changed';

  constructor(
    public readonly taskId: TaskId,
    public readonly previousStatus: TaskStatus,
    public readonly newStatus: TaskStatus,
    public readonly changedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      taskId: this.taskId.value,
      previousStatus: this.previousStatus,
      newStatus: this.newStatus,
      changedBy: this.changedBy,
    };
  }
}

/**
 * Event: Task was completed
 */
export class TaskCompletedEvent extends DomainEvent {
  readonly eventType = 'task.completed';

  constructor(
    public readonly taskId: TaskId,
    public readonly completedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      taskId: this.taskId.value,
      completedBy: this.completedBy,
    };
  }
}

/**
 * Event: Task was cancelled
 */
export class TaskCancelledEvent extends DomainEvent {
  readonly eventType = 'task.cancelled';

  constructor(
    public readonly taskId: TaskId,
    public readonly reason: string,
    public readonly cancelledBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      taskId: this.taskId.value,
      reason: this.reason,
      cancelledBy: this.cancelledBy,
    };
  }
}

/**
 * Event: Task priority changed
 */
export class TaskPriorityChangedEvent extends DomainEvent {
  readonly eventType = 'task.priority_changed';

  constructor(
    public readonly taskId: TaskId,
    public readonly previousPriority: TaskPriority,
    public readonly newPriority: TaskPriority,
    public readonly changedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      taskId: this.taskId.value,
      previousPriority: this.previousPriority,
      newPriority: this.newPriority,
      changedBy: this.changedBy,
    };
  }
}

/**
 * Event: Task due date changed
 */
export class TaskDueDateChangedEvent extends DomainEvent {
  readonly eventType = 'task.due_date_changed';

  constructor(
    public readonly taskId: TaskId,
    public readonly previousDueDate: Date | null,
    public readonly newDueDate: Date,
    public readonly changedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      taskId: this.taskId.value,
      previousDueDate: this.previousDueDate?.toISOString() ?? null,
      newDueDate: this.newDueDate.toISOString(),
      changedBy: this.changedBy,
    };
  }
}

/**
 * Event: Task was assigned to entity
 */
export class TaskAssignedEvent extends DomainEvent {
  readonly eventType = 'task.assigned';

  constructor(
    public readonly taskId: TaskId,
    public readonly entityType: 'lead' | 'contact' | 'opportunity',
    public readonly entityId: string,
    public readonly assignedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      taskId: this.taskId.value,
      entityType: this.entityType,
      entityId: this.entityId,
      assignedBy: this.assignedBy,
    };
  }
}
