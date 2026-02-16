/**
 * CreateReviewUseCase Tests (IFC-177)
 *
 * Tests for creating new AI output reviews for human validation.
 * Target: 8 tests covering happy path, validation, and error handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CreateReviewUseCase, CreateReviewInput } from '../CreateReviewUseCase';
import { AIOutputReview, DomainEvent, ReviewStatus } from '@intelliflow/domain';
import { IAIOutputReviewRepository } from '../../../ports/repositories';
import { EventBusPort } from '../../../ports/external';

// =============================================================================
// Mock Implementations
// =============================================================================

class MockAIOutputReviewRepository implements Partial<IAIOutputReviewRepository> {
  public savedReviews: AIOutputReview[] = [];
  public shouldFailOnSave = false;
  public saveError: Error | null = null;

  async save(review: AIOutputReview): Promise<void> {
    if (this.shouldFailOnSave) {
      throw this.saveError ?? new Error('Repository save failed');
    }
    this.savedReviews.push(review);
  }

  async findById(): Promise<AIOutputReview | null> {
    return null;
  }

  async findByIdForUpdate(): Promise<AIOutputReview | null> {
    return null;
  }

  async saveWithOptimisticLock(): Promise<boolean> {
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
    // No-op for tests
  }
}

// =============================================================================
// Test Suite
// =============================================================================

describe('CreateReviewUseCase', () => {
  let repository: MockAIOutputReviewRepository;
  let eventBus: MockEventBus;
  let useCase: CreateReviewUseCase;

  beforeEach(() => {
    repository = new MockAIOutputReviewRepository();
    eventBus = new MockEventBus();
    useCase = new CreateReviewUseCase(repository as unknown as IAIOutputReviewRepository, eventBus);
  });

  describe('Happy Path', () => {
    it('should create review with valid input', async () => {
      const input: CreateReviewInput = {
        tenantId: 'tenant-123',
        outputType: 'AUTO_RESPONSE',
        outputPayload: { message: 'Hello, how can I help?' },
        confidence: 0.85,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.id).toBeDefined();
      expect(result.value.status).toBe(ReviewStatus.PENDING);
      expect(repository.savedReviews.length).toBe(1);
    });

    it('should calculate SLA deadline correctly with default 24h', async () => {
      const beforeCreate = new Date();

      const input: CreateReviewInput = {
        tenantId: 'tenant-123',
        outputType: 'LEAD_SCORING',
        outputPayload: { score: 85 },
        confidence: 0.92,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);

      const afterCreate = new Date();
      const expectedMinDeadline = new Date(beforeCreate.getTime() + 24 * 60 * 60 * 1000);
      const expectedMaxDeadline = new Date(afterCreate.getTime() + 24 * 60 * 60 * 1000);

      expect(result.value.slaDeadline.getTime()).toBeGreaterThanOrEqual(
        expectedMinDeadline.getTime() - 1000
      );
      expect(result.value.slaDeadline.getTime()).toBeLessThanOrEqual(
        expectedMaxDeadline.getTime() + 1000
      );
    });

    it('should publish ReviewCreatedEvent', async () => {
      const input: CreateReviewInput = {
        tenantId: 'tenant-123',
        outputType: 'EMAIL_GENERATION',
        outputPayload: { subject: 'Test', body: 'Content' },
        confidence: 0.78,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(eventBus.publishedEvents.length).toBeGreaterThan(0);

      // The event should be a ReviewRequestedEvent (domain name for creation)
      const createdEvents = eventBus.publishedEvents.filter(
        (e) => e.eventType === 'REVIEW_REQUESTED'
      );
      expect(createdEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Validation Errors', () => {
    it('should fail with invalid output type', async () => {
      const input = {
        tenantId: 'tenant-123',
        outputType: 'INVALID_TYPE' as 'AUTO_RESPONSE',
        outputPayload: {},
        confidence: 0.5,
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('output');
    });

    it('should fail with confidence below 0', async () => {
      const input: CreateReviewInput = {
        tenantId: 'tenant-123',
        outputType: 'AUTO_RESPONSE',
        outputPayload: {},
        confidence: -0.1,
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('confidence');
    });

    it('should fail with confidence above 1', async () => {
      const input: CreateReviewInput = {
        tenantId: 'tenant-123',
        outputType: 'AUTO_RESPONSE',
        outputPayload: {},
        confidence: 1.5,
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('confidence');
    });

    it('should fail with NaN confidence', async () => {
      const input: CreateReviewInput = {
        tenantId: 'tenant-123',
        outputType: 'AUTO_RESPONSE',
        outputPayload: {},
        confidence: NaN,
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message.toLowerCase()).toContain('confidence');
    });
  });

  describe('Repository Errors', () => {
    it('should handle repository save error', async () => {
      repository.shouldFailOnSave = true;
      repository.saveError = new Error('Database connection failed');

      const input: CreateReviewInput = {
        tenantId: 'tenant-123',
        outputType: 'AUTO_RESPONSE',
        outputPayload: {},
        confidence: 0.5,
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('save');
    });
  });
});
