/**
 * Feedback Service - IFC-024: Human-in-the-Loop Feedback
 *
 * Orchestrates feedback collection, analytics aggregation,
 * and model improvement recommendations.
 *
 * @module @intelliflow/application/services/FeedbackService
 */

import {
  RETRAINING_THRESHOLDS,
  CORRECTION_MAGNITUDE_BUCKETS,
  ScoreFeedbackSubmittedEvent,
  RetrainingRecommendedEvent,
  TrainingDataExportedEvent,
  FeedbackAnalyticsGeneratedEvent,
} from '@intelliflow/domain';
import type {
  FeedbackType,
  FeedbackCategory,
} from '@intelliflow/domain';
import type {
  SubmitSimpleFeedbackInput,
  SubmitScoreCorrectionInput,
  FeedbackAnalytics,
  FeedbackRecord,
  CorrectionDistribution,
  ModelVersionStats,
  TrendDataPoint,
  TrainingDataExport,
  RetrainingCheck,
  FeedbackAnalyticsQuery,
} from '@intelliflow/validators';
import { getCorrectionBucket, calculateCorrectionMagnitude } from '@intelliflow/validators';
import { EventBusPort } from '../ports/external';

/**
 * Feedback repository port (to be implemented in adapters layer)
 */
export interface FeedbackRepositoryPort {
  create(data: {
    feedbackType: FeedbackType;
    originalScore: number;
    originalConfidence: number;
    modelVersion: string;
    correctedScore: number | null;
    correctionMagnitude: number | null;
    reason: string | null;
    correctionCategory: FeedbackCategory | null;
    leadId: string;
    aiScoreId: string | null;
    userId: string;
    tenantId: string;
  }): Promise<FeedbackRecord>;

  findById(id: string): Promise<FeedbackRecord | null>;
  findByLeadId(leadId: string): Promise<FeedbackRecord[]>;
  findByModelVersion(modelVersion: string, dateFrom?: Date, dateTo?: Date): Promise<FeedbackRecord[]>;
  findByTenantId(tenantId: string, dateFrom?: Date, dateTo?: Date): Promise<FeedbackRecord[]>;
  findAll(params: { dateFrom?: Date; dateTo?: Date; modelVersion?: string; tenantId?: string }): Promise<FeedbackRecord[]>;
  countByType(feedbackType: FeedbackType, modelVersion?: string, dateFrom?: Date, dateTo?: Date): Promise<number>;
}

/**
 * Lead repository port for training data export
 */
export interface LeadDataPort {
  getLeadData(leadId: string): Promise<{
    email: string;
    company: string | null;
    title: string | null;
    source: string;
    [key: string]: unknown;
  } | null>;
}

/**
 * Feedback Service
 *
 * Manages human-in-the-loop feedback for AI-generated scores:
 * - Collects thumbs up/down and score corrections
 * - Aggregates feedback analytics
 * - Recommends model retraining based on feedback patterns
 * - Exports training data from corrections
 */
export class FeedbackService {
  constructor(
    private readonly feedbackRepository: FeedbackRepositoryPort,
    private readonly leadDataPort: LeadDataPort,
    private readonly eventBus: EventBusPort
  ) {}

  /**
   * Submit simple feedback (thumbs up/down)
   */
  async submitSimpleFeedback(
    input: SubmitSimpleFeedbackInput,
    userId: string,
    tenantId: string
  ): Promise<FeedbackRecord> {
    const feedback = await this.feedbackRepository.create({
      feedbackType: input.feedbackType as FeedbackType,
      originalScore: input.originalScore,
      originalConfidence: input.originalConfidence,
      modelVersion: input.modelVersion,
      correctedScore: null,
      correctionMagnitude: null,
      reason: null,
      correctionCategory: null,
      leadId: input.leadId,
      aiScoreId: input.aiScoreId ?? null,
      userId,
      tenantId,
    });

    // Publish domain event
    await this.eventBus.publish(
      new ScoreFeedbackSubmittedEvent(
        feedback.id,
        feedback.leadId,
        feedback.feedbackType as FeedbackType,
        feedback.originalScore,
        null,
        null,
        null,
        feedback.modelVersion,
        userId,
        tenantId
      )
    );

    return feedback;
  }

  /**
   * Submit score correction with reason
   */
  async submitScoreCorrection(
    input: SubmitScoreCorrectionInput,
    userId: string,
    tenantId: string
  ): Promise<FeedbackRecord> {
    const correctionMagnitude = calculateCorrectionMagnitude(
      input.originalScore,
      input.correctedScore
    );

    const feedback = await this.feedbackRepository.create({
      feedbackType: 'SCORE_CORRECTION',
      originalScore: input.originalScore,
      originalConfidence: input.originalConfidence,
      modelVersion: input.modelVersion,
      correctedScore: input.correctedScore,
      correctionMagnitude,
      reason: input.reason ?? null,
      correctionCategory: input.correctionCategory,
      leadId: input.leadId,
      aiScoreId: input.aiScoreId ?? null,
      userId,
      tenantId,
    });

    // Publish domain event
    await this.eventBus.publish(
      new ScoreFeedbackSubmittedEvent(
        feedback.id,
        feedback.leadId,
        'SCORE_CORRECTION',
        feedback.originalScore,
        feedback.correctedScore,
        correctionMagnitude,
        input.correctionCategory,
        feedback.modelVersion,
        userId,
        tenantId
      )
    );

    // Check if retraining is needed after this correction
    const retrainingCheck = await this.checkRetrainingNeeded(input.modelVersion);
    if (retrainingCheck.needed && retrainingCheck.reason) {
      await this.eventBus.publish(
        new RetrainingRecommendedEvent(
          input.modelVersion,
          retrainingCheck.reason,
          retrainingCheck.feedbackCount ?? 0,
          retrainingCheck.negativeRatio ?? 0,
          retrainingCheck.avgCorrectionMagnitude ?? 0
        )
      );
    }

    return feedback;
  }

  /**
   * Get feedback for a specific lead
   */
  async getFeedbackForLead(leadId: string): Promise<FeedbackRecord[]> {
    return this.feedbackRepository.findByLeadId(leadId);
  }

  /**
   * Get feedback analytics
   */
  async getAnalytics(params: FeedbackAnalyticsQuery): Promise<FeedbackAnalytics> {
    const feedback = await this.feedbackRepository.findAll({
      modelVersion: params.modelVersion,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      tenantId: params.tenantId,
    });

    // Calculate summary counts
    const positiveCount = feedback.filter(f => f.feedbackType === 'THUMBS_UP').length;
    const negativeCount = feedback.filter(f => f.feedbackType === 'THUMBS_DOWN').length;
    const corrections = feedback.filter(f => f.feedbackType === 'SCORE_CORRECTION');
    const correctionCount = corrections.length;
    const totalFeedback = feedback.length;

    // Calculate ratios
    const positiveRatio = totalFeedback > 0 ? positiveCount / totalFeedback : 0;
    const negativeRatio = totalFeedback > 0 ? negativeCount / totalFeedback : 0;

    // Calculate average correction magnitude
    const totalMagnitude = corrections.reduce(
      (sum, f) => sum + (f.correctionMagnitude ?? 0),
      0
    );
    const averageCorrectionMagnitude = correctionCount > 0
      ? totalMagnitude / correctionCount
      : 0;

    // Calculate correction distribution
    const correctionDistribution = this.calculateCorrectionDistribution(corrections);

    // Calculate category breakdown
    const categoryBreakdown = this.calculateCategoryBreakdown(corrections);

    // Calculate model version stats
    const modelVersionStats = this.calculateModelVersionStats(feedback);

    // Calculate trend data (last 7 days)
    const trendData = this.calculateTrendData(feedback);

    // Generate improvement recommendations
    const improvementRecommendations = this.generateRecommendations(
      feedback,
      averageCorrectionMagnitude,
      categoryBreakdown,
      negativeRatio
    );

    // Check if retraining is recommended
    const retrainingCheck = await this.evaluateRetrainingNeed(
      feedback,
      negativeRatio,
      averageCorrectionMagnitude
    );

    return {
      totalFeedback,
      positiveCount,
      negativeCount,
      correctionCount,
      positiveRatio,
      negativeRatio,
      averageCorrectionMagnitude,
      correctionDistribution,
      categoryBreakdown,
      modelVersionStats,
      trendData,
      improvementRecommendations,
      retrainingRecommended: retrainingCheck.needed,
      retrainingReason: retrainingCheck.reason,
    };
  }

  /**
   * Check if model retraining is needed
   */
  async checkRetrainingNeeded(modelVersion: string): Promise<RetrainingCheck> {
    const windowStart = new Date(
      Date.now() - RETRAINING_THRESHOLDS.WINDOW_DAYS * 24 * 60 * 60 * 1000
    );

    const recentFeedback = await this.feedbackRepository.findByModelVersion(
      modelVersion,
      windowStart
    );

    return this.evaluateRetrainingNeed(
      recentFeedback,
      this.calculateNegativeRatio(recentFeedback),
      this.calculateAvgCorrectionMagnitude(recentFeedback)
    );
  }

  /**
   * Export training data from corrections
   */
  async exportTrainingData(
    modelVersion: string,
    dateFrom: Date,
    dateTo: Date,
    exportedBy: string
  ): Promise<TrainingDataExport> {
    const corrections = await this.feedbackRepository.findByModelVersion(
      modelVersion,
      dateFrom,
      dateTo
    );

    const trainingCorrections = corrections.filter(
      f => f.feedbackType === 'SCORE_CORRECTION' && f.correctedScore !== null
    );

    const trainingData: TrainingDataExport['corrections'] = [];

    for (const correction of trainingCorrections) {
      const leadData = await this.leadDataPort.getLeadData(correction.leadId);

      trainingData.push({
        leadId: correction.leadId,
        originalScore: correction.originalScore,
        correctedScore: correction.correctedScore!,
        category: correction.correctionCategory ?? 'UNKNOWN',
        leadData: leadData ?? {},
      });
    }

    // Publish export event
    await this.eventBus.publish(
      new TrainingDataExportedEvent(
        modelVersion,
        trainingData.length,
        dateFrom,
        dateTo,
        exportedBy
      )
    );

    return {
      corrections: trainingData,
      exportedAt: new Date(),
      modelVersion,
      recordCount: trainingData.length,
    };
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private calculateCorrectionDistribution(
    corrections: FeedbackRecord[]
  ): CorrectionDistribution {
    const distribution: CorrectionDistribution = {
      minor: 0,
      moderate: 0,
      major: 0,
      severe: 0,
    };

    for (const correction of corrections) {
      if (correction.correctionMagnitude !== null) {
        const bucket = getCorrectionBucket(correction.correctionMagnitude);
        distribution[bucket]++;
      }
    }

    return distribution;
  }

  private calculateCategoryBreakdown(
    corrections: FeedbackRecord[]
  ): Record<string, number> {
    const breakdown: Record<string, number> = {};

    for (const correction of corrections) {
      if (correction.correctionCategory) {
        breakdown[correction.correctionCategory] =
          (breakdown[correction.correctionCategory] ?? 0) + 1;
      }
    }

    return breakdown;
  }

  private calculateModelVersionStats(feedback: FeedbackRecord[]): ModelVersionStats[] {
    const versionGroups = new Map<string, FeedbackRecord[]>();

    for (const f of feedback) {
      const group = versionGroups.get(f.modelVersion) ?? [];
      group.push(f);
      versionGroups.set(f.modelVersion, group);
    }

    return Array.from(versionGroups.entries()).map(([version, items]) => ({
      modelVersion: version,
      feedbackCount: items.length,
      positiveRatio: this.calculatePositiveRatio(items),
      avgCorrectionMagnitude: this.calculateAvgCorrectionMagnitude(items),
    }));
  }

  private calculateTrendData(feedback: FeedbackRecord[]): TrendDataPoint[] {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date();
    const trend: TrendDataPoint[] = [];

    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now.getTime() - i * dayMs);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + dayMs);

      const dayFeedback = feedback.filter(f => {
        const feedbackDate = new Date(f.createdAt);
        return feedbackDate >= dayStart && feedbackDate < dayEnd;
      });

      const corrections = dayFeedback.filter(f => f.feedbackType === 'SCORE_CORRECTION');

      trend.push({
        date: dayStart.toISOString().split('T')[0],
        positive: dayFeedback.filter(f => f.feedbackType === 'THUMBS_UP').length,
        negative: dayFeedback.filter(f => f.feedbackType === 'THUMBS_DOWN').length,
        corrections: corrections.length,
        avgMagnitude: this.calculateAvgCorrectionMagnitude(corrections),
      });
    }

    return trend;
  }

  private calculatePositiveRatio(feedback: FeedbackRecord[]): number {
    if (feedback.length === 0) return 0;
    const positiveCount = feedback.filter(f => f.feedbackType === 'THUMBS_UP').length;
    return positiveCount / feedback.length;
  }

  private calculateNegativeRatio(feedback: FeedbackRecord[]): number {
    if (feedback.length === 0) return 0;
    const negativeCount = feedback.filter(f => f.feedbackType === 'THUMBS_DOWN').length;
    return negativeCount / feedback.length;
  }

  private calculateAvgCorrectionMagnitude(feedback: FeedbackRecord[]): number {
    const corrections = feedback.filter(
      f => f.feedbackType === 'SCORE_CORRECTION' && f.correctionMagnitude !== null
    );

    if (corrections.length === 0) return 0;

    const totalMagnitude = corrections.reduce(
      (sum, f) => sum + (f.correctionMagnitude ?? 0),
      0
    );

    return totalMagnitude / corrections.length;
  }

  private generateRecommendations(
    feedback: FeedbackRecord[],
    avgMagnitude: number,
    categoryBreakdown: Record<string, number>,
    negativeRatio: number
  ): string[] {
    const recommendations: string[] = [];

    // High correction magnitude
    if (avgMagnitude > 30) {
      recommendations.push(
        'High average correction magnitude suggests significant model drift. Consider retraining with recent feedback.'
      );
    }

    // High negative ratio
    if (negativeRatio > RETRAINING_THRESHOLDS.MAX_NEGATIVE_RATIO) {
      recommendations.push(
        `Negative feedback ratio (${(negativeRatio * 100).toFixed(1)}%) exceeds threshold. Review scoring algorithm.`
      );
    }

    // Systematic over/under estimation
    const tooHigh = categoryBreakdown['SCORE_TOO_HIGH'] ?? 0;
    const tooLow = categoryBreakdown['SCORE_TOO_LOW'] ?? 0;

    if (tooHigh > tooLow * 2) {
      recommendations.push(
        'Model consistently overestimates lead quality. Adjust scoring weights downward.'
      );
    } else if (tooLow > tooHigh * 2) {
      recommendations.push(
        'Model consistently underestimates lead quality. Adjust scoring weights upward.'
      );
    }

    // Missing context issue
    const missingContext = categoryBreakdown['MISSING_CONTEXT'] ?? 0;
    if (feedback.length > 0 && missingContext / feedback.length > 0.2) {
      recommendations.push(
        '20%+ corrections cite missing context. Consider expanding input features.'
      );
    }

    // Wrong factors issue
    const wrongFactors = categoryBreakdown['WRONG_FACTORS'] ?? 0;
    if (feedback.length > 0 && wrongFactors / feedback.length > 0.15) {
      recommendations.push(
        'Significant factor weighting issues detected. Review scoring factor configuration.'
      );
    }

    return recommendations;
  }

  private evaluateRetrainingNeed(
    feedback: FeedbackRecord[],
    negativeRatio: number,
    avgCorrectionMagnitude: number
  ): RetrainingCheck {
    const feedbackCount = feedback.length;

    // Not enough data
    if (feedbackCount < RETRAINING_THRESHOLDS.MIN_FEEDBACK_COUNT) {
      return {
        needed: false,
        feedbackCount,
        negativeRatio,
        avgCorrectionMagnitude,
      };
    }

    // Check negative ratio threshold
    if (negativeRatio > RETRAINING_THRESHOLDS.MAX_NEGATIVE_RATIO) {
      return {
        needed: true,
        reason: `Negative feedback ratio (${(negativeRatio * 100).toFixed(1)}%) exceeds threshold (${RETRAINING_THRESHOLDS.MAX_NEGATIVE_RATIO * 100}%)`,
        feedbackCount,
        negativeRatio,
        avgCorrectionMagnitude,
      };
    }

    // Check average correction magnitude
    if (avgCorrectionMagnitude > RETRAINING_THRESHOLDS.MAX_AVG_CORRECTION) {
      return {
        needed: true,
        reason: `Average correction magnitude (${avgCorrectionMagnitude.toFixed(1)}) exceeds threshold (${RETRAINING_THRESHOLDS.MAX_AVG_CORRECTION})`,
        feedbackCount,
        negativeRatio,
        avgCorrectionMagnitude,
      };
    }

    return {
      needed: false,
      feedbackCount,
      negativeRatio,
      avgCorrectionMagnitude,
    };
  }
}
