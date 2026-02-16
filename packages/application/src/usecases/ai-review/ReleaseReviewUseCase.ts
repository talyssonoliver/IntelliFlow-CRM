/**
 * ReleaseReviewUseCase (IFC-177)
 *
 * Releases a claimed review without making a decision.
 * Returns the review to PENDING status for other reviewers.
 *
 * @module release-review-use-case
 * @implements IFC-177
 */

import { Result, DomainError, ReviewStatus } from '@intelliflow/domain';
import { IAIOutputReviewRepository } from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';
import { ReviewNotFoundError, ConcurrentModificationError } from './ClaimReviewUseCase';
import { verifyLockToken } from './lock-token-utils';

/**
 * Input DTO for releasing a review
 */
export interface ReleaseReviewInput {
  /** Review ID to release */
  reviewId: string;
  /** Tenant ID (from auth context ONLY) */
  tenantId: string;
  /** User ID releasing the review */
  userId: string;
  /** Lock token for verification */
  lockToken: string;
}

/**
 * Output DTO for released review
 */
export interface ReleaseReviewOutput {
  /** Whether release succeeded */
  success: boolean;
}

/**
 * Error: Not the lock holder
 */
export class NotLockHolderError extends DomainError {
  readonly code = 'NOT_LOCK_HOLDER';
  constructor() {
    super('You are not the lock holder for this review');
  }
}

/**
 * Error: Invalid lock token
 */
export class InvalidLockTokenError extends DomainError {
  readonly code = 'INVALID_LOCK_TOKEN';
  constructor() {
    super('Invalid or tampered lock token');
  }
}

/**
 * Error: No active lock on review
 */
export class NoActiveLockError extends DomainError {
  readonly code = 'NO_ACTIVE_LOCK';
  constructor() {
    super('Review does not have an active lock');
  }
}

/**
 * Release Review Use Case
 *
 * Allows a reviewer to release a claimed review without decision.
 * Validates lock holder and token before releasing.
 */
export class ReleaseReviewUseCase {
  constructor(
    private readonly repository: IAIOutputReviewRepository,
    private readonly eventBus: EventBusPort,
    private readonly lockTokenSecret: string
  ) {}

  async execute(input: ReleaseReviewInput): Promise<Result<ReleaseReviewOutput, DomainError>> {
    // 1. Find review with tenant isolation
    const review = await this.repository.findByIdForUpdate(input.reviewId, input.tenantId);

    if (!review) {
      return Result.fail(new ReviewNotFoundError());
    }

    // 2. Verify lock token format
    if (!verifyLockToken(input.lockToken, this.lockTokenSecret)) {
      return Result.fail(new InvalidLockTokenError());
    }

    // 3. Check if review has an active lock
    if (review.status !== ReviewStatus.IN_REVIEW || !review.lockedBy) {
      return Result.fail(new NoActiveLockError());
    }

    // 4. Verify user is the lock holder
    if (review.lockedBy !== input.userId) {
      return Result.fail(new NotLockHolderError());
    }

    // 5. Release the review
    const releaseResult = review.release(input.userId);
    if (releaseResult.isFailure) {
      return Result.fail(new NotLockHolderError());
    }

    // 6. Save
    const saved = await this.repository.saveWithOptimisticLock(review, 0);
    if (!saved) {
      return Result.fail(new ConcurrentModificationError());
    }

    // 7. Publish events
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
