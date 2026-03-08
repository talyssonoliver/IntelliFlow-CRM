/**
 * ClaimReviewUseCase (IFC-177)
 *
 * Claims a pending AI output review for assessment.
 * Acquires an exclusive lock with cryptographic token.
 *
 * @module claim-review-use-case
 * @implements IFC-177
 */

import { Result, DomainError, ReviewStatus } from '@intelliflow/domain';
import { IAIOutputReviewRepository } from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';
import { generateLockToken } from './lock-token-utils';

/**
 * Input DTO for claiming a review
 */
export interface ClaimReviewInput {
  /** Review ID to claim */
  reviewId: string;
  /** Tenant ID (from auth context ONLY) */
  tenantId: string;
  /** User ID claiming the review (from auth context) */
  userId: string;
  /** Lock duration in minutes (default: 5) */
  lockDurationMinutes?: number;
}

/**
 * Output DTO for claimed review
 */
export interface ClaimReviewOutput {
  /** Whether claim succeeded */
  success: boolean;
  /** Cryptographic lock token for subsequent operations */
  lockToken: string;
  /** Lock expiration time */
  expiresAt: Date;
}

/**
 * Error: Review not found (also used for tenant isolation)
 */
export class ReviewNotFoundError extends DomainError {
  readonly code = 'REVIEW_NOT_FOUND';
  constructor() {
    super('Review not found');
  }
}

/**
 * Error: Review already claimed by another user
 */
export class ReviewAlreadyClaimedError extends DomainError {
  readonly code = 'REVIEW_ALREADY_CLAIMED';
  constructor() {
    super('Review is already claimed by another reviewer');
  }
}

/**
 * Error: Invalid review state for operation
 */
export class InvalidReviewStateError extends DomainError {
  readonly code = 'INVALID_REVIEW_STATE';
  constructor(currentStatus: string) {
    super(`Cannot perform operation on review in ${currentStatus} status`);
  }
}

/**
 * Error: Concurrent modification detected
 */
export class ConcurrentModificationError extends DomainError {
  readonly code = 'CONCURRENT_MODIFICATION';
  constructor() {
    super('Concurrent modification detected, please retry');
  }
}

/**
 * Claim Review Use Case
 *
 * Allows a reviewer to claim a pending review for assessment.
 * Generates a cryptographic lock token using HMAC-SHA256.
 */
export class ClaimReviewUseCase {
  constructor(
    private readonly repository: IAIOutputReviewRepository,
    private readonly eventBus: EventBusPort,
    private readonly lockTokenSecret: string
  ) {}

  async execute(input: ClaimReviewInput): Promise<Result<ClaimReviewOutput, DomainError>> {
    // 1. Find review with tenant isolation (SELECT FOR UPDATE)
    const review = await this.repository.findByIdForUpdate(input.reviewId, input.tenantId);

    if (!review) {
      return Result.fail(new ReviewNotFoundError());
    }

    // 2. Check if already claimed by another user (with unexpired lock)
    if (review.lockedBy && review.lockedBy !== input.userId) {
      const lockExpired = review.lockExpiresAt && new Date() > review.lockExpiresAt;
      if (!lockExpired) {
        return Result.fail(new ReviewAlreadyClaimedError());
      }
    }

    // 3. Validate review is claimable (PENDING or IN_REVIEW with expired lock)
    const canClaim =
      review.status === ReviewStatus.PENDING ||
      (review.status === ReviewStatus.IN_REVIEW &&
        review.lockExpiresAt &&
        new Date() > review.lockExpiresAt);

    if (!canClaim) {
      return Result.fail(new InvalidReviewStateError(review.status));
    }

    // 4. Generate lock token
    const lockToken = generateLockToken(this.lockTokenSecret);

    // 5. Claim the review
    const claimResult = review.claim(input.userId);
    if (claimResult.isFailure) {
      return Result.fail(new InvalidReviewStateError(review.status));
    }

    // Store lock token internally (for verification on subsequent operations)
    review.lockToken = lockToken;

    // 6. Save with optimistic locking
    const saved = await this.repository.saveWithOptimisticLock(review, review.version);
    if (!saved) {
      return Result.fail(new ConcurrentModificationError());
    }

    // 7. Publish domain events
    const events = review.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        console.error('Failed to publish domain events:', error);
      }
    }
    review.clearDomainEvents();

    // 8. Return output
    return Result.ok({
      success: true,
      lockToken,
      expiresAt: review.lockExpiresAt!,
    });
  }
}
