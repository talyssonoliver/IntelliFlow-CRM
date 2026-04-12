import { AggregateRoot } from '../../shared/AggregateRoot';
import { Result, DomainError } from '../../shared/Result';
import { TicketId } from './TicketId';
import {
  TicketCreatedEvent,
  TicketStatusChangedEvent,
  TicketPriorityChangedEvent,
  TicketAssignedEvent,
  TicketUnassignedEvent,
  TicketResolvedEvent,
  TicketClosedEvent,
  TicketReopenedEvent,
  TicketResponseSlaBreachedEvent,
  TicketResolutionSlaBreachedEvent,
  TicketSlaPausedEvent,
  TicketSlaResumedEvent,
} from './TicketEvents';
import {
  TicketStatus,
  TicketPriority,
  SLAStatus,
  canTransitionTicketTo,
  isTerminalStatus,
  isWaitingStatus,
} from '../../support/TicketConstants';

// Custom Error Classes
export class InvalidTicketTransitionError extends DomainError {
  readonly code = 'INVALID_TICKET_TRANSITION';
  constructor(from: TicketStatus, to: TicketStatus) {
    super(`Invalid ticket transition from ${from} to ${to}`);
  }
}

export class TicketAlreadyClosedError extends DomainError {
  readonly code = 'TICKET_ALREADY_CLOSED';
  constructor() {
    super('Ticket has already been closed');
  }
}

export class TicketSlaNotPausedError extends DomainError {
  readonly code = 'TICKET_SLA_NOT_PAUSED';
  constructor() {
    super('SLA is not currently paused');
  }
}

export class TicketSlaAlreadyPausedError extends DomainError {
  readonly code = 'TICKET_SLA_ALREADY_PAUSED';
  constructor() {
    super('SLA is already paused');
  }
}

export class TicketFirstResponseAlreadyRecordedError extends DomainError {
  readonly code = 'TICKET_FIRST_RESPONSE_ALREADY_RECORDED';
  constructor() {
    super('First response has already been recorded');
  }
}

// Ticket Properties Interface
interface TicketProps {
  ticketNumber: string;
  subject: string;
  description?: string;
  status: TicketStatus;
  priority: TicketPriority;
  tenantId: string;

  // SLA Tracking
  slaPolicyId: string;
  slaResponseDue?: Date;
  slaResolutionDue?: Date;
  slaStatus: SLAStatus;
  slaBreachedAt?: Date;
  slaPausedAt?: Date;
  slaPausedDuration: number; // Cumulative milliseconds
  firstResponseAt?: Date;
  resolvedAt?: Date;

  // Contact & Assignment
  contactId?: string;
  contactName: string;
  contactEmail: string;
  assigneeId?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

// CreateTicketProps Interface (for factory method)
export interface CreateTicketProps {
  subject: string;
  description?: string;
  priority?: TicketPriority;
  contactName: string;
  contactEmail: string;
  contactId?: string;
  assigneeId?: string;
  slaPolicyId: string;
  slaResponseDue?: Date;
  slaResolutionDue?: Date;
  tenantId: string;
}

// Ticket number counter (in production, this would be from DB sequence)
let ticketCounter = 0;

function generateTicketNumber(): string {
  ticketCounter++;
  return `T-${String(ticketCounter).padStart(5, '0')}`;
}

// AT_RISK threshold: 30 minutes before deadline
const AT_RISK_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Ticket Aggregate Root
 *
 * Represents a support ticket in the CRM with SLA tracking,
 * status management, priority escalation, and customer linking.
 */
export class Ticket extends AggregateRoot<TicketId> {
  private readonly props: TicketProps;

  private constructor(id: TicketId, props: TicketProps) {
    super(id);
    this.props = props;
  }

  // ==================== Getters ====================

  get ticketNumber(): string {
    return this.props.ticketNumber;
  }

  get subject(): string {
    return this.props.subject;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get status(): TicketStatus {
    return this.props.status;
  }

  get priority(): TicketPriority {
    return this.props.priority;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get slaPolicyId(): string {
    return this.props.slaPolicyId;
  }

  get slaResponseDue(): Date | undefined {
    return this.props.slaResponseDue;
  }

  get slaResolutionDue(): Date | undefined {
    return this.props.slaResolutionDue;
  }

  get slaStatus(): SLAStatus {
    return this.props.slaStatus;
  }

  get slaBreachedAt(): Date | undefined {
    return this.props.slaBreachedAt;
  }

  get slaPausedAt(): Date | undefined {
    return this.props.slaPausedAt;
  }

  get slaPausedDuration(): number {
    return this.props.slaPausedDuration;
  }

  get firstResponseAt(): Date | undefined {
    return this.props.firstResponseAt;
  }

  get resolvedAt(): Date | undefined {
    return this.props.resolvedAt;
  }

  get contactId(): string | undefined {
    return this.props.contactId;
  }

  get contactName(): string {
    return this.props.contactName;
  }

  get contactEmail(): string {
    return this.props.contactEmail;
  }

  get assigneeId(): string | undefined {
    return this.props.assigneeId;
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

  // ==================== Computed Properties ====================

  get isClosed(): boolean {
    return this.props.status === 'CLOSED';
  }

  get isResolved(): boolean {
    return this.props.status === 'RESOLVED';
  }

  get isWaiting(): boolean {
    return isWaitingStatus(this.props.status);
  }

  get isSlaBreached(): boolean {
    return this.props.slaStatus === 'BREACHED';
  }

  get isSlaPaused(): boolean {
    return this.props.slaStatus === 'PAUSED';
  }

  get canBeClosed(): boolean {
    if (this.isClosed) return false;
    return canTransitionTicketTo(this.props.status, 'CLOSED');
  }

  // ==================== Factory Methods ====================

  /**
   * Creates a new Ticket aggregate
   */
  static create(props: CreateTicketProps): Result<Ticket, DomainError> {
    const now = new Date();
    const ticketId = TicketId.generate();
    const ticketNumber = generateTicketNumber();

    const ticket = new Ticket(ticketId, {
      ticketNumber,
      subject: props.subject,
      description: props.description,
      status: 'OPEN',
      priority: props.priority ?? 'MEDIUM',
      tenantId: props.tenantId,
      slaPolicyId: props.slaPolicyId,
      slaResponseDue: props.slaResponseDue,
      slaResolutionDue: props.slaResolutionDue,
      slaStatus: 'ON_TRACK',
      slaPausedDuration: 0,
      contactId: props.contactId,
      contactName: props.contactName,
      contactEmail: props.contactEmail,
      assigneeId: props.assigneeId,
      createdAt: now,
      updatedAt: now,
    });

    ticket.addDomainEvent(
      new TicketCreatedEvent(ticketId, ticketNumber, props.subject, ticket.priority, props.tenantId)
    );

    return Result.ok(ticket);
  }

  /**
   * Reconstitutes a Ticket from persistence data (no events emitted)
   */
  static reconstitute(id: TicketId, props: TicketProps): Ticket {
    return new Ticket(id, props);
  }

  // ==================== SLA Methods ====================

  /**
   * Checks the current SLA status based on deadlines
   * @param now - Optional current time for testability
   */
  checkSlaStatus(now: Date = new Date()): SLAStatus {
    if (this.isSlaPaused) return 'PAUSED';
    if (this.isSlaBreached) return 'BREACHED';

    // Check response SLA first (if not yet responded)
    if (this.props.slaResponseDue && !this.props.firstResponseAt) {
      const timeRemaining = this.props.slaResponseDue.getTime() - now.getTime();
      if (timeRemaining < 0) return 'BREACHED';
      if (timeRemaining < AT_RISK_THRESHOLD_MS) return 'AT_RISK';
    }

    // Check resolution SLA
    if (this.props.slaResolutionDue && !this.props.resolvedAt) {
      const timeRemaining = this.props.slaResolutionDue.getTime() - now.getTime();
      if (timeRemaining < 0) return 'BREACHED';
      if (timeRemaining < AT_RISK_THRESHOLD_MS) return 'AT_RISK';
    }

    return 'ON_TRACK';
  }

  /**
   * Checks if response SLA has been breached
   * @param now - Optional current time for testability
   */
  isResponseSlaBreached(now: Date = new Date()): boolean {
    if (!this.props.slaResponseDue) return false;
    if (this.props.firstResponseAt) return false; // Already responded
    return now.getTime() > this.props.slaResponseDue.getTime();
  }

  /**
   * Checks if resolution SLA has been breached
   * @param now - Optional current time for testability
   */
  isResolutionSlaBreached(now: Date = new Date()): boolean {
    if (!this.props.slaResolutionDue) return false;
    return now.getTime() > this.props.slaResolutionDue.getTime();
  }

  /**
   * Pauses SLA tracking
   */
  pauseSla(reason: string, pausedBy: string, now: Date = new Date()): Result<void, DomainError> {
    if (this.isSlaPaused) {
      return Result.fail(new TicketSlaAlreadyPausedError());
    }

    this.props.slaPausedAt = now;
    this.props.slaStatus = 'PAUSED';
    this.props.updatedAt = now;

    this.addDomainEvent(new TicketSlaPausedEvent(this.id, now, reason, pausedBy));

    return Result.ok(undefined);
  }

  /**
   * Resumes SLA tracking after pause
   */
  resumeSla(resumedBy: string, now: Date = new Date()): Result<void, DomainError> {
    if (!this.isSlaPaused || !this.props.slaPausedAt) {
      return Result.fail(new TicketSlaNotPausedError());
    }

    const pausedDuration = now.getTime() - this.props.slaPausedAt.getTime();
    this.props.slaPausedDuration += pausedDuration;
    this.props.slaPausedAt = undefined;
    this.props.slaStatus = 'ON_TRACK';
    this.props.updatedAt = now;

    this.addDomainEvent(
      new TicketSlaResumedEvent(this.id, now, this.props.slaPausedDuration, resumedBy)
    );

    return Result.ok(undefined);
  }

  /**
   * Records the first response time
   */
  recordFirstResponse(respondedBy: string, now: Date = new Date()): Result<void, DomainError> {
    if (this.props.firstResponseAt) {
      return Result.fail(new TicketFirstResponseAlreadyRecordedError());
    }

    this.props.firstResponseAt = now;
    this.props.updatedAt = now;

    return Result.ok(undefined);
  }

  /**
   * Records an SLA breach
   */
  breachSla(breachType: 'RESPONSE' | 'RESOLUTION', now: Date = new Date()): void {
    this.props.slaStatus = 'BREACHED';
    this.props.slaBreachedAt = now;
    this.props.updatedAt = now;

    if (breachType === 'RESPONSE' && this.props.slaResponseDue) {
      this.addDomainEvent(
        new TicketResponseSlaBreachedEvent(
          this.id,
          this.props.slaResponseDue,
          now,
          this.props.slaPolicyId
        )
      );
    } else if (breachType === 'RESOLUTION' && this.props.slaResolutionDue) {
      this.addDomainEvent(
        new TicketResolutionSlaBreachedEvent(
          this.id,
          this.props.slaResolutionDue,
          now,
          this.props.slaPolicyId
        )
      );
    }
  }

  // ==================== Status Commands ====================

  /**
   * Changes the ticket status
   */
  changeStatus(newStatus: TicketStatus, changedBy: string): Result<void, DomainError> {
    if (isTerminalStatus(this.props.status)) {
      return Result.fail(new TicketAlreadyClosedError());
    }

    if (!canTransitionTicketTo(this.props.status, newStatus)) {
      return Result.fail(new InvalidTicketTransitionError(this.props.status, newStatus));
    }

    const previousStatus = this.props.status;
    this.props.status = newStatus;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new TicketStatusChangedEvent(this.id, previousStatus, newStatus, changedBy)
    );

    return Result.ok(undefined);
  }

  /**
   * Starts work on the ticket
   */
  startWork(startedBy: string): Result<void, DomainError> {
    return this.changeStatus('IN_PROGRESS', startedBy);
  }

  /**
   * Sets ticket to waiting on customer
   */
  waitOnCustomer(reason: string, changedBy: string): Result<void, DomainError> {
    return this.changeStatus('WAITING_ON_CUSTOMER', changedBy);
  }

  /**
   * Sets ticket to waiting on third party
   */
  waitOnThirdParty(thirdParty: string, changedBy: string): Result<void, DomainError> {
    return this.changeStatus('WAITING_ON_THIRD_PARTY', changedBy);
  }

  /**
   * Resolves the ticket
   */
  resolve(resolution: string, resolvedBy: string): Result<void, DomainError> {
    const result = this.changeStatus('RESOLVED', resolvedBy);
    if (result.isFailure) return result;

    const now = new Date();
    this.props.resolvedAt = now;

    this.addDomainEvent(new TicketResolvedEvent(this.id, resolution, resolvedBy, now));

    return Result.ok(undefined);
  }

  /**
   * Closes the ticket
   */
  close(closedBy: string): Result<void, DomainError> {
    const result = this.changeStatus('CLOSED', closedBy);
    if (result.isFailure) return result;

    const now = new Date();
    this.props.closedAt = now;

    this.addDomainEvent(new TicketClosedEvent(this.id, closedBy, now));

    return Result.ok(undefined);
  }

  /**
   * Reopens a resolved ticket
   */
  reopen(reason: string, reopenedBy: string): Result<void, DomainError> {
    const result = this.changeStatus('OPEN', reopenedBy);
    if (result.isFailure) return result;

    this.props.resolvedAt = undefined;

    this.addDomainEvent(new TicketReopenedEvent(this.id, reason, reopenedBy));

    return Result.ok(undefined);
  }

  // ==================== Assignment Methods ====================

  /**
   * Assigns the ticket to an agent.
   * Rejects assignment to ARCHIVED tickets (IFC-067).
   */
  assign(assigneeId: string, assignedBy: string): void {
    if (this.props.status === 'ARCHIVED') {
      throw new Error('Cannot assign an archived ticket');
    }

    const previousAssigneeId = this.props.assigneeId ?? null;
    this.props.assigneeId = assigneeId;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new TicketAssignedEvent(this.id, previousAssigneeId, assigneeId, assignedBy)
    );
  }

  /**
   * Unassigns the ticket
   */
  unassign(unassignedBy: string): void {
    const previousAssigneeId = this.props.assigneeId!;
    this.props.assigneeId = undefined;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new TicketUnassignedEvent(this.id, previousAssigneeId, unassignedBy));
  }

  // ==================== Update Methods ====================

  /**
   * Changes the ticket priority
   */
  changePriority(newPriority: TicketPriority, changedBy: string): Result<void, DomainError> {
    if (this.isClosed) {
      return Result.fail(new TicketAlreadyClosedError());
    }

    const previousPriority = this.props.priority;
    this.props.priority = newPriority;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new TicketPriorityChangedEvent(this.id, previousPriority, newPriority, changedBy)
    );

    return Result.ok(undefined);
  }

  /**
   * Updates ticket info (subject/description)
   */
  updateTicketInfo(updates: Partial<Pick<TicketProps, 'subject' | 'description'>>): void {
    if (updates.subject !== undefined) {
      this.props.subject = updates.subject;
    }
    if (updates.description !== undefined) {
      this.props.description = updates.description;
    }
    this.props.updatedAt = new Date();
  }

  // ==================== Serialization ====================

  /**
   * Converts the ticket to a JSON object
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id.value,
      ticketNumber: this.props.ticketNumber,
      subject: this.props.subject,
      description: this.props.description,
      status: this.props.status,
      priority: this.props.priority,
      tenantId: this.props.tenantId,
      slaPolicyId: this.props.slaPolicyId,
      slaResponseDue: this.props.slaResponseDue?.toISOString(),
      slaResolutionDue: this.props.slaResolutionDue?.toISOString(),
      slaStatus: this.props.slaStatus,
      slaBreachedAt: this.props.slaBreachedAt?.toISOString(),
      slaPausedAt: this.props.slaPausedAt?.toISOString(),
      slaPausedDuration: this.props.slaPausedDuration,
      firstResponseAt: this.props.firstResponseAt?.toISOString(),
      resolvedAt: this.props.resolvedAt?.toISOString(),
      contactId: this.props.contactId,
      contactName: this.props.contactName,
      contactEmail: this.props.contactEmail,
      assigneeId: this.props.assigneeId,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
      closedAt: this.props.closedAt?.toISOString(),
    };
  }
}
