/**
 * RejectReviewUseCase (IFC-177)
 *
 * Rejects an AI-generated output with required feedback.
 * Notes are mandatory for rejection decisions.
 *
 * @module reject-review-use-case
 * @implements IFC-177
 */

import { Result, DomainError, ReviewStatus, ReviewDecision } from '@intelliflow/domain';
import { IAIOutputReviewRepository } from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';
import {
  ReviewNotFoundError,
  InvalidReviewStateError,
  ConcurrentModificationError,
} from './ClaimReviewUseCase';
import { NotLockHolderError, InvalidLockTokenError } from './ReleaseReviewUseCase';
import { LockExpiredError } from './ApproveReviewUseCase';
import { verifyLockToken } from './lock-token-utils';

/**
 * Input DTO for rejecting a review
 */
export interface RejectReviewInput {
  /** Review ID to reject */
  reviewId: string;
  /** Tenant ID (from auth context ONLY) */
  tenantId: string;
  /** User ID rejecting the review */
  userId: string;
  /** Lock token for verification */
  lockToken: string;
  /** Rejection notes (REQUIRED) */
  notes: string;
}

/**
 * Output DTO for rejected review
 */
export interface RejectReviewOutput {
  /** Whether rejection succeeded */
  success: boolean;
}

/**
 * Error: Notes required for rejection
 */
export class RejectionNotesRequiredError extends DomainError {
  readonly code = 'REJECTION_NOTES_REQUIRED';
  constructor() {
    super('Rejection notes are required');
  }
}

/**
 * Reject Review Use Case
 *
 * Validates lock holder, token, expiry, and notes before rejecting.
 * Uses timing-safe comparison for token verification.
 */
export class RejectReviewUseCase {
  constructor(
    private readonly repository: IAIOutputReviewRepository,
    private readonly eventBus: EventBusPort,
    private readonly lockTokenSecret: string
  ) {}

  async execute(input: RejectReviewInput): Promise<Result<RejectReviewOutput, DomainError>> {
    // 0. Validate notes are provided
    if (!input.notes || input.notes.trim() === '') {
      return Result.fail(new RejectionNotesRequiredError());
    }

    // 1. Find review with tenant isolation
    const review = await this.repository.findByIdForUpdate(input.reviewId, input.tenantId);

    if (!review) {
      return Result.fail(new ReviewNotFoundError());
    }

    // 2. Verify lock token format
    if (!verifyLockToken(input.lockToken, this.lockTokenSecret)) {
      return Result.fail(new InvalidLockTokenError());
    }

    // 3. Verify review is in IN_REVIEW status
    if (review.status !== ReviewStatus.IN_REVIEW) {
      return Result.fail(new InvalidReviewStateError(review.status));
    }

    // 4. Check if lock has expired
    if (review.lockExpiresAt && new Date() > review.lockExpiresAt) {
      return Result.fail(new LockExpiredError());
    }

    // 5. Verify user is the lock holder
    if (review.lockedBy !== input.userId) {
      return Result.fail(new NotLockHolderError());
    }

    // 6. Reject the review
    const rejectResult = review.reject(input.userId, ReviewDecision.REJECTED_QUALITY, input.notes);
    if (rejectResult.isFailure) {
      return Result.fail(new InvalidReviewStateError(review.status));
    }

    // 7. Save with optimistic locking
    const saved = await this.repository.saveWithOptimisticLock(review, review.version);
    if (!saved) {
      return Result.fail(new ConcurrentModificationError());
    }

    // 8. Publish events
    const events = review.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        console.error('Failed to publish domain events:', error);
      }
    }
    review.clearDomainEvents();

    return Result.ok({ success: true });
  }
}
