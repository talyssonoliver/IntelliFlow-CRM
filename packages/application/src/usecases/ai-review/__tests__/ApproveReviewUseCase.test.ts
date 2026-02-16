/**
 * ApproveReviewUseCase Tests (IFC-177)
 *
 * Tests for approving AI output reviews after human assessment.
 * Target: 11 tests covering happy path, error cases, and concurrency.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ApproveReviewUseCase, ApproveReviewInput } from '../ApproveReviewUseCase';
import { AIOutputReview, DomainEvent, ReviewStatus } from '@intelliflow/domain';
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

  // Set up claimed state manually
  const claimResult = review.claim(userId);
  if (claimResult.isFailure) {
    throw new Error('Failed to set up claimed review');
  }

  // Store lock token in review (mock internal state)
  (review as unknown as { _lockToken: string })._lockToken = lockToken;

  return review;
}

// =============================================================================
// Test Suite
// =============================================================================

describe('ApproveReviewUseCase', () => {
  let repository: MockAIOutputReviewRepository;
  let eventBus: MockEventBus;
  let useCase: ApproveReviewUseCase;

  beforeEach(() => {
    repository = new MockAIOutputReviewRepository();
    eventBus = new MockEventBus();
    useCase = new ApproveReviewUseCase(
      repository as unknown as IAIOutputReviewRepository,
      eventBus,
      LOCK_TOKEN_SECRET
    );
  });

  describe('Happy Path', () => {
    it('should approve claimed review with valid lock token', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ApproveReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.success).toBe(true);
    });

    it('should clear lock after approval', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ApproveReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);

      const savedReview = repository.savedReviews[repository.savedReviews.length - 1];
      expect(savedReview.lockedBy).toBeUndefined();
      expect(savedReview.lockExpiresAt).toBeUndefined();
    });

    it('should publish ReviewApprovedEvent', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ApproveReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
        feedback: 'Looks good!',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(eventBus.publishedEvents.length).toBeGreaterThan(0);

      const approvedEvents = eventBus.publishedEvents.filter(
        (e) => e.eventType === 'REVIEW_APPROVED'
      );
      expect(approvedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Error Cases', () => {
    it('should fail when not lock holder', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('other-user', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ApproveReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456', // Different user
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

      const input: ApproveReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken: 'invalid.token',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_LOCK_TOKEN');
    });

    it('should fail when lock expired', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      // Manually expire the lock
      (review as unknown as { _lockExpiresAt: Date })._lockExpiresAt = new Date(Date.now() - 1000);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ApproveReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LOCK_EXPIRED');
    });

    it('should fail when review not in IN_REVIEW status', async () => {
      const review = AIOutputReview.create({
        tenantId: 'tenant-123',
        outputType: 'AUTO_RESPONSE',
        outputPayload: {},
        confidence: 0.8,
      });
      // Still in PENDING status
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ApproveReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken: generateLockToken(),
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_REVIEW_STATE');
    });

    it('should fail when review not found', async () => {
      const input: ApproveReviewInput = {
        reviewId: '00000000-0000-0000-0000-000000000000',
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken: generateLockToken(),
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('REVIEW_NOT_FOUND');
    });

    it('should handle optimistic lock conflict', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);
      repository.shouldFailOptimisticLock = true;

      const input: ApproveReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('CONCURRENT_MODIFICATION');
    });
  });

  describe('Concurrency', () => {
    it('should handle approval race with lock expiry', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      // Lock expires just before approval
      (review as unknown as { _lockExpiresAt: Date })._lockExpiresAt = new Date(Date.now() - 100);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ApproveReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('LOCK_EXPIRED');
    });

    it('should prevent double-approval', async () => {
      const lockToken = generateLockToken();
      const review = createClaimedReview('user-456', lockToken);
      review.clearDomainEvents();
      repository.setReview(review);

      const input: ApproveReviewInput = {
        reviewId: review.id.toValue(),
        tenantId: 'tenant-123',
        userId: 'user-456',
        lockToken,
      };

      // First approval succeeds
      const result1 = await useCase.execute(input);
      expect(result1.isSuccess).toBe(true);

      // Second approval fails (status changed)
      const result2 = await useCase.execute(input);
      expect(result2.isFailure).toBe(true);
    });
  });
});
