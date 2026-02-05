/**
 * EscalateReviewUseCase (IFC-177)
 *
 * Escalates a review to higher authority or specialist.
 * Increments escalation depth and releases the lock.
 *
 * @module escalate-review-use-case
 * @implements IFC-177
 */

import { Result, DomainError, ReviewStatus, REVIEW_SLA_CONFIG } from '@intelliflow/domain';
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
 * Input DTO for escalating a review
 */
export interface EscalateReviewInput {
  /** Review ID to escalate */
  reviewId: string;
  /** Tenant ID (from auth context ONLY) */
  tenantId: string;
  /** User ID escalating the review */
  userId: string;
  /** Lock token for verification */
  lockToken: string;
  /** Escalation reason */
  reason: string;
  /** Optional target user for escalation */
  targetUserId?: string;
}

/**
 * Output DTO for escalated review
 */
export interface EscalateReviewOutput {
  /** Whether escalation succeeded */
  success: boolean;
  /** New escalation depth */
  escalationDepth: number;
}

/**
 * Error: Maximum escalation depth reached
 */
export class MaxEscalationReachedError extends DomainError {
  readonly code = 'MAX_ESCALATION_REACHED';
  constructor(maxDepth: number) {
    super(`Maximum escalation depth (${maxDepth}) reached`);
  }
}

/**
 * Escalate Review Use Case
 *
 * Validates lock holder and escalation limits before escalating.
 * Releases the lock so new reviewer can claim.
 */
export class EscalateReviewUseCase {
  constructor(
    private readonly repository: IAIOutputReviewRepository,
    private readonly eventBus: EventBusPort,
    private readonly lockTokenSecret: string
  ) {}

  async execute(
    input: EscalateReviewInput
  ): Promise<Result<EscalateReviewOutput, DomainError>> {
    // 1. Find review with tenant isolation
    const review = await this.repository.findByIdForUpdate(
      input.reviewId,
      input.tenantId
    );

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

    // 4. Verify user is the lock holder
    if (review.lockedBy !== input.userId) {
      return Result.fail(new NotLockHolderError());
    }

    // 5. Check escalation limit
    if (review.escalationDepth >= REVIEW_SLA_CONFIG.MAX_ESCALATION_DEPTH) {
      return Result.fail(new MaxEscalationReachedError(REVIEW_SLA_CONFIG.MAX_ESCALATION_DEPTH));
    }

    // 6. Release the lock first (domain escalate only works from PENDING or ESCALATED)
    const releaseResult = review.release(input.userId);
    if (releaseResult.isFailure) {
      return Result.fail(new InvalidReviewStateError(review.status));
    }

    // 7. Escalate the review
    const escalateResult = review.escalate(input.reason);
    if (escalateResult.isFailure) {
      return Result.fail(new InvalidReviewStateError(review.status));
    }

    // 8. Save with optimistic locking
    const saved = await this.repository.saveWithOptimisticLock(review, 0);
    if (!saved) {
      return Result.fail(new ConcurrentModificationError());
    }

    // 9. Publish events
    const events = review.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        console.error('Failed to publish domain events:', error);
      }
    }
    review.clearDomainEvents();

    return Result.ok({
      success: true,
      escalationDepth: review.escalationDepth,
    });
  }
}
