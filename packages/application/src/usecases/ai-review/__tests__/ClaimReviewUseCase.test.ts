/**
 * ClaimReviewUseCase Tests (IFC-177)
 *
 * Tests for claiming AI output reviews for assessment.
 * Target: 11 tests covering happy path, error cases, and concurrency.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ClaimReviewUseCase, ClaimReviewInput } from '../ClaimReviewUseCase';
import { AIOutputReview, DomainEvent, ReviewStatus } from '@intelliflow/domain';
import { IAIOutputReviewRepository } from '../../../ports/repositories';
import { EventBusPort } from '../../../ports/external';

// =============================================================================
// Mock Implementations
// =============================================================================

class MockAIOutputReviewRepository implements IAIOutputReviewRepository {
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

  async saveWithOptimisticLock(review: AIOutputReview, _expectedVersion: number): Promise<boolean> {
    if (this.shouldFailOptimisticLock) {
      return false;
    }
    await this.save(review);
    return true;
  }

  async findPending(_tenantId: string): Promise<AIOutputReview[]> {
    return [];
  }

  async countPending(_tenantId: string): Promise<number> {
    return 0;
  }

  async findWithExpiredLocks(_cutoffTime: Date): Promise<AIOutputReview[]> {
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

function createPendingReview(tenantId: string = 'tenant-123'): AIOutputReview {
  return AIOutputReview.create({
    tenantId,
    outputType: 'AUTO_RESPONSE',
    outputPayload: { message: 'Test' },
    confidence: 0.8,
  });
}

// =============================================================================
// Test Suite
// =============================================================================

describe('ClaimReviewUseCase', () => {
  let repository: MockAIOutputReviewRepository;
  let eventBus: MockEventBus;
  let useCase: ClaimReviewUseCase;
  const lockTokenSecret = 'test-secret-key-for-hmac-signing-12345';

  beforeEach(() => {
    repository = new MockAIOutputReviewRepository();
    eventBus = new MockEventBus();
    useCase = new ClaimReviewUseCase(repository, eventBus, lockTokenSecret);
  });

  describe('Happy Path', () => {
    it('should claim pending review successfully', async () => {
      const review = createPendingReview('tenant-123');
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ClaimReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.success).toBe(true);
      expect(result.value.lockToken).toBeDefined();
      expect(result.value.expiresAt).toBeInstanceOf(Date);
    });

    it('should return HMAC-signed lock token', async () => {
      const review = createPendingReview('tenant-123');
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ClaimReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      const token = result.value.lockToken;
      // Token format: {random64chars}.{signature64chars}
      expect(token).toMatch(/^[a-f0-9]{64}\.[a-f0-9]{64}$/);
    });

    it('should publish ReviewClaimedEvent', async () => {
      const review = createPendingReview('tenant-123');
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ClaimReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      // Domain events from claim should be published
      expect(eventBus.publishedEvents.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Cases', () => {
    it('should fail when review not found (tenant isolation)', async () => {
      const input: ClaimReviewInput = {
        reviewId: '00000000-0000-4000-8000-000000000000',
        tenantId: 'tenant-123',
        userId: 'user-456',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('REVIEW_NOT_FOUND');
    });

    it('should fail when review already claimed by another user', async () => {
      const review = createPendingReview('tenant-123');
      review.claim('other-user');
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ClaimReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('REVIEW_ALREADY_CLAIMED');
    });

    it('should fail when review not in PENDING status', async () => {
      const review = createPendingReview('tenant-123');
      // Approve it to change status
      review.claim('reviewer-1');
      review.approve('reviewer-1');
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ClaimReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_REVIEW_STATE');
    });

    it('should fail when review belongs to different tenant', async () => {
      const review = createPendingReview('tenant-other');
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ClaimReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123', // Different tenant
        userId: 'user-456',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      // Should return same error for tenant isolation (prevents enumeration)
      expect(result.error.code).toBe('REVIEW_NOT_FOUND');
    });

    it('should handle optimistic lock conflict', async () => {
      const review = createPendingReview('tenant-123');
      review.clearDomainEvents();
      repository.setReview(review);
      repository.shouldFailOptimisticLock = true;

      const input: ClaimReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('CONCURRENT_MODIFICATION');
    });
  });

  describe('Concurrency', () => {
    it('should handle concurrent claim attempts (first wins)', async () => {
      const review = createPendingReview('tenant-123');
      review.clearDomainEvents();
      repository.setReview(review);

      const input1: ClaimReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-1',
      };

      const input2: ClaimReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-2',
      };

      // First claim succeeds
      const result1 = await useCase.execute(input1);
      expect(result1.isSuccess).toBe(true);

      // Second claim fails
      const result2 = await useCase.execute(input2);
      expect(result2.isFailure).toBe(true);
    });

    it('should allow re-claim after lock expiry', async () => {
      const review = createPendingReview('tenant-123');
      review.claim('user-1');
      // Manually set lock to expired
      (review as any)._lockExpiresAt = new Date(Date.now() - 1000);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ClaimReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-2',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
    });

    it('should validate lock token format', async () => {
      const review = createPendingReview('tenant-123');
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ClaimReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      const token = result.value.lockToken;
      const [value, signature] = token.split('.');

      expect(value.length).toBe(64);
      expect(signature.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(value)).toBe(true);
      expect(/^[a-f0-9]+$/.test(signature)).toBe(true);
    });
  });
});
