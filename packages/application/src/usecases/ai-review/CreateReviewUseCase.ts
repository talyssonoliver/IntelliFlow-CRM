/**
 * CreateReviewUseCase (IFC-177)
 *
 * Creates a new AI output review for human validation.
 * Entry point when AI generates content requiring human review.
 *
 * @module create-review-use-case
 * @implements IFC-177
 */

import {
  Result,
  DomainError,
  AIOutputReview,
  ReviewStatus,
  AI_OUTPUT_TYPES,
  AIOutputType,
} from '@intelliflow/domain';
import { IAIOutputReviewRepository } from '../../ports/repositories';
import { EventBusPort } from '../../ports/external';

/**
 * Input DTO for creating an AI output review
 */
export interface CreateReviewInput {
  /** Tenant ID for multi-tenancy isolation (from auth context) */
  tenantId: string;
  /** Type of AI output being reviewed */
  outputType: AIOutputType;
  /** The AI-generated output payload */
  outputPayload: unknown;
  /** Confidence score from the AI model (0-1) */
  confidence: number;
  /** SLA deadline in hours (default: 24, max: 168) */
  slaHours?: number;
}

/**
 * Output DTO for created review
 */
export interface CreateReviewOutput {
  /** Unique review ID */
  id: string;
  /** Current status */
  status: ReviewStatus;
  /** SLA deadline */
  slaDeadline: Date;
  /** Creation timestamp */
  createdAt: Date;
}

/**
 * Error codes for CreateReviewUseCase
 */
export class InvalidOutputTypeError extends DomainError {
  readonly code = 'INVALID_OUTPUT_TYPE';
  constructor(outputType: string) {
    super(`Invalid output type: ${outputType}`);
  }
}

export class InvalidConfidenceError extends DomainError {
  readonly code = 'INVALID_CONFIDENCE';
  constructor(message: string) {
    super(message);
  }
}

export class ReviewSaveError extends DomainError {
  readonly code = 'REVIEW_SAVE_ERROR';
  constructor() {
    super('Failed to save review');
  }
}

/**
 * Create Review Use Case
 *
 * Orchestrates the creation of a new AI output review.
 * Validates input, creates the aggregate, persists, and publishes events.
 */
export class CreateReviewUseCase {
  constructor(
    private readonly repository: IAIOutputReviewRepository,
    private readonly eventBus: EventBusPort
  ) {}

  async execute(input: CreateReviewInput): Promise<Result<CreateReviewOutput, DomainError>> {
    // 1. Validate output type
    if (!AI_OUTPUT_TYPES.includes(input.outputType)) {
      return Result.fail(new InvalidOutputTypeError(input.outputType));
    }

    // 2. Validate confidence
    if (typeof input.confidence !== 'number' || Number.isNaN(input.confidence)) {
      return Result.fail(new InvalidConfidenceError('Confidence must be a valid number, not NaN'));
    }
    if (input.confidence < 0) {
      return Result.fail(
        new InvalidConfidenceError('Confidence must be a valid confidence score (>= 0)')
      );
    }
    if (input.confidence > 1) {
      return Result.fail(
        new InvalidConfidenceError('Confidence must be a valid confidence score (<= 1)')
      );
    }

    // 3. Create review aggregate via factory
    const review = AIOutputReview.create({
      tenantId: input.tenantId,
      outputType: input.outputType,
      outputPayload: input.outputPayload,
      confidence: input.confidence,
      slaHours: input.slaHours,
    });

    // 4. Persist review
    try {
      await this.repository.save(review);
    } catch {
      return Result.fail(new ReviewSaveError());
    }

    // 5. Publish domain events
    const events = review.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        // Log but don't fail - review was already persisted
        console.error('Failed to publish domain events:', error);
      }
    }

    // 6. Clear events after publishing
    review.clearDomainEvents();

    // 7. Return output DTO
    return Result.ok({
      id: review.id.toValue(),
      status: review.status,
      slaDeadline: review.slaDeadline,
      createdAt: review.createdAt,
    });
  }
}
