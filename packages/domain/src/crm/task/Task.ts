import { AggregateRoot } from '../../shared/AggregateRoot';
import { Result, DomainError } from '../../shared/Result';
import { TaskId } from './TaskId';
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
} from './TaskEvents';

export class TaskAlreadyCompletedError extends DomainError {
  readonly code = 'TASK_ALREADY_COMPLETED';
  constructor() {
    super('Task has already been completed');
  }
}

export class TaskAlreadyCancelledError extends DomainError {
  readonly code = 'TASK_ALREADY_CANCELLED';
  constructor() {
    super('Task has already been cancelled');
  }
}

export class TaskNotInProgressError extends DomainError {
  readonly code = 'TASK_NOT_IN_PROGRESS';
  constructor() {
    super('Task must be in progress to be completed');
  }
}

interface TaskProps {
  title: string;
  description?: string;
  dueDate?: Date;
  priority: TaskPriority;
  status: TaskStatus;
  leadId?: string;
  contactId?: string;
  opportunityId?: string;
  ownerId: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CreateTaskProps {
  title: string;
  description?: string;
  dueDate?: Date;
  priority?: TaskPriority;
  leadId?: string;
  contactId?: string;
  opportunityId?: string;
  ownerId: string;
  tenantId: string;
}

/**
 * Task Aggregate Root
 * Represents a task/activity in the CRM
 */
export class Task extends AggregateRoot<TaskId> {
  private props: TaskProps;

  private constructor(id: TaskId, props: TaskProps) {
    super(id);
    this.props = props;
  }

  // Getters
  get title(): string {
    return this.props.title;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get dueDate(): Date | undefined {
    return this.props.dueDate;
  }

  get priority(): TaskPriority {
    return this.props.priority;
  }

  get status(): TaskStatus {
    return this.props.status;
  }

  get leadId(): string | undefined {
    return this.props.leadId;
  }

  get contactId(): string | undefined {
    return this.props.contactId;
  }

  get opportunityId(): string | undefined {
    return this.props.opportunityId;
  }

  get ownerId(): string {
    return this.props.ownerId;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }

  get isCompleted(): boolean {
    return this.props.status === 'COMPLETED';
  }

  get isCancelled(): boolean {
    return this.props.status === 'CANCELLED';
  }

  get isOverdue(): boolean {
    if (!this.props.dueDate || this.isCompleted || this.isCancelled) {
      return false;
    }
    return this.props.dueDate < new Date();
  }

  get isDueSoon(): boolean {
    if (!this.props.dueDate || this.isCompleted || this.isCancelled) {
      return false;
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.props.dueDate <= tomorrow;
  }

  // Factory method
  static create(props: CreateTaskProps): Result<Task, DomainError> {
    const now = new Date();
    const taskId = TaskId.generate();

    const task = new Task(taskId, {
      title: props.title,
      description: props.description,
      dueDate: props.dueDate,
      priority: props.priority ?? 'MEDIUM',
      status: 'PENDING',
      leadId: props.leadId,
      contactId: props.contactId,
      opportunityId: props.opportunityId,
      ownerId: props.ownerId,
      tenantId: props.tenantId,
      createdAt: now,
      updatedAt: now,
    });

    task.addDomainEvent(new TaskCreatedEvent(taskId, props.title, task.priority, props.ownerId));

    return Result.ok(task);
  }

  // Reconstitute from persistence
  static reconstitute(id: TaskId, props: TaskProps): Task {
    return new Task(id, props);
  }

  // Commands
  changeStatus(newStatus: TaskStatus, changedBy: string): Result<void, DomainError> {
    if (this.isCompleted) {
      return Result.fail(new TaskAlreadyCompletedError());
    }

    if (this.isCancelled) {
      return Result.fail(new TaskAlreadyCancelledError());
    }

    const previousStatus = this.props.status;
    this.props.status = newStatus;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new TaskStatusChangedEvent(this.id, previousStatus, newStatus, changedBy));

    return Result.ok(undefined);
  }

  start(startedBy: string): Result<void, DomainError> {
    return this.changeStatus('IN_PROGRESS', startedBy);
  }

  complete(completedBy: string): Result<void, DomainError> {
    if (this.isCompleted) {
      return Result.fail(new TaskAlreadyCompletedError());
    }

    if (this.isCancelled) {
      return Result.fail(new TaskAlreadyCancelledError());
    }

    this.props.status = 'COMPLETED';
    this.props.completedAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(new TaskCompletedEvent(this.id, completedBy));

    return Result.ok(undefined);
  }

  cancel(reason: string, cancelledBy: string): Result<void, DomainError> {
    if (this.isCompleted) {
      return Result.fail(new TaskAlreadyCompletedError());
    }

    if (this.isCancelled) {
      return Result.fail(new TaskAlreadyCancelledError());
    }

    this.props.status = 'CANCELLED';
    this.props.updatedAt = new Date();

    this.addDomainEvent(new TaskCancelledEvent(this.id, reason, cancelledBy));

    return Result.ok(undefined);
  }

  changePriority(newPriority: TaskPriority, changedBy: string): Result<void, DomainError> {
    if (this.isCompleted || this.isCancelled) {
      return Result.fail(new TaskAlreadyCompletedError());
    }

    const previousPriority = this.props.priority;
    this.props.priority = newPriority;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new TaskPriorityChangedEvent(this.id, previousPriority, newPriority, changedBy)
    );

    return Result.ok(undefined);
  }

  updateDueDate(newDueDate: Date, changedBy: string): Result<void, DomainError> {
    if (this.isCompleted || this.isCancelled) {
      return Result.fail(new TaskAlreadyCompletedError());
    }

    const previousDueDate = this.props.dueDate ?? null;
    this.props.dueDate = newDueDate;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new TaskDueDateChangedEvent(this.id, previousDueDate, newDueDate, changedBy)
    );

    return Result.ok(undefined);
  }

  assignToLead(leadId: string, assignedBy: string): void {
    this.props.leadId = leadId;
    this.props.contactId = undefined;
    this.props.opportunityId = undefined;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new TaskAssignedEvent(this.id, 'lead', leadId, assignedBy));
  }

  assignToContact(contactId: string, assignedBy: string): void {
    this.props.contactId = contactId;
    this.props.leadId = undefined;
    this.props.opportunityId = undefined;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new TaskAssignedEvent(this.id, 'contact', contactId, assignedBy));
  }

  assignToOpportunity(opportunityId: string, assignedBy: string): void {
    this.props.opportunityId = opportunityId;
    this.props.leadId = undefined;
    this.props.contactId = undefined;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new TaskAssignedEvent(this.id, 'opportunity', opportunityId, assignedBy));
  }

  updateTaskInfo(updates: Partial<Pick<TaskProps, 'title' | 'description'>>): void {
    if (updates.title !== undefined) {
      this.props.title = updates.title;
    }
    if (updates.description !== undefined) {
      this.props.description = updates.description;
    }
    this.props.updatedAt = new Date();
  }

  // Serialization
  toJSON(): Record<string, unknown> {
    return {
      id: this.id.value,
      title: this.title,
      description: this.description,
      dueDate: this.dueDate?.toISOString(),
      priority: this.priority,
      status: this.status,
      leadId: this.leadId,
      contactId: this.contactId,
      opportunityId: this.opportunityId,
      ownerId: this.ownerId,
      isOverdue: this.isOverdue,
      isDueSoon: this.isDueSoon,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      completedAt: this.completedAt?.toISOString(),
    };
  }
}
