import { Entity } from '../../shared/Entity';
import { Result, DomainError } from '../../shared/Result';
import { CaseTaskId } from './CaseTaskId';
import { CaseTaskStatus } from './CaseEvents';

export class CaseTaskAlreadyCompletedError extends DomainError {
  readonly code = 'CASE_TASK_ALREADY_COMPLETED';
  constructor() {
    super('Case task has already been completed');
  }
}

export class CaseTaskAlreadyCancelledError extends DomainError {
  readonly code = 'CASE_TASK_ALREADY_CANCELLED';
  constructor() {
    super('Case task has already been cancelled');
  }
}

interface CaseTaskProps {
  title: string;
  description?: string;
  dueDate?: Date;
  status: CaseTaskStatus;
  assignee?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CreateCaseTaskProps {
  title: string;
  description?: string;
  dueDate?: Date;
  assignee?: string;
}

/**
 * CaseTask Entity
 * Represents a task within a legal case/matter
 * Tasks are part of the Case aggregate
 */
export class CaseTask extends Entity<CaseTaskId> {
  private props: CaseTaskProps;

  private constructor(id: CaseTaskId, props: CaseTaskProps) {
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

  get status(): CaseTaskStatus {
    return this.props.status;
  }

  get assignee(): string | undefined {
    return this.props.assignee;
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

  // Factory method
  static create(props: CreateCaseTaskProps): Result<CaseTask, DomainError> {
    const now = new Date();
    const taskId = CaseTaskId.generate();

    const task = new CaseTask(taskId, {
      title: props.title,
      description: props.description,
      dueDate: props.dueDate,
      status: 'PENDING',
      assignee: props.assignee,
      createdAt: now,
      updatedAt: now,
    });

    return Result.ok(task);
  }

  // Reconstitute from persistence
  static reconstitute(id: CaseTaskId, props: CaseTaskProps): CaseTask {
    return new CaseTask(id, props);
  }

  // Commands
  complete(): Result<void, DomainError> {
    if (this.isCompleted) {
      return Result.fail(new CaseTaskAlreadyCompletedError());
    }

    if (this.isCancelled) {
      return Result.fail(new CaseTaskAlreadyCancelledError());
    }

    this.props.status = 'COMPLETED';
    this.props.completedAt = new Date();
    this.props.updatedAt = new Date();

    return Result.ok(undefined);
  }

  cancel(): Result<void, DomainError> {
    if (this.isCompleted) {
      return Result.fail(new CaseTaskAlreadyCompletedError());
    }

    if (this.isCancelled) {
      return Result.fail(new CaseTaskAlreadyCancelledError());
    }

    this.props.status = 'CANCELLED';
    this.props.updatedAt = new Date();

    return Result.ok(undefined);
  }

  start(): Result<void, DomainError> {
    if (this.isCompleted) {
      return Result.fail(new CaseTaskAlreadyCompletedError());
    }

    if (this.isCancelled) {
      return Result.fail(new CaseTaskAlreadyCancelledError());
    }

    this.props.status = 'IN_PROGRESS';
    this.props.updatedAt = new Date();

    return Result.ok(undefined);
  }

  updateDueDate(newDueDate: Date): Result<void, DomainError> {
    if (this.isCompleted || this.isCancelled) {
      return Result.fail(new CaseTaskAlreadyCompletedError());
    }

    this.props.dueDate = newDueDate;
    this.props.updatedAt = new Date();

    return Result.ok(undefined);
  }

  updateAssignee(assignee: string): void {
    this.props.assignee = assignee;
    this.props.updatedAt = new Date();
  }

  updateInfo(updates: Partial<Pick<CaseTaskProps, 'title' | 'description'>>): void {
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
      status: this.status,
      assignee: this.assignee,
      isOverdue: this.isOverdue,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      completedAt: this.completedAt?.toISOString(),
    };
  }
}
