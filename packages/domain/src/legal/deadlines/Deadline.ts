import { Entity } from '../../shared/Entity';
import { Result, DomainError } from '../../shared/Result';
import { DeadlineId } from './DeadlineId';
import { DeadlineRule } from './DeadlineRule';
import { CaseId } from '../cases/CaseId';

/**
 * Deadline status
 */
export type DeadlineStatus =
  | 'PENDING'
  | 'APPROACHING'
  | 'DUE_TODAY'
  | 'OVERDUE'
  | 'COMPLETED'
  | 'WAIVED';

/**
 * Deadline priority based on urgency
 */
export type DeadlinePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Error when deadline is already completed
 */
export class DeadlineAlreadyCompletedError extends DomainError {
  readonly code = 'DEADLINE_ALREADY_COMPLETED';
  constructor() {
    super('Deadline has already been completed');
  }
}

/**
 * Error when deadline is already waived
 */
export class DeadlineAlreadyWaivedError extends DomainError {
  readonly code = 'DEADLINE_ALREADY_WAIVED';
  constructor() {
    super('Deadline has already been waived');
  }
}

/**
 * Deadline entity properties
 */
interface DeadlineProps {
  caseId: CaseId;
  rule: DeadlineRule;
  triggerDate: Date;
  dueDate: Date;
  status: DeadlineStatus;
  priority: DeadlinePriority;
  title: string;
  description?: string;
  assignedTo?: string;
  completedAt?: Date;
  completedBy?: string;
  waivedAt?: Date;
  waivedBy?: string;
  waiverReason?: string;
  remindersSent: number;
  lastReminderAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create deadline props
 */
export interface CreateDeadlineProps {
  caseId: CaseId;
  rule: DeadlineRule;
  triggerDate: Date;
  dueDate: Date;
  title: string;
  description?: string;
  assignedTo?: string;
  priority?: DeadlinePriority;
}

/**
 * Deadline Entity
 * Represents a legal deadline with due date, status tracking, and reminders
 */
export class Deadline extends Entity<DeadlineId> {
  private props: DeadlineProps;

  private constructor(id: DeadlineId, props: DeadlineProps) {
    super(id);
    this.props = props;
  }

  // Getters
  get caseId(): CaseId {
    return this.props.caseId;
  }

  get rule(): DeadlineRule {
    return this.props.rule;
  }

  get triggerDate(): Date {
    return this.props.triggerDate;
  }

  get dueDate(): Date {
    return this.props.dueDate;
  }

  get status(): DeadlineStatus {
    return this.props.status;
  }

  get priority(): DeadlinePriority {
    return this.props.priority;
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get assignedTo(): string | undefined {
    return this.props.assignedTo;
  }

  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }

  get completedBy(): string | undefined {
    return this.props.completedBy;
  }

  get waivedAt(): Date | undefined {
    return this.props.waivedAt;
  }

  get waivedBy(): string | undefined {
    return this.props.waivedBy;
  }

  get waiverReason(): string | undefined {
    return this.props.waiverReason;
  }

  get remindersSent(): number {
    return this.props.remindersSent;
  }

  get lastReminderAt(): Date | undefined {
    return this.props.lastReminderAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get isCompleted(): boolean {
    return this.props.status === 'COMPLETED';
  }

  get isWaived(): boolean {
    return this.props.status === 'WAIVED';
  }

  get isActive(): boolean {
    return !this.isCompleted && !this.isWaived;
  }

  get isOverdue(): boolean {
    return this.props.status === 'OVERDUE';
  }

  /**
   * Get days until deadline (negative if overdue)
   */
  get daysRemaining(): number {
    const now = new Date();
    const diffTime = this.props.dueDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Factory method to create a new Deadline
   */
  static create(props: CreateDeadlineProps): Result<Deadline, DomainError> {
    const now = new Date();
    const deadlineId = DeadlineId.generate();

    // Determine initial status based on due date
    const status = Deadline.calculateStatus(props.dueDate, now);

    // Determine priority if not provided
    const priority = props.priority ?? Deadline.calculatePriority(props.dueDate, now);

    const deadline = new Deadline(deadlineId, {
      caseId: props.caseId,
      rule: props.rule,
      triggerDate: props.triggerDate,
      dueDate: props.dueDate,
      status,
      priority,
      title: props.title,
      description: props.description,
      assignedTo: props.assignedTo,
      remindersSent: 0,
      createdAt: now,
      updatedAt: now,
    });

    return Result.ok(deadline);
  }

  /**
   * Reconstitute from persistence
   */
  static reconstitute(id: DeadlineId, props: DeadlineProps): Deadline {
    return new Deadline(id, props);
  }

  /**
   * Calculate deadline status based on due date
   */
  private static calculateStatus(dueDate: Date, referenceDate: Date = new Date()): DeadlineStatus {
    const diffDays = Math.ceil(
      (dueDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) {
      return 'OVERDUE';
    } else if (diffDays === 0) {
      return 'DUE_TODAY';
    } else if (diffDays <= 3) {
      return 'APPROACHING';
    } else {
      return 'PENDING';
    }
  }

  /**
   * Calculate priority based on urgency
   */
  private static calculatePriority(
    dueDate: Date,
    referenceDate: Date = new Date()
  ): DeadlinePriority {
    const diffDays = Math.ceil(
      (dueDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) {
      return 'CRITICAL';
    } else if (diffDays <= 1) {
      return 'HIGH';
    } else if (diffDays <= 7) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * Update status based on current date
   */
  updateStatus(): void {
    if (!this.isActive) {
      return;
    }

    this.props.status = Deadline.calculateStatus(this.props.dueDate);
    this.props.priority = Deadline.calculatePriority(this.props.dueDate);
    this.props.updatedAt = new Date();
  }

  /**
   * Mark deadline as completed
   */
  complete(completedBy: string): Result<void, DomainError> {
    if (this.isCompleted) {
      return Result.fail(new DeadlineAlreadyCompletedError());
    }

    if (this.isWaived) {
      return Result.fail(new DeadlineAlreadyWaivedError());
    }

    this.props.status = 'COMPLETED';
    this.props.completedAt = new Date();
    this.props.completedBy = completedBy;
    this.props.updatedAt = new Date();

    return Result.ok(undefined);
  }

  /**
   * Waive the deadline
   */
  waive(waivedBy: string, reason: string): Result<void, DomainError> {
    if (this.isCompleted) {
      return Result.fail(new DeadlineAlreadyCompletedError());
    }

    if (this.isWaived) {
      return Result.fail(new DeadlineAlreadyWaivedError());
    }

    this.props.status = 'WAIVED';
    this.props.waivedAt = new Date();
    this.props.waivedBy = waivedBy;
    this.props.waiverReason = reason;
    this.props.updatedAt = new Date();

    return Result.ok(undefined);
  }

  /**
   * Record that a reminder was sent
   */
  recordReminderSent(): void {
    this.props.remindersSent++;
    this.props.lastReminderAt = new Date();
    this.props.updatedAt = new Date();
  }

  /**
   * Assign to a user
   */
  assignTo(userId: string): void {
    this.props.assignedTo = userId;
    this.props.updatedAt = new Date();
  }

  /**
   * Extend the deadline
   */
  extend(newDueDate: Date): Result<void, DomainError> {
    if (!this.isActive) {
      return Result.fail(new DeadlineAlreadyCompletedError());
    }

    this.props.dueDate = newDueDate;
    this.updateStatus();

    return Result.ok(undefined);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id.value,
      caseId: this.caseId.value,
      rule: this.rule.toJSON(),
      triggerDate: this.triggerDate.toISOString(),
      dueDate: this.dueDate.toISOString(),
      status: this.status,
      priority: this.priority,
      title: this.title,
      description: this.description,
      assignedTo: this.assignedTo,
      daysRemaining: this.daysRemaining,
      isOverdue: this.isOverdue,
      isActive: this.isActive,
      remindersSent: this.remindersSent,
      lastReminderAt: this.lastReminderAt?.toISOString(),
      completedAt: this.completedAt?.toISOString(),
      completedBy: this.completedBy,
      waivedAt: this.waivedAt?.toISOString(),
      waivedBy: this.waivedBy,
      waiverReason: this.waiverReason,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
