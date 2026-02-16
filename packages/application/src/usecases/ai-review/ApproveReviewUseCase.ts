/**
 * ApproveReviewUseCase (IFC-177)
 *
 * Approves an AI-generated output after human review.
 * Clears the lock and transitions to APPROVED status.
 *
 * @module approve-review-use-case
 * @implements IFC-177
 */

import { Result, DomainError, ReviewStatus } from '@intelliflow/domain';
import { IAIOutputReviewRepository } from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';
import {
  ReviewNotFoundError,
  InvalidReviewStateError,
  ConcurrentModificationError,
} from './ClaimReviewUseCase';
import { NotLockHolderError, InvalidLockTokenError } from './ReleaseReviewUseCase';
import { verifyLockToken } from './lock-token-utils';

/**
 * Input DTO for approving a review
 */
export interface ApproveReviewInput {
  /** Review ID to approve */
  reviewId: string;
  /** Tenant ID (from auth context ONLY) */
  tenantId: string;
  /** User ID approving the review */
  userId: string;
  /** Lock token for verification */
  lockToken: string;
  /** Optional approval feedback */
  feedback?: string;
}

/**
 * Output DTO for approved review
 */
export interface ApproveReviewOutput {
  /** Whether approval succeeded */
  success: boolean;
}

/**
 * Error: Lock has expired
 */
export class LockExpiredError extends DomainError {
  readonly code = 'LOCK_EXPIRED';
  constructor() {
    super('Lock has expired, please re-claim the review');
  }
}

/**
 * Approve Review Use Case
 *
 * Validates lock holder, token, and expiry before approving.
 * Uses timing-safe comparison for token verification.
 */
export class ApproveReviewUseCase {
  constructor(
    private readonly repository: IAIOutputReviewRepository,
    private readonly eventBus: EventBusPort,
    private readonly lockTokenSecret: string
  ) {}

  async execute(input: ApproveReviewInput): Promise<Result<ApproveReviewOutput, DomainError>> {
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

    // 6. Approve the review
    const approveResult = review.approve(input.userId, input.feedback);
    if (approveResult.isFailure) {
      return Result.fail(new InvalidReviewStateError(review.status));
    }

    // 7. Save with optimistic locking
    const saved = await this.repository.saveWithOptimisticLock(review, 0);
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
