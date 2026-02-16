import { AggregateRoot } from '../../shared/AggregateRoot';
import { Result } from '../../shared/Result';
import { ReviewId } from './ReviewId';
import { ConfidenceScore } from './ConfidenceScore';
import { ReviewStatus, ReviewDecision, canTransitionTo } from './ReviewStatus';
import { ReviewRequestedEvent } from './events/ReviewRequestedEvent';
import { ReviewApprovedEvent } from './events/ReviewApprovedEvent';
import { ReviewRejectedEvent } from './events/ReviewRejectedEvent';
import { ReviewEscalatedEvent } from './events/ReviewEscalatedEvent';

/**
 * AI output types that can be reviewed
 */
export const AI_OUTPUT_TYPES = [
  'LEAD_SCORING',
  'SENTIMENT_ANALYSIS',
  'AUTO_RESPONSE',
  'CHURN_PREDICTION',
  'EMAIL_GENERATION',
  'NEXT_BEST_ACTION',
] as const;

export type AIOutputType = (typeof AI_OUTPUT_TYPES)[number];

/**
 * SLA configuration for reviews
 */
export const REVIEW_SLA_CONFIG = {
  /** Default SLA in hours */
  DEFAULT_SLA_HOURS: 24,
  /** Lock duration in minutes */
  LOCK_DURATION_MINUTES: 5,
  /** Maximum escalation depth before requiring admin intervention */
  MAX_ESCALATION_DEPTH: 3,
  /** Rollback window in hours */
  ROLLBACK_WINDOW_HOURS: 1,
} as const;

/**
 * Props required to create a new AIOutputReview
 */
export interface CreateReviewProps {
  id?: string;
  tenantId: string;
  outputType: AIOutputType;
  outputPayload: unknown;
  confidence: number;
  slaHours?: number;
}

/**
 * AIOutputReview Aggregate Root
 *
 * Represents a human review request for an AI-generated output.
 * Implements a state machine for the review lifecycle.
 */
export class AIOutputReview extends AggregateRoot<ReviewId> {
  private _tenantId: string;
  private _outputType: AIOutputType;
  private _outputPayload: unknown;
  private _confidence: ConfidenceScore;
  private _status: ReviewStatus;
  private _slaDeadline: Date;
  private _escalationDepth: number;
  private _lockedBy?: string;
  private _lockedAt?: Date;
  private _lockExpiresAt?: Date;
  private _reviewerId?: string;
  private _reviewDecision?: ReviewDecision;
  private _reviewNotes?: string;
  private _createdAt: Date;
  private _updatedAt: Date;

  private constructor(
    id: ReviewId,
    tenantId: string,
    outputType: AIOutputType,
    outputPayload: unknown,
    confidence: ConfidenceScore,
    status: ReviewStatus,
    slaDeadline: Date,
    escalationDepth: number = 0
  ) {
    super(id);
    this._tenantId = tenantId;
    this._outputType = outputType;
    this._outputPayload = outputPayload;
    this._confidence = confidence;
    this._status = status;
    this._slaDeadline = slaDeadline;
    this._escalationDepth = escalationDepth;
    this._createdAt = new Date();
    this._updatedAt = new Date();
  }

  /**
   * Create a new AIOutputReview for an AI-generated output
   */
  static create(props: CreateReviewProps): AIOutputReview {
    const id = ReviewId.create(props.id);
    const confidence = ConfidenceScore.create(props.confidence);
    const slaHours = props.slaHours ?? REVIEW_SLA_CONFIG.DEFAULT_SLA_HOURS;
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    const review = new AIOutputReview(
      id,
      props.tenantId,
      props.outputType,
      props.outputPayload,
      confidence,
      ReviewStatus.PENDING,
      slaDeadline
    );

    review.addDomainEvent(
      new ReviewRequestedEvent(
        id.toValue(),
        props.tenantId,
        props.outputType,
        props.confidence,
        slaDeadline
      )
    );

    return review;
  }

  /**
   * Reconstruct an AIOutputReview from persistence (no events emitted)
   */
  static reconstitute(
    id: string,
    tenantId: string,
    outputType: AIOutputType,
    outputPayload: unknown,
    confidence: number,
    status: ReviewStatus,
    slaDeadline: Date,
    escalationDepth: number,
    lockedBy?: string,
    lockedAt?: Date,
    lockExpiresAt?: Date,
    reviewerId?: string,
    reviewDecision?: ReviewDecision,
    reviewNotes?: string
  ): AIOutputReview {
    const review = new AIOutputReview(
      ReviewId.create(id),
      tenantId,
      outputType,
      outputPayload,
      ConfidenceScore.create(confidence),
      status,
      slaDeadline,
      escalationDepth
    );

    review._lockedBy = lockedBy;
    review._lockedAt = lockedAt;
    review._lockExpiresAt = lockExpiresAt;
    review._reviewerId = reviewerId;
    review._reviewDecision = reviewDecision;
    review._reviewNotes = reviewNotes;

    return review;
  }

  // Getters
  get tenantId(): string {
    return this._tenantId;
  }

  get outputType(): AIOutputType {
    return this._outputType;
  }

  get outputPayload(): unknown {
    return this._outputPayload;
  }

  get confidence(): ConfidenceScore {
    return this._confidence;
  }

  get status(): ReviewStatus {
    return this._status;
  }

  get slaDeadline(): Date {
    return this._slaDeadline;
  }

  get escalationDepth(): number {
    return this._escalationDepth;
  }

  get lockedBy(): string | undefined {
    return this._lockedBy;
  }

  get lockedAt(): Date | undefined {
    return this._lockedAt;
  }

  get lockExpiresAt(): Date | undefined {
    return this._lockExpiresAt;
  }

  get reviewerId(): string | undefined {
    return this._reviewerId;
  }

  get reviewDecision(): ReviewDecision | undefined {
    return this._reviewDecision;
  }

  get reviewNotes(): string | undefined {
    return this._reviewNotes;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Check if the review lock has expired
   */
  private isLockExpired(): boolean {
    if (!this._lockExpiresAt) return true;
    return new Date() > this._lockExpiresAt;
  }

  /**
   * Check if the review can be transitioned to a target state
   */
  private canTransitionTo(targetStatus: ReviewStatus): boolean {
    return canTransitionTo(this._status, targetStatus);
  }

  /**
   * Claim the review for processing (lock it)
   */
  claim(reviewerId: string): Result<void, string> {
    // Check if already locked by someone else and lock not expired
    if (this._lockedBy && this._lockedBy !== reviewerId && !this.isLockExpired()) {
      return Result.fail('Review is already locked by another reviewer');
    }

    // Allow reclaim in IN_REVIEW if lock expired (same status transition is OK in this case)
    const isExpiredReclaim = this._status === ReviewStatus.IN_REVIEW && this.isLockExpired();

    // Check if can transition to IN_REVIEW (or if it's an expired reclaim)
    if (!isExpiredReclaim && !this.canTransitionTo(ReviewStatus.IN_REVIEW)) {
      return Result.fail(`Cannot claim review in ${this._status} status`);
    }

    const now = new Date();
    this._status = ReviewStatus.IN_REVIEW;
    this._lockedBy = reviewerId;
    this._lockedAt = now;
    this._lockExpiresAt = new Date(
      now.getTime() + REVIEW_SLA_CONFIG.LOCK_DURATION_MINUTES * 60 * 1000
    );
    this._updatedAt = now;

    return Result.ok(undefined);
  }

  /**
   * Release the review lock (return to PENDING)
   */
  release(reviewerId: string): Result<void, string> {
    if (this._lockedBy !== reviewerId) {
      return Result.fail('Cannot release lock - not the lock holder');
    }

    if (!this.canTransitionTo(ReviewStatus.PENDING)) {
      return Result.fail(`Cannot release review in ${this._status} status`);
    }

    this._status = ReviewStatus.PENDING;
    this._lockedBy = undefined;
    this._lockedAt = undefined;
    this._lockExpiresAt = undefined;
    this._updatedAt = new Date();

    return Result.ok(undefined);
  }

  /**
   * Approve the AI output review
   */
  approve(reviewerId: string, notes?: string): Result<void, string> {
    if (!this.canTransitionTo(ReviewStatus.APPROVED)) {
      return Result.fail(`Cannot approve review in ${this._status} status`);
    }

    this._status = ReviewStatus.APPROVED;
    this._reviewerId = reviewerId;
    this._reviewDecision = ReviewDecision.APPROVED;
    this._reviewNotes = notes;
    this._lockedBy = undefined;
    this._lockedAt = undefined;
    this._lockExpiresAt = undefined;
    this._updatedAt = new Date();

    this.addDomainEvent(
      new ReviewApprovedEvent(this.id.toValue(), this._tenantId, reviewerId, notes)
    );

    return Result.ok(undefined);
  }

  /**
   * Reject the AI output review
   */
  reject(reviewerId: string, decision: ReviewDecision, notes: string): Result<void, string> {
    if (!notes || notes.trim() === '') {
      return Result.fail('Rejection notes are required');
    }

    if (!this.canTransitionTo(ReviewStatus.REJECTED)) {
      return Result.fail(`Cannot reject review in ${this._status} status`);
    }

    this._status = ReviewStatus.REJECTED;
    this._reviewerId = reviewerId;
    this._reviewDecision = decision;
    this._reviewNotes = notes;
    this._lockedBy = undefined;
    this._lockedAt = undefined;
    this._lockExpiresAt = undefined;
    this._updatedAt = new Date();

    this.addDomainEvent(
      new ReviewRejectedEvent(this.id.toValue(), this._tenantId, reviewerId, decision, notes)
    );

    return Result.ok(undefined);
  }

  /**
   * Escalate the review to a higher authority
   */
  escalate(reason?: string): Result<void, string> {
    if (this._escalationDepth >= REVIEW_SLA_CONFIG.MAX_ESCALATION_DEPTH) {
      return Result.fail(
        `Maximum escalation depth (${REVIEW_SLA_CONFIG.MAX_ESCALATION_DEPTH}) reached`
      );
    }

    if (this._status !== ReviewStatus.PENDING && this._status !== ReviewStatus.ESCALATED) {
      return Result.fail(`Cannot escalate review in ${this._status} status`);
    }

    this._escalationDepth++;
    this._status = ReviewStatus.ESCALATED;
    this._updatedAt = new Date();

    this.addDomainEvent(
      new ReviewEscalatedEvent(this.id.toValue(), this._tenantId, this._escalationDepth, reason)
    );

    return Result.ok(undefined);
  }

  /**
   * Check if the review can be escalated
   */
  canEscalate(): boolean {
    return (
      this._escalationDepth < REVIEW_SLA_CONFIG.MAX_ESCALATION_DEPTH &&
      (this._status === ReviewStatus.PENDING || this._status === ReviewStatus.ESCALATED)
    );
  }

  /**
   * Mark the review as expired (SLA deadline passed)
   */
  expire(): Result<void, string> {
    if (new Date() <= this._slaDeadline) {
      return Result.fail('Cannot expire review - SLA deadline not yet passed');
    }

    if (!this.canTransitionTo(ReviewStatus.EXPIRED)) {
      return Result.fail(`Cannot expire review in ${this._status} status`);
    }

    this._status = ReviewStatus.EXPIRED;
    this._updatedAt = new Date();

    return Result.ok(undefined);
  }

  /**
   * Check if the SLA deadline has passed
   */
  isSlaBreached(): boolean {
    return new Date() > this._slaDeadline;
  }
}
