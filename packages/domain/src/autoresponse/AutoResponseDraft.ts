import { AggregateRoot } from '../shared/AggregateRoot';
import { Result, DomainError } from '../shared/Result';
import { AutoResponseDraftId } from './AutoResponseDraftId';
import { ResponseContent } from './ResponseContent';
import {
  AutoResponseGeneratedEvent,
  AutoResponseSubmittedForApprovalEvent,
  AutoResponseApprovedEvent,
  AutoResponseRejectedEvent,
  AutoResponseSentEvent,
  AutoResponseExpiredEvent,
  AutoResponseEscalatedEvent,
  AutoResponseInvalidatedEvent,
  AutoResponseSendFailedEvent,
  AutoResponseEscalationResolvedEvent,
} from './AutoResponseEvents';

// Status constants - single source of truth
export const AUTO_RESPONSE_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'INVALIDATED',
  'SENT',
  'FAILED',
  'ESCALATED',
] as const;

export type AutoResponseStatus = (typeof AUTO_RESPONSE_STATUSES)[number];

// Trigger types
export const TRIGGER_TYPES = ['EMAIL_RECEIVED', 'FORM_SUBMIT', 'CHAT_MESSAGE', 'MANUAL'] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];

// Lead statuses that allow auto-response
export const ALLOWED_LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'NURTURING'] as const;

// Domain Errors
export class InvalidLeadStatusError extends DomainError {
  readonly code = 'INVALID_LEAD_STATUS';
  constructor(leadStatus: string) {
    super(`Lead status "${leadStatus}" does not allow auto-responses`);
  }
}

export class TenantMismatchError extends DomainError {
  readonly code = 'TENANT_MISMATCH';
  constructor() {
    super('Draft tenant does not match lead tenant');
  }
}

export class InvalidStatusTransitionError extends DomainError {
  readonly code = 'INVALID_STATUS_TRANSITION';
  constructor(from: AutoResponseStatus, to: AutoResponseStatus) {
    super(`Cannot transition from ${from} to ${to}`);
  }
}

export class DraftExpiredError extends DomainError {
  readonly code = 'DRAFT_EXPIRED';
  constructor() {
    super('Draft has expired and cannot be modified');
  }
}

export class ApprovalRequiredError extends DomainError {
  readonly code = 'APPROVAL_REQUIRED';
  constructor() {
    super('Human approval is required before sending');
  }
}

export class MaxEscalationsReachedError extends DomainError {
  readonly code = 'MAX_ESCALATIONS_REACHED';
  constructor(draftId: string, count: number) {
    super(`Maximum escalations (${count}) reached for draft ${draftId}`);
  }
}

// Status change tracking
interface StatusChange {
  status: AutoResponseStatus;
  changedAt: Date;
  changedBy?: string;
  reason?: string;
}

// Approval decision
export interface ApprovalDecision {
  decision: 'APPROVED' | 'REJECTED';
  decidedBy: string;
  decidedAt: Date;
  reason?: string;
  modifications?: {
    subject?: string;
    body?: string;
  };
}

// Escalation info
export interface Escalation {
  reason: string;
  escalatedTo: string;
  escalatedBy: string;
  escalatedAt: Date;
  expiresAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionFeedback?: string;
}

// Aggregate props
interface AutoResponseDraftProps {
  tenantId: string;
  leadId: string;
  triggerType: TriggerType;
  content: ResponseContent;
  aiConfidence: number;
  modelVersion: string;
  status: AutoResponseStatus;
  statusHistory: StatusChange[];
  approvalDecision?: ApprovalDecision;
  escalation?: Escalation;
  escalationCount: number;
  createdAt: Date;
  expiresAt: Date;
  updatedAt: Date;
  recipientEmail: string;
}

// Create props
export interface CreateAutoResponseDraftProps {
  tenantId: string;
  leadId: string;
  leadTenantId: string; // For tenant validation
  leadStatus: string; // For status validation
  triggerType: TriggerType;
  content: ResponseContent;
  aiConfidence: number;
  modelVersion: string; // AI model that generated the response
  recipientEmail: string;
  expiryHours?: number; // Default 24
}

// Rehydrate props (from persistence)
export interface RehydrateAutoResponseDraftProps {
  id: string;
  tenantId: string;
  leadId: string;
  triggerType: TriggerType;
  content: ResponseContent;
  aiConfidence: number;
  modelVersion: string;
  status: AutoResponseStatus;
  statusHistory: StatusChange[];
  approvalDecision?: ApprovalDecision;
  escalation?: Escalation;
  escalationCount?: number;
  createdAt: Date;
  expiresAt: Date;
  updatedAt: Date;
  recipientEmail: string;
}

/**
 * AutoResponseDraft Aggregate Root
 * Represents an AI-generated response awaiting human approval
 */
export class AutoResponseDraft extends AggregateRoot<AutoResponseDraftId> {
  private readonly props: AutoResponseDraftProps;

  // IFC-029: Escalation limit to prevent infinite escalation cycles
  private static readonly MAX_ESCALATIONS = 3;

  // IFC-029: Status history cap to prevent unbounded growth
  private static readonly MAX_STATUS_HISTORY = 50;

  private constructor(id: AutoResponseDraftId, props: AutoResponseDraftProps) {
    super(id);
    this.props = props;
  }

  // --- Factory Methods ---

  /**
   * Create a new auto-response draft
   */
  static create(
    props: CreateAutoResponseDraftProps
  ): Result<AutoResponseDraft, InvalidLeadStatusError | TenantMismatchError> {
    // Invariant 1: Lead status must allow outbound communication
    if (!ALLOWED_LEAD_STATUSES.includes(props.leadStatus as any)) {
      return Result.fail(new InvalidLeadStatusError(props.leadStatus));
    }

    // Invariant 2: Tenant isolation
    if (props.tenantId !== props.leadTenantId) {
      return Result.fail(new TenantMismatchError());
    }

    const now = new Date();
    const expiryHours = props.expiryHours ?? 24;
    const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);

    const id = AutoResponseDraftId.create();
    const draft = new AutoResponseDraft(id, {
      tenantId: props.tenantId,
      leadId: props.leadId,
      triggerType: props.triggerType,
      content: props.content,
      aiConfidence: props.aiConfidence,
      modelVersion: props.modelVersion,
      status: 'DRAFT',
      statusHistory: [
        {
          status: 'DRAFT',
          changedAt: now,
          reason: 'Generated by AI',
        },
      ],
      escalationCount: 0,
      createdAt: now,
      expiresAt,
      updatedAt: now,
      recipientEmail: props.recipientEmail,
    });

    // Emit domain event
    draft.addDomainEvent(
      new AutoResponseGeneratedEvent(
        id.toString(),
        props.leadId,
        props.tenantId,
        props.triggerType,
        props.aiConfidence
      )
    );

    return Result.ok(draft);
  }

  /**
   * Rehydrate from persistence
   */
  static rehydrate(props: RehydrateAutoResponseDraftProps): AutoResponseDraft {
    const id = AutoResponseDraftId.fromString(props.id);
    return new AutoResponseDraft(id, {
      tenantId: props.tenantId,
      leadId: props.leadId,
      triggerType: props.triggerType,
      content: props.content,
      aiConfidence: props.aiConfidence,
      modelVersion: props.modelVersion,
      status: props.status,
      statusHistory: props.statusHistory,
      approvalDecision: props.approvalDecision,
      escalation: props.escalation,
      escalationCount: props.escalationCount ?? 0,
      createdAt: props.createdAt,
      expiresAt: props.expiresAt,
      updatedAt: props.updatedAt,
      recipientEmail: props.recipientEmail,
    });
  }

  // --- Getters ---

  get tenantId(): string {
    return this.props.tenantId;
  }

  get leadId(): string {
    return this.props.leadId;
  }

  get triggerType(): TriggerType {
    return this.props.triggerType;
  }

  get content(): ResponseContent {
    return this.props.content;
  }

  get aiConfidence(): number {
    return this.props.aiConfidence;
  }

  get modelVersion(): string {
    return this.props.modelVersion;
  }

  get status(): AutoResponseStatus {
    return this.props.status;
  }

  get statusHistory(): ReadonlyArray<StatusChange> {
    return [...this.props.statusHistory];
  }

  get approvalDecision(): ApprovalDecision | undefined {
    return this.props.approvalDecision ? { ...this.props.approvalDecision } : undefined;
  }

  get escalation(): Escalation | undefined {
    return this.props.escalation ? { ...this.props.escalation } : undefined;
  }

  get escalationCount(): number {
    return this.props.escalationCount;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get recipientEmail(): string {
    return this.props.recipientEmail;
  }

  get isExpired(): boolean {
    return new Date() > this.props.expiresAt;
  }

  get isPendingApproval(): boolean {
    return this.props.status === 'PENDING_APPROVAL';
  }

  get isApproved(): boolean {
    return this.props.status === 'APPROVED';
  }

  get canBeSent(): boolean {
    return this.props.status === 'APPROVED' && !this.isExpired;
  }

  // --- State Transitions ---

  /**
   * Submit draft for human approval
   * Invariant 4: Approval always required (no auto-send)
   */
  submitForApproval(
    approverId: string
  ): Result<void, DraftExpiredError | InvalidStatusTransitionError> {
    if (this.isExpired) {
      this.markExpired();
      return Result.fail(new DraftExpiredError());
    }

    if (this.props.status !== 'DRAFT') {
      return Result.fail(new InvalidStatusTransitionError(this.props.status, 'PENDING_APPROVAL'));
    }

    this.props.status = 'PENDING_APPROVAL';
    this.props.updatedAt = new Date();
    this.addStatusHistory('PENDING_APPROVAL', approverId, 'Submitted for human approval');

    this.addDomainEvent(
      new AutoResponseSubmittedForApprovalEvent(this.id.toString(), this.props.tenantId, approverId)
    );

    return Result.ok(undefined);
  }

  /**
   * Approve the draft (with optional modifications)
   */
  approve(
    approvedBy: string,
    modifications?: { subject?: string; body?: string },
    reason?: string
  ): Result<void, DraftExpiredError | InvalidStatusTransitionError> {
    if (this.isExpired) {
      this.markExpired();
      return Result.fail(new DraftExpiredError());
    }

    if (this.props.status !== 'PENDING_APPROVAL') {
      return Result.fail(new InvalidStatusTransitionError(this.props.status, 'APPROVED'));
    }

    // Apply modifications if provided
    if (modifications && (modifications.subject || modifications.body)) {
      this.props.content = this.props.content.withModifications(modifications);
    }

    this.props.status = 'APPROVED';
    this.props.updatedAt = new Date();
    this.props.approvalDecision = {
      decision: 'APPROVED',
      decidedBy: approvedBy,
      decidedAt: this.props.updatedAt,
      reason,
      modifications,
    };
    this.addStatusHistory('APPROVED', approvedBy, reason ?? 'Approved by human');

    this.addDomainEvent(
      new AutoResponseApprovedEvent(
        this.id.toString(),
        approvedBy,
        this.props.tenantId,
        !!modifications,
        reason
      )
    );

    return Result.ok(undefined);
  }

  /**
   * Reject the draft
   */
  reject(
    rejectedBy: string,
    reason: string
  ): Result<void, DraftExpiredError | InvalidStatusTransitionError> {
    if (this.isExpired) {
      this.markExpired();
      return Result.fail(new DraftExpiredError());
    }

    if (this.props.status !== 'PENDING_APPROVAL') {
      return Result.fail(new InvalidStatusTransitionError(this.props.status, 'REJECTED'));
    }

    this.props.status = 'REJECTED';
    this.props.updatedAt = new Date();
    this.props.approvalDecision = {
      decision: 'REJECTED',
      decidedBy: rejectedBy,
      decidedAt: this.props.updatedAt,
      reason,
    };
    this.addStatusHistory('REJECTED', rejectedBy, reason);

    this.addDomainEvent(
      new AutoResponseRejectedEvent(this.id.toString(), rejectedBy, this.props.tenantId, reason)
    );

    return Result.ok(undefined);
  }

  /**
   * Mark as sent
   */
  markSent(
    notificationId: string
  ): Result<void, ApprovalRequiredError | InvalidStatusTransitionError> {
    if (this.props.status !== 'APPROVED') {
      if (this.props.status === 'DRAFT' || this.props.status === 'PENDING_APPROVAL') {
        return Result.fail(new ApprovalRequiredError());
      }
      return Result.fail(new InvalidStatusTransitionError(this.props.status, 'SENT'));
    }

    this.props.status = 'SENT';
    this.props.updatedAt = new Date();
    this.addStatusHistory('SENT', undefined, `Sent via notification ${notificationId}`);

    this.addDomainEvent(
      new AutoResponseSentEvent(
        this.id.toString(),
        this.props.tenantId,
        notificationId,
        this.props.recipientEmail
      )
    );

    return Result.ok(undefined);
  }

  /**
   * Mark send as failed
   */
  markSendFailed(error: string): Result<void, InvalidStatusTransitionError> {
    if (this.props.status !== 'APPROVED') {
      return Result.fail(new InvalidStatusTransitionError(this.props.status, 'FAILED'));
    }

    this.props.status = 'FAILED';
    this.props.updatedAt = new Date();
    this.addStatusHistory('FAILED', undefined, `Send failed: ${error}`);

    this.addDomainEvent(
      new AutoResponseSendFailedEvent(this.id.toString(), this.props.tenantId, error)
    );

    return Result.ok(undefined);
  }

  /**
   * Escalate to manager
   * IFC-029: Enforces MAX_ESCALATIONS=3 limit to prevent escalation cycles
   */
  escalate(
    escalatedBy: string,
    escalatedTo: string,
    reason: string,
    escalationExpiryHours: number = 48
  ): Result<void, DraftExpiredError | InvalidStatusTransitionError | MaxEscalationsReachedError> {
    if (this.isExpired) {
      this.markExpired();
      return Result.fail(new DraftExpiredError());
    }

    if (this.props.status !== 'PENDING_APPROVAL') {
      return Result.fail(new InvalidStatusTransitionError(this.props.status, 'ESCALATED'));
    }

    // IFC-029: Check escalation limit
    if (this.props.escalationCount >= AutoResponseDraft.MAX_ESCALATIONS) {
      return Result.fail(
        new MaxEscalationsReachedError(this.id.toString(), this.props.escalationCount)
      );
    }

    const now = new Date();
    this.props.status = 'ESCALATED';
    this.props.updatedAt = now;
    this.props.escalationCount += 1;
    this.props.escalation = {
      reason,
      escalatedTo,
      escalatedBy,
      escalatedAt: now,
      expiresAt: new Date(now.getTime() + escalationExpiryHours * 60 * 60 * 1000),
    };
    this.addStatusHistory('ESCALATED', escalatedBy, `Escalated to ${escalatedTo}: ${reason}`);

    this.addDomainEvent(
      new AutoResponseEscalatedEvent(
        this.id.toString(),
        this.props.tenantId,
        escalatedTo,
        escalatedBy,
        reason
      )
    );

    return Result.ok(undefined);
  }

  /**
   * Invalidate the draft (e.g., lead status changed)
   */
  invalidate(reason: string): void {
    if (
      this.props.status === 'SENT' ||
      this.props.status === 'REJECTED' ||
      this.props.status === 'INVALIDATED'
    ) {
      return; // Already in terminal state
    }

    this.props.status = 'INVALIDATED';
    this.props.updatedAt = new Date();
    this.addStatusHistory('INVALIDATED', undefined, reason);

    this.addDomainEvent(
      new AutoResponseInvalidatedEvent(this.id.toString(), this.props.tenantId, reason)
    );
  }

  /**
   * Mark as expired (internal)
   */
  private markExpired(): void {
    if (this.props.status !== 'INVALIDATED' && this.props.status !== 'SENT') {
      this.props.status = 'INVALIDATED';
      this.props.updatedAt = new Date();
      this.addStatusHistory('INVALIDATED', undefined, 'Expired after 24 hours');

      this.addDomainEvent(new AutoResponseExpiredEvent(this.id.toString(), this.props.tenantId));
    }
  }

  /**
   * Check expiry and mark if needed
   */
  checkExpiry(): boolean {
    if (this.isExpired && this.props.status !== 'INVALIDATED' && this.props.status !== 'SENT') {
      this.markExpired();
      return true;
    }
    return false;
  }

  /**
   * Resolve escalation (ESCALATED -> PENDING_APPROVAL)
   * IFC-029: Allows manager to resolve an escalated draft and return it for approval
   */
  resolveEscalation(
    resolvedBy: string,
    feedback?: string
  ): Result<void, DraftExpiredError | InvalidStatusTransitionError> {
    if (this.isExpired) {
      this.markExpired();
      return Result.fail(new DraftExpiredError());
    }

    if (this.props.status !== 'ESCALATED') {
      return Result.fail(new InvalidStatusTransitionError(this.props.status, 'PENDING_APPROVAL'));
    }

    const now = new Date();
    this.props.updatedAt = now;

    // Update escalation with resolution details
    if (this.props.escalation) {
      this.props.escalation = {
        ...this.props.escalation,
        resolvedAt: now,
        resolvedBy,
        resolutionFeedback: feedback,
      };
    }

    this.props.status = 'PENDING_APPROVAL';
    this.addStatusHistory('PENDING_APPROVAL', resolvedBy, feedback ?? 'Escalation resolved');

    this.addDomainEvent(
      new AutoResponseEscalationResolvedEvent(
        this.id.toString(),
        this.props.tenantId,
        resolvedBy,
        feedback
      )
    );

    return Result.ok(undefined);
  }

  /**
   * Add entry to status history with rotation at MAX_STATUS_HISTORY
   * IFC-029: Caps status history at 50 entries
   */
  private addStatusHistory(status: AutoResponseStatus, changedBy?: string, reason?: string): void {
    this.props.statusHistory.push({
      status,
      changedAt: new Date(),
      changedBy,
      reason,
    });

    // Cap at MAX_STATUS_HISTORY entries, remove oldest
    if (this.props.statusHistory.length > AutoResponseDraft.MAX_STATUS_HISTORY) {
      this.props.statusHistory.shift();
    }
  }
}
