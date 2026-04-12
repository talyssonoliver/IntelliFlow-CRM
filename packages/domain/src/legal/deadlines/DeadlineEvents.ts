import { DomainEvent } from '../../shared/DomainEvent';
import { DeadlineId } from './DeadlineId';
import { CaseId } from '../cases/CaseId';
import { DeadlineStatus, DeadlinePriority } from './Deadline';

/**
 * Event: Deadline was created
 */
export class DeadlineCreatedEvent extends DomainEvent {
  readonly eventType = 'deadline.created';

  constructor(
    public readonly deadlineId: DeadlineId,
    public readonly caseId: CaseId,
    public readonly title: string,
    public readonly dueDate: Date,
    public readonly priority: DeadlinePriority
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      deadlineId: this.deadlineId.value,
      caseId: this.caseId.value,
      title: this.title,
      dueDate: this.dueDate.toISOString(),
      priority: this.priority,
    };
  }
}

/**
 * Event: Deadline status changed
 */
export class DeadlineStatusChangedEvent extends DomainEvent {
  readonly eventType = 'deadline.status_changed';

  constructor(
    public readonly deadlineId: DeadlineId,
    public readonly previousStatus: DeadlineStatus,
    public readonly newStatus: DeadlineStatus
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      deadlineId: this.deadlineId.value,
      previousStatus: this.previousStatus,
      newStatus: this.newStatus,
    };
  }
}

/**
 * Event: Deadline is approaching (within warning threshold)
 */
export class DeadlineApproachingEvent extends DomainEvent {
  readonly eventType = 'deadline.approaching';

  constructor(
    public readonly deadlineId: DeadlineId,
    public readonly caseId: CaseId,
    public readonly title: string,
    public readonly dueDate: Date,
    public readonly daysRemaining: number
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      deadlineId: this.deadlineId.value,
      caseId: this.caseId.value,
      title: this.title,
      dueDate: this.dueDate.toISOString(),
      daysRemaining: this.daysRemaining,
    };
  }
}

/**
 * Event: Deadline is due today
 */
export class DeadlineDueTodayEvent extends DomainEvent {
  readonly eventType = 'deadline.due_today';

  constructor(
    public readonly deadlineId: DeadlineId,
    public readonly caseId: CaseId,
    public readonly title: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      deadlineId: this.deadlineId.value,
      caseId: this.caseId.value,
      title: this.title,
    };
  }
}

/**
 * Event: Deadline became overdue
 */
export class DeadlineOverdueEvent extends DomainEvent {
  readonly eventType = 'deadline.overdue';

  constructor(
    public readonly deadlineId: DeadlineId,
    public readonly caseId: CaseId,
    public readonly title: string,
    public readonly dueDate: Date,
    public readonly daysOverdue: number
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      deadlineId: this.deadlineId.value,
      caseId: this.caseId.value,
      title: this.title,
      dueDate: this.dueDate.toISOString(),
      daysOverdue: this.daysOverdue,
    };
  }
}

/**
 * Event: Deadline was completed
 */
export class DeadlineCompletedEvent extends DomainEvent {
  readonly eventType = 'deadline.completed';

  constructor(
    public readonly deadlineId: DeadlineId,
    public readonly caseId: CaseId,
    public readonly completedBy: string,
    public readonly wasOverdue: boolean
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      deadlineId: this.deadlineId.value,
      caseId: this.caseId.value,
      completedBy: this.completedBy,
      wasOverdue: this.wasOverdue,
    };
  }
}

/**
 * Event: Deadline was waived
 */
export class DeadlineWaivedEvent extends DomainEvent {
  readonly eventType = 'deadline.waived';

  constructor(
    public readonly deadlineId: DeadlineId,
    public readonly caseId: CaseId,
    public readonly waivedBy: string,
    public readonly reason: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      deadlineId: this.deadlineId.value,
      caseId: this.caseId.value,
      waivedBy: this.waivedBy,
      reason: this.reason,
    };
  }
}

/**
 * Event: Deadline was extended
 */
export class DeadlineExtendedEvent extends DomainEvent {
  readonly eventType = 'deadline.extended';

  constructor(
    public readonly deadlineId: DeadlineId,
    public readonly previousDueDate: Date,
    public readonly newDueDate: Date,
    public readonly extendedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      deadlineId: this.deadlineId.value,
      previousDueDate: this.previousDueDate.toISOString(),
      newDueDate: this.newDueDate.toISOString(),
      extendedBy: this.extendedBy,
    };
  }
}

/**
 * Event: Reminder was sent for a deadline
 */
export class DeadlineReminderSentEvent extends DomainEvent {
  readonly eventType = 'deadline.reminder_sent';

  constructor(
    public readonly deadlineId: DeadlineId,
    public readonly caseId: CaseId,
    public readonly recipientId: string,
    public readonly reminderType: 'EMAIL' | 'IN_APP' | 'SMS',
    public readonly daysUntilDue: number
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      deadlineId: this.deadlineId.value,
      caseId: this.caseId.value,
      recipientId: this.recipientId,
      reminderType: this.reminderType,
      daysUntilDue: this.daysUntilDue,
    };
  }
}
