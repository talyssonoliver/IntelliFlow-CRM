/**
 * RejectReviewUseCase Tests (IFC-177)
 *
 * Tests for rejecting AI output reviews with feedback.
 * Target: 10 tests covering happy path, error cases, and concurrency.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RejectReviewUseCase, RejectReviewInput } from '../RejectReviewUseCase';
import { AIOutputReview, DomainEvent, ReviewDecision } from '@intelliflow/domain';
import { IAIOutputReviewRepository } from '../../../ports/repositories';
import { EventBusPort } from '../../../ports/external';
import crypto from 'node:crypto';

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

const LOCK_TOKEN_SECRET = 'test-secret-key-for-hmac-signing-12345';

function generateLockToken(): string {
  const value = crypto.randomBytes(32).toString('hex');
  const signature = crypto.createHmac('sha256', LOCK_TOKEN_SECRET).update(value).digest('hex');
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
  review.lockToken = lockToken;

  return review;
}

// =============================================================================
// Test Suite
// =============================================================================

describe('RejectReviewUseCase', () => {
  let repository: MockAIOutputReviewRepository;
  let eventBus: MockEventBus;
  let useCase: RejectReviewUseCase;

  beforeEach(() => {
    repository = new MockAIOutputReviewRepository();
    eventBus = new MockEventBus();
    useCase = new RejectReviewUseCase(repository, eventBus, LOCK_TOKEN_SECRET);
  });

  describe('Happy Path', () => {
    it('should reject review with notes', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: RejectReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
        notes: 'The response is inappropriate for the context.',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.success).toBe(true);
    });

    it('should store rejection feedback', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const rejectionNotes = 'Grammar errors in the response.';
      const input: RejectReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
        notes: rejectionNotes,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);

      const savedReview = repository.savedReviews[repository.savedReviews.length - 1];
      expect(savedReview.reviewNotes).toBe(rejectionNotes);
    });

    it('should publish ReviewRejectedEvent', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: RejectReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
        notes: 'Off-brand messaging.',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(eventBus.publishedEvents.length).toBeGreaterThan(0);

      const rejectedEvents = eventBus.publishedEvents.filter(
        (e) => e.eventType === 'REVIEW_REJECTED'
      );
      expect(rejectedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Error Cases', () => {
    it('should fail when notes not provided', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: RejectReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
        notes: '', // Empty notes
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('notes');
    });

    it('should fail when not lock holder', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('other-user', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: RejectReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
        notes: 'Bad content',
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

      const input: RejectReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken: 'tampered.signature',
        notes: 'Bad content',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_LOCK_TOKEN');
    });

    it('should fail when lock expired', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      (review as any)._lockExpiresAt = new Date(Date.now() - 1000);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: RejectReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
        notes: 'Bad content',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LOCK_EXPIRED');
    });

    it('should fail when review not found', async () => {
      const input: RejectReviewInput = {
        reviewId: '00000000-0000-0000-0000-000000000000',
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken: generateLockToken(),
        notes: 'Bad content',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('REVIEW_NOT_FOUND');
    });
  });

  describe('Concurrency', () => {
    it('should handle rejection race', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: RejectReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
        notes: 'Rejected',
      };

      // First rejection succeeds
      const result1 = await useCase.execute(input);
      expect(result1.isSuccess).toBe(true);

      // Second rejection fails (status changed)
      const result2 = await useCase.execute(input);
      expect(result2.isFailure).toBe(true);
    });

    it('should handle optimistic lock conflict', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);
      repository.shouldFailOptimisticLock = true;

      const input: RejectReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
        notes: 'Rejected',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('CONCURRENT_MODIFICATION');
    });
  });
});
