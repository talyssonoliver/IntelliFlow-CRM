import { DomainEvent } from '../../shared/DomainEvent';
import { CaseId } from './CaseId';
import { CaseTaskId } from './CaseTaskId';

export type CaseStatus = 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'CLOSED' | 'CANCELLED';
export type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type CaseTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

/**
 * Event: Case was created
 */
export class CaseCreatedEvent extends DomainEvent {
  readonly eventType = 'case.created';

  constructor(
    public readonly caseId: CaseId,
    public readonly title: string,
    public readonly clientId: string,
    public readonly assignedTo: string,
    public readonly priority: CasePriority
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      title: this.title,
      clientId: this.clientId,
      assignedTo: this.assignedTo,
      priority: this.priority,
    };
  }
}

/**
 * Event: Case status changed
 */
export class CaseStatusChangedEvent extends DomainEvent {
  readonly eventType = 'case.status_changed';

  constructor(
    public readonly caseId: CaseId,
    public readonly previousStatus: CaseStatus,
    public readonly newStatus: CaseStatus,
    public readonly changedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      previousStatus: this.previousStatus,
      newStatus: this.newStatus,
      changedBy: this.changedBy,
    };
  }
}

/**
 * Event: Case deadline was updated
 */
export class CaseDeadlineUpdatedEvent extends DomainEvent {
  readonly eventType = 'case.deadline_updated';

  constructor(
    public readonly caseId: CaseId,
    public readonly previousDeadline: Date | null,
    public readonly newDeadline: Date,
    public readonly changedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      previousDeadline: this.previousDeadline?.toISOString() ?? null,
      newDeadline: this.newDeadline.toISOString(),
      changedBy: this.changedBy,
    };
  }
}

/**
 * Event: Task was added to case
 */
export class CaseTaskAddedEvent extends DomainEvent {
  readonly eventType = 'case.task_added';

  constructor(
    public readonly caseId: CaseId,
    public readonly taskId: CaseTaskId,
    public readonly title: string,
    public readonly addedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      taskId: this.taskId.value,
      title: this.title,
      addedBy: this.addedBy,
    };
  }
}

/**
 * Event: Task was removed from case
 */
export class CaseTaskRemovedEvent extends DomainEvent {
  readonly eventType = 'case.task_removed';

  constructor(
    public readonly caseId: CaseId,
    public readonly taskId: CaseTaskId,
    public readonly removedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      taskId: this.taskId.value,
      removedBy: this.removedBy,
    };
  }
}

/**
 * Event: Case task was completed
 */
export class CaseTaskCompletedEvent extends DomainEvent {
  readonly eventType = 'case.task_completed';

  constructor(
    public readonly caseId: CaseId,
    public readonly taskId: CaseTaskId,
    public readonly completedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      taskId: this.taskId.value,
      completedBy: this.completedBy,
    };
  }
}

/**
 * Event: Case priority changed
 */
export class CasePriorityChangedEvent extends DomainEvent {
  readonly eventType = 'case.priority_changed';

  constructor(
    public readonly caseId: CaseId,
    public readonly previousPriority: CasePriority,
    public readonly newPriority: CasePriority,
    public readonly changedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      previousPriority: this.previousPriority,
      newPriority: this.newPriority,
      changedBy: this.changedBy,
    };
  }
}

/**
 * Event: Case was closed
 */
export class CaseClosedEvent extends DomainEvent {
  readonly eventType = 'case.closed';

  constructor(
    public readonly caseId: CaseId,
    public readonly resolution: string,
    public readonly closedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      caseId: this.caseId.value,
      resolution: this.resolution,
      closedBy: this.closedBy,
    };
  }
}
