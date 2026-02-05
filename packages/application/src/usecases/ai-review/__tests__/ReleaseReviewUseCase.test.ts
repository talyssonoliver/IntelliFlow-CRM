/**
 * ReleaseReviewUseCase Tests (IFC-177)
 *
 * Tests for releasing claimed reviews without making a decision.
 * Target: 7 tests covering happy path, error cases, and concurrency.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReleaseReviewUseCase, ReleaseReviewInput } from '../ReleaseReviewUseCase';
import {
  AIOutputReview,
  DomainEvent,
  ReviewStatus,
} from '@intelliflow/domain';
import { IAIOutputReviewRepository } from '../../../ports/repositories';
import { EventBusPort } from '../../../ports/external';
import crypto from 'crypto';

// =============================================================================
// Mock Implementations
// =============================================================================

class MockAIOutputReviewRepository implements Partial<IAIOutputReviewRepository> {
  private reviews: Map<string, AIOutputReview> = new Map();
  public savedReviews: AIOutputReview[] = [];
  public shouldFailOptimisticLock = false;

  setReview(review: AIOutputReview): void {
    this.reviews.set(review.id.toValue(), review);
  }

  async findById(id: string, tenantId: string): Promise<AIOutputReview | null> {
    const review = this.reviews.get(id);
    if (!review || review.tenantId !== tenantId) {
      return null;
    }
    return review;
  }

  async findByIdForUpdate(id: string, tenantId: string): Promise<AIOutputReview | null> {
    return this.findById(id, tenantId);
  }

  async save(review: AIOutputReview): Promise<void> {
    this.savedReviews.push(review);
    this.reviews.set(review.id.toValue(), review);
  }

  async saveWithOptimisticLock(review: AIOutputReview): Promise<boolean> {
    if (this.shouldFailOptimisticLock) {
      return false;
    }
    await this.save(review);
    return true;
  }

  async findPending(): Promise<AIOutputReview[]> {
    return [];
  }

  async countPending(): Promise<number> {
    return 0;
  }

  async findWithExpiredLocks(): Promise<AIOutputReview[]> {
    return [];
  }
}

class MockEventBus implements EventBusPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.publishedEvents.push(event);
  }

  async publishAll(events: readonly DomainEvent[]): Promise<void> {
    this.publishedEvents.push(...events);
  }

  async subscribe(): Promise<void> {
    // No-op
  }
}

// =============================================================================
// Helpers
// =============================================================================

const LOCK_TOKEN_SECRET = 'test-secret-key-for-hmac-signing-12345';

function generateLockToken(): string {
  const value = crypto.randomBytes(32).toString('hex');
  const signature = crypto.createHmac('sha256', LOCK_TOKEN_SECRET)
    .update(value)
    .digest('hex');
  return `${value}.${signature}`;
}

function createClaimedReview(
  userId: string,
  lockToken: string,
  tenantId: string = 'tenant-123'
): AIOutputReview {
  const review = AIOutputReview.create({
    tenantId,
    outputType: 'AUTO_RESPONSE',
    outputPayload: { message: 'Test' },
    confidence: 0.8,
  });

  review.claim(userId);
  (review as unknown as { _lockToken: string })._lockToken = lockToken;

  return review;
}

// =============================================================================
// Test Suite
// =============================================================================

describe('ReleaseReviewUseCase', () => {
  let repository: MockAIOutputReviewRepository;
  let eventBus: MockEventBus;
  let useCase: ReleaseReviewUseCase;

  beforeEach(() => {
    repository = new MockAIOutputReviewRepository();
    eventBus = new MockEventBus();
    useCase = new ReleaseReviewUseCase(
      repository as unknown as IAIOutputReviewRepository,
      eventBus,
      LOCK_TOKEN_SECRET
    );
  });

  describe('Happy Path', () => {
    it('should release claimed review', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ReleaseReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.success).toBe(true);
    });

    it('should return status to PENDING', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ReleaseReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);

      const savedReview = repository.savedReviews[repository.savedReviews.length - 1];
      expect(savedReview.status).toBe(ReviewStatus.PENDING);
      expect(savedReview.lockedBy).toBeUndefined();
    });
  });

  describe('Error Cases', () => {
    it('should fail when not lock holder', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('other-user', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ReleaseReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('NOT_LOCK_HOLDER');
    });

    it('should fail with invalid lock token', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ReleaseReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken: 'fake.token',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_LOCK_TOKEN');
    });

    it('should fail when no active lock', async () => {
      const review = AIOutputReview.create({
        tenantId: 'tenant-123',
        outputType: 'AUTO_RESPONSE',
        outputPayload: {},
        confidence: 0.8,
      });
      // PENDING status, no lock
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ReleaseReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken: generateLockToken(),
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('NO_ACTIVE_LOCK');
    });

    it('should fail when review not found', async () => {
      const input: ReleaseReviewInput = {
        reviewId: '00000000-0000-0000-0000-000000000000',
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken: generateLockToken(),
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('REVIEW_NOT_FOUND');
    });
  });

  describe('Concurrency', () => {
    it('should handle release race with expiry', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      // Lock expired
      (review as unknown as { _lockExpiresAt: Date })._lockExpiresAt = new Date(Date.now() - 1000);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ReleaseReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
      };

      const result = await useCase.execute(input);

      // Should still succeed for the original lock holder
      // even if lock expired (graceful release)
      expect(result.isSuccess).toBe(true);
    });
  });
});
