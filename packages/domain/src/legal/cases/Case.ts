import { AggregateRoot } from '../../shared/AggregateRoot';
import { Result, DomainError } from '../../shared/Result';
import { CaseId } from './CaseId';
import { CaseTaskId } from './CaseTaskId';
import { CaseTask, CreateCaseTaskProps } from './CaseTask';
import {
  CaseStatus,
  CasePriority,
  CaseCreatedEvent,
  CaseStatusChangedEvent,
  CaseDeadlineUpdatedEvent,
  CaseTaskAddedEvent,
  CaseTaskRemovedEvent,
  CaseTaskCompletedEvent,
  CasePriorityChangedEvent,
  CaseClosedEvent,
} from './CaseEvents';

export class CaseAlreadyClosedError extends DomainError {
  readonly code = 'CASE_ALREADY_CLOSED';
  constructor() {
    super('Case has already been closed');
  }
}

export class CaseAlreadyCancelledError extends DomainError {
  readonly code = 'CASE_ALREADY_CANCELLED';
  constructor() {
    super('Case has already been cancelled');
  }
}

export class CaseTaskNotFoundError extends DomainError {
  readonly code = 'CASE_TASK_NOT_FOUND';
  constructor(taskId: string) {
    super(`Task with ID ${taskId} not found in case`);
  }
}

export class CaseInvalidStatusTransitionError extends DomainError {
  readonly code = 'CASE_INVALID_STATUS_TRANSITION';
  constructor(from: CaseStatus, to: CaseStatus) {
    super(`Cannot transition case from ${from} to ${to}`);
  }
}

interface CaseProps {
  title: string;
  description?: string;
  status: CaseStatus;
  priority: CasePriority;
  deadline?: Date;
  clientId: string;
  assignedTo: string;
  tasks: CaseTask[];
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  resolution?: string;
}

export interface CreateCaseProps {
  title: string;
  description?: string;
  priority?: CasePriority;
  deadline?: Date;
  clientId: string;
  assignedTo: string;
}

/**
 * Case Aggregate Root
 * Represents a legal case/matter with associated tasks and deadlines
 */
export class Case extends AggregateRoot<CaseId> {
  private props: CaseProps;

  private constructor(id: CaseId, props: CaseProps) {
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

  get status(): CaseStatus {
    return this.props.status;
  }

  get priority(): CasePriority {
    return this.props.priority;
  }

  get deadline(): Date | undefined {
    return this.props.deadline;
  }

  get clientId(): string {
    return this.props.clientId;
  }

  get assignedTo(): string {
    return this.props.assignedTo;
  }

  get tasks(): ReadonlyArray<CaseTask> {
    return [...this.props.tasks];
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get closedAt(): Date | undefined {
    return this.props.closedAt;
  }

  get resolution(): string | undefined {
    return this.props.resolution;
  }

  get isClosed(): boolean {
    return this.props.status === 'CLOSED';
  }

  get isCancelled(): boolean {
    return this.props.status === 'CANCELLED';
  }

  get isOverdue(): boolean {
    if (!this.props.deadline || this.isClosed || this.isCancelled) {
      return false;
    }
    return this.props.deadline < new Date();
  }

  get pendingTaskCount(): number {
    return this.props.tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS')
      .length;
  }

  get completedTaskCount(): number {
    return this.props.tasks.filter((t) => t.status === 'COMPLETED').length;
  }

  get taskProgress(): number {
    if (this.props.tasks.length === 0) return 0;
    return Math.round((this.completedTaskCount / this.props.tasks.length) * 100);
  }

  // Factory method
  static create(props: CreateCaseProps): Result<Case, DomainError> {
    const now = new Date();
    const caseId = CaseId.generate();

    const legalCase = new Case(caseId, {
      title: props.title,
      description: props.description,
      status: 'OPEN',
      priority: props.priority ?? 'MEDIUM',
      deadline: props.deadline,
      clientId: props.clientId,
      assignedTo: props.assignedTo,
      tasks: [],
      createdAt: now,
      updatedAt: now,
    });

    legalCase.addDomainEvent(
      new CaseCreatedEvent(
        caseId,
        props.title,
        props.clientId,
        props.assignedTo,
        props.priority ?? 'MEDIUM'
      )
    );

    return Result.ok(legalCase);
  }

  // Reconstitute from persistence
  static reconstitute(id: CaseId, props: CaseProps): Case {
    return new Case(id, props);
  }

  // Commands
  changeStatus(newStatus: CaseStatus, changedBy: string): Result<void, DomainError> {
    if (this.isClosed) {
      return Result.fail(new CaseAlreadyClosedError());
    }

    if (this.isCancelled) {
      return Result.fail(new CaseAlreadyCancelledError());
    }

    // Validate status transitions
    const validTransitions: Record<CaseStatus, CaseStatus[]> = {
      OPEN: ['IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED'],
      IN_PROGRESS: ['ON_HOLD', 'CLOSED', 'CANCELLED'],
      ON_HOLD: ['IN_PROGRESS', 'CLOSED', 'CANCELLED'],
      CLOSED: [],
      CANCELLED: [],
    };

    if (!validTransitions[this.props.status].includes(newStatus)) {
      return Result.fail(new CaseInvalidStatusTransitionError(this.props.status, newStatus));
    }

    const previousStatus = this.props.status;
    this.props.status = newStatus;
    this.props.updatedAt = new Date();

    if (newStatus === 'CLOSED') {
      this.props.closedAt = new Date();
    }

    this.addDomainEvent(new CaseStatusChangedEvent(this.id, previousStatus, newStatus, changedBy));

    return Result.ok(undefined);
  }

  close(resolution: string, closedBy: string): Result<void, DomainError> {
    if (this.isClosed) {
      return Result.fail(new CaseAlreadyClosedError());
    }

    if (this.isCancelled) {
      return Result.fail(new CaseAlreadyCancelledError());
    }

    const previousStatus = this.props.status;
    this.props.status = 'CLOSED';
    this.props.closedAt = new Date();
    this.props.resolution = resolution;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new CaseStatusChangedEvent(this.id, previousStatus, 'CLOSED', closedBy));
    this.addDomainEvent(new CaseClosedEvent(this.id, resolution, closedBy));

    return Result.ok(undefined);
  }

  cancel(reason: string, cancelledBy: string): Result<void, DomainError> {
    if (this.isClosed) {
      return Result.fail(new CaseAlreadyClosedError());
    }

    if (this.isCancelled) {
      return Result.fail(new CaseAlreadyCancelledError());
    }

    const previousStatus = this.props.status;
    this.props.status = 'CANCELLED';
    this.props.resolution = reason;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new CaseStatusChangedEvent(this.id, previousStatus, 'CANCELLED', cancelledBy)
    );

    return Result.ok(undefined);
  }

  updateDeadline(newDeadline: Date, changedBy: string): Result<void, DomainError> {
    if (this.isClosed || this.isCancelled) {
      return Result.fail(new CaseAlreadyClosedError());
    }

    const previousDeadline = this.props.deadline ?? null;
    this.props.deadline = newDeadline;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new CaseDeadlineUpdatedEvent(this.id, previousDeadline, newDeadline, changedBy)
    );

    return Result.ok(undefined);
  }

  changePriority(newPriority: CasePriority, changedBy: string): Result<void, DomainError> {
    if (this.isClosed || this.isCancelled) {
      return Result.fail(new CaseAlreadyClosedError());
    }

    const previousPriority = this.props.priority;
    this.props.priority = newPriority;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new CasePriorityChangedEvent(this.id, previousPriority, newPriority, changedBy)
    );

    return Result.ok(undefined);
  }

  addTask(taskProps: CreateCaseTaskProps, addedBy: string): Result<CaseTask, DomainError> {
    if (this.isClosed || this.isCancelled) {
      return Result.fail(new CaseAlreadyClosedError());
    }

    const taskResult = CaseTask.create(taskProps);
    if (taskResult.isFailure) {
      return Result.fail(taskResult.error);
    }

    const task = taskResult.value;
    this.props.tasks.push(task);
    this.props.updatedAt = new Date();

    this.addDomainEvent(new CaseTaskAddedEvent(this.id, task.id, task.title, addedBy));

    return Result.ok(task);
  }

  removeTask(taskId: CaseTaskId, removedBy: string): Result<void, DomainError> {
    if (this.isClosed || this.isCancelled) {
      return Result.fail(new CaseAlreadyClosedError());
    }

    const taskIndex = this.props.tasks.findIndex((t) => t.id.value === taskId.value);
    if (taskIndex === -1) {
      return Result.fail(new CaseTaskNotFoundError(taskId.value));
    }

    this.props.tasks.splice(taskIndex, 1);
    this.props.updatedAt = new Date();

    this.addDomainEvent(new CaseTaskRemovedEvent(this.id, taskId, removedBy));

    return Result.ok(undefined);
  }

  completeTask(taskId: CaseTaskId, completedBy: string): Result<void, DomainError> {
    if (this.isClosed || this.isCancelled) {
      return Result.fail(new CaseAlreadyClosedError());
    }

    const task = this.props.tasks.find((t) => t.id.value === taskId.value);
    if (!task) {
      return Result.fail(new CaseTaskNotFoundError(taskId.value));
    }

    const completeResult = task.complete();
    if (completeResult.isFailure) {
      return completeResult;
    }

    this.props.updatedAt = new Date();
    this.addDomainEvent(new CaseTaskCompletedEvent(this.id, taskId, completedBy));

    return Result.ok(undefined);
  }

  findTask(taskId: CaseTaskId): CaseTask | undefined {
    return this.props.tasks.find((t) => t.id.value === taskId.value);
  }

  updateCaseInfo(updates: Partial<Pick<CaseProps, 'title' | 'description'>>): void {
    if (updates.title !== undefined) {
      this.props.title = updates.title;
    }
    if (updates.description !== undefined) {
      this.props.description = updates.description;
    }
    this.props.updatedAt = new Date();
  }

  reassign(newAssignee: string): void {
    this.props.assignedTo = newAssignee;
    this.props.updatedAt = new Date();
  }

  // Serialization
  toJSON(): Record<string, unknown> {
    return {
      id: this.id.value,
      title: this.title,
      description: this.description,
      status: this.status,
      priority: this.priority,
      deadline: this.deadline?.toISOString(),
      clientId: this.clientId,
      assignedTo: this.assignedTo,
      tasks: this.props.tasks.map((t) => t.toJSON()),
      taskProgress: this.taskProgress,
      pendingTaskCount: this.pendingTaskCount,
      completedTaskCount: this.completedTaskCount,
      isOverdue: this.isOverdue,
      resolution: this.resolution,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      closedAt: this.closedAt?.toISOString(),
    };
  }
}
