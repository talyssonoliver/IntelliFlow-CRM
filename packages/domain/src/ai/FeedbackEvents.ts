/**
 * Feedback Domain Events - IFC-024: Human-in-the-Loop Feedback
 *
 * Domain events for AI score feedback and model improvement signals.
 *
 * @module @intelliflow/domain/ai/FeedbackEvents
 */

import { DomainEvent } from '../shared/DomainEvent';
import type { FeedbackType, FeedbackCategory } from './AIConstants';

/**
 * Event: User submitted feedback on AI score
 */
export class ScoreFeedbackSubmittedEvent extends DomainEvent {
  readonly eventType = 'ai.score_feedback.submitted';

  constructor(
    public readonly feedbackId: string,
    public readonly leadId: string,
    public readonly feedbackType: FeedbackType,
    public readonly originalScore: number,
    public readonly correctedScore: number | null,
    public readonly correctionMagnitude: number | null,
    public readonly correctionCategory: FeedbackCategory | null,
    public readonly modelVersion: string,
    public readonly userId: string,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      feedbackId: this.feedbackId,
      leadId: this.leadId,
      feedbackType: this.feedbackType,
      originalScore: this.originalScore,
      correctedScore: this.correctedScore,
      correctionMagnitude: this.correctionMagnitude,
      correctionCategory: this.correctionCategory,
      modelVersion: this.modelVersion,
      userId: this.userId,
      tenantId: this.tenantId,
    };
  }
}

/**
 * Event: Model retraining is recommended based on feedback patterns
 */
export class RetrainingRecommendedEvent extends DomainEvent {
  readonly eventType = 'ai.model.retraining_recommended';

  constructor(
    public readonly modelVersion: string,
    public readonly reason: string,
    public readonly feedbackCount: number,
    public readonly negativeRatio: number,
    public readonly avgCorrectionMagnitude: number,
    public readonly recommendedAt: Date = new Date()
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      modelVersion: this.modelVersion,
      reason: this.reason,
      feedbackCount: this.feedbackCount,
      negativeRatio: this.negativeRatio,
      avgCorrectionMagnitude: this.avgCorrectionMagnitude,
      recommendedAt: this.recommendedAt.toISOString(),
    };
  }
}

/**
 * Event: Training data was exported from feedback corrections
 */
export class TrainingDataExportedEvent extends DomainEvent {
  readonly eventType = 'ai.training_data.exported';

  constructor(
    public readonly modelVersion: string,
    public readonly recordCount: number,
    public readonly dateFrom: Date,
    public readonly dateTo: Date,
    public readonly exportedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      modelVersion: this.modelVersion,
      recordCount: this.recordCount,
      dateFrom: this.dateFrom.toISOString(),
      dateTo: this.dateTo.toISOString(),
      exportedBy: this.exportedBy,
    };
  }
}

/**
 * Event: Feedback analytics were generated
 */
export class FeedbackAnalyticsGeneratedEvent extends DomainEvent {
  readonly eventType = 'ai.feedback_analytics.generated';

  constructor(
    public readonly periodStart: Date,
    public readonly periodEnd: Date,
    public readonly totalFeedback: number,
    public readonly positiveRatio: number,
    public readonly avgCorrectionMagnitude: number,
    public readonly retrainingRecommended: boolean
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      periodStart: this.periodStart.toISOString(),
      periodEnd: this.periodEnd.toISOString(),
      totalFeedback: this.totalFeedback,
      positiveRatio: this.positiveRatio,
      avgCorrectionMagnitude: this.avgCorrectionMagnitude,
      retrainingRecommended: this.retrainingRecommended,
    };
  }
}
