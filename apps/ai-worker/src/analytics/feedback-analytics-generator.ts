/**
 * Feedback Analytics Generator - IFC-024
 *
 * Generates comprehensive analytics from user feedback data
 * to monitor AI model performance and identify retraining needs.
 *
 * Outputs: artifacts/misc/feedback-analytics.json
 *
 * @module feedback-analytics-generator
 * @task IFC-024
 */

import pino from 'pino';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import {
  RETRAINING_THRESHOLDS,
  CORRECTION_MAGNITUDE_BUCKETS,
  type FeedbackCategory,
} from '@intelliflow/domain';

const logger = pino({
  name: 'feedback-analytics-generator',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Raw feedback record from database
 */
export interface FeedbackRecord {
  id: string;
  feedbackType: 'THUMBS_UP' | 'THUMBS_DOWN' | 'SCORE_CORRECTION';
  originalScore: number;
  originalConfidence: number;
  correctedScore: number | null;
  correctionMagnitude: number | null;
  correctionCategory: FeedbackCategory | null;
  reason: string | null;
  modelVersion: string;
  createdAt: Date;
  leadId: string;
  userId: string;
  tenantId: string;
}

/**
 * Summary statistics
 */
export interface FeedbackSummary {
  total: number;
  thumbsUp: number;
  thumbsDown: number;
  corrections: number;
  positiveRatio: number;
  negativeRatio: number;
  correctionRatio: number;
}

/**
 * Correction distribution statistics
 */
export interface CorrectionDistribution {
  minor: number;
  moderate: number;
  major: number;
  severe: number;
  averageMagnitude: number;
  medianMagnitude: number;
  averageDirection: 'up' | 'down' | 'neutral';
}

/**
 * Category analysis
 */
export interface CategoryAnalysis {
  category: FeedbackCategory;
  count: number;
  percentage: number;
  averageMagnitude: number;
}

/**
 * Model version performance
 */
export interface ModelVersionStats {
  version: string;
  totalFeedback: number;
  positiveRatio: number;
  correctionCount: number;
  averageCorrectionMagnitude: number;
}

/**
 * Retraining recommendation
 */
export interface RetrainingRecommendation {
  needed: boolean;
  urgency: 'none' | 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
  metrics: {
    feedbackCount: number;
    negativeRatio: number;
    averageCorrection: number;
    windowDays: number;
  };
  modelVersion: string;
  recommendation: string;
}

/**
 * Complete analytics output
 */
export interface FeedbackAnalytics {
  generatedAt: string;
  period: {
    start: string;
    end: string;
    days: number;
  };
  summary: FeedbackSummary;
  corrections: CorrectionDistribution;
  categoryAnalysis: CategoryAnalysis[];
  modelPerformance: ModelVersionStats[];
  retrainingStatus: RetrainingRecommendation;
  trends: {
    dailyFeedbackCounts: Array<{ date: string; count: number; positiveRatio: number }>;
    weeklyAverageCorrection: Array<{ week: string; average: number }>;
  };
  recommendations: string[];
}

/**
 * Feedback Analytics Generator
 */
export class FeedbackAnalyticsGenerator {
  private outputPath: string;

  constructor(outputPath: string = 'artifacts/misc/feedback-analytics.json') {
    this.outputPath = outputPath;
  }

  /**
   * Generate analytics from feedback records
   */
  async generate(
    records: FeedbackRecord[],
    periodDays: number = 30
  ): Promise<FeedbackAnalytics> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Filter to period
    const periodRecords = records.filter(
      r => r.createdAt >= startDate && r.createdAt <= endDate
    );

    logger.info(
      { totalRecords: records.length, periodRecords: periodRecords.length, periodDays },
      'Generating feedback analytics'
    );

    const analytics: FeedbackAnalytics = {
      generatedAt: new Date().toISOString(),
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        days: periodDays,
      },
      summary: this.calculateSummary(periodRecords),
      corrections: this.calculateCorrectionDistribution(periodRecords),
      categoryAnalysis: this.analyzeCategoryDistribution(periodRecords),
      modelPerformance: this.analyzeModelPerformance(periodRecords),
      retrainingStatus: this.evaluateRetrainingNeed(periodRecords),
      trends: this.calculateTrends(periodRecords, periodDays),
      recommendations: this.generateRecommendations(periodRecords),
    };

    return analytics;
  }

  /**
   * Generate and save analytics to file
   */
  async generateAndSave(
    records: FeedbackRecord[],
    periodDays: number = 30
  ): Promise<FeedbackAnalytics> {
    const analytics = await this.generate(records, periodDays);

    // Ensure directory exists
    await mkdir(dirname(this.outputPath), { recursive: true });

    // Write to file
    await writeFile(this.outputPath, JSON.stringify(analytics, null, 2), 'utf-8');

    logger.info({ outputPath: this.outputPath }, 'Feedback analytics saved');

    return analytics;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(records: FeedbackRecord[]): FeedbackSummary {
    const total = records.length;
    const thumbsUp = records.filter(r => r.feedbackType === 'THUMBS_UP').length;
    const thumbsDown = records.filter(r => r.feedbackType === 'THUMBS_DOWN').length;
    const corrections = records.filter(r => r.feedbackType === 'SCORE_CORRECTION').length;

    return {
      total,
      thumbsUp,
      thumbsDown,
      corrections,
      positiveRatio: total > 0 ? thumbsUp / total : 0,
      negativeRatio: total > 0 ? thumbsDown / total : 0,
      correctionRatio: total > 0 ? corrections / total : 0,
    };
  }

  /**
   * Calculate correction distribution
   */
  private calculateCorrectionDistribution(records: FeedbackRecord[]): CorrectionDistribution {
    const corrections = records.filter(
      r => r.feedbackType === 'SCORE_CORRECTION' && r.correctionMagnitude !== null
    );

    if (corrections.length === 0) {
      return {
        minor: 0,
        moderate: 0,
        major: 0,
        severe: 0,
        averageMagnitude: 0,
        medianMagnitude: 0,
        averageDirection: 'neutral',
      };
    }

    const magnitudes = corrections.map(c => c.correctionMagnitude!);
    const sortedMagnitudes = [...magnitudes].sort((a, b) => a - b);

    // Bucket counts using domain constants
    const minor = magnitudes.filter(m => m <= CORRECTION_MAGNITUDE_BUCKETS.MINOR_MAX).length;
    const moderate = magnitudes.filter(
      m => m > CORRECTION_MAGNITUDE_BUCKETS.MINOR_MAX && m <= CORRECTION_MAGNITUDE_BUCKETS.MODERATE_MAX
    ).length;
    const major = magnitudes.filter(
      m => m > CORRECTION_MAGNITUDE_BUCKETS.MODERATE_MAX && m <= CORRECTION_MAGNITUDE_BUCKETS.MAJOR_MAX
    ).length;
    const severe = magnitudes.filter(m => m > CORRECTION_MAGNITUDE_BUCKETS.MAJOR_MAX).length;

    // Calculate averages
    const averageMagnitude = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const medianMagnitude =
      sortedMagnitudes.length % 2 === 0
        ? (sortedMagnitudes[sortedMagnitudes.length / 2 - 1] +
            sortedMagnitudes[sortedMagnitudes.length / 2]) /
          2
        : sortedMagnitudes[Math.floor(sortedMagnitudes.length / 2)];

    // Direction analysis
    const directionalChanges = corrections
      .filter(c => c.correctedScore !== null)
      .map(c => c.correctedScore! - c.originalScore);

    const avgDirection =
      directionalChanges.length > 0
        ? directionalChanges.reduce((a, b) => a + b, 0) / directionalChanges.length
        : 0;

    return {
      minor,
      moderate,
      major,
      severe,
      averageMagnitude: Math.round(averageMagnitude * 100) / 100,
      medianMagnitude,
      averageDirection: avgDirection > 2 ? 'up' : avgDirection < -2 ? 'down' : 'neutral',
    };
  }

  /**
   * Analyze category distribution
   */
  private analyzeCategoryDistribution(records: FeedbackRecord[]): CategoryAnalysis[] {
    const corrections = records.filter(
      r => r.feedbackType === 'SCORE_CORRECTION' && r.correctionCategory !== null
    );

    if (corrections.length === 0) {
      return [];
    }

    const categoryMap = new Map<FeedbackCategory, FeedbackRecord[]>();

    for (const record of corrections) {
      const cat = record.correctionCategory!;
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, []);
      }
      categoryMap.get(cat)!.push(record);
    }

    return Array.from(categoryMap.entries())
      .map(([category, catRecords]) => ({
        category,
        count: catRecords.length,
        percentage: (catRecords.length / corrections.length) * 100,
        averageMagnitude:
          catRecords
            .filter(r => r.correctionMagnitude !== null)
            .reduce((sum, r) => sum + r.correctionMagnitude!, 0) /
            catRecords.filter(r => r.correctionMagnitude !== null).length || 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Analyze performance by model version
   */
  private analyzeModelPerformance(records: FeedbackRecord[]): ModelVersionStats[] {
    const versionMap = new Map<string, FeedbackRecord[]>();

    for (const record of records) {
      if (!versionMap.has(record.modelVersion)) {
        versionMap.set(record.modelVersion, []);
      }
      versionMap.get(record.modelVersion)!.push(record);
    }

    return Array.from(versionMap.entries())
      .map(([version, versionRecords]) => {
        const positive = versionRecords.filter(r => r.feedbackType === 'THUMBS_UP').length;
        const corrections = versionRecords.filter(r => r.feedbackType === 'SCORE_CORRECTION');

        return {
          version,
          totalFeedback: versionRecords.length,
          positiveRatio: versionRecords.length > 0 ? positive / versionRecords.length : 0,
          correctionCount: corrections.length,
          averageCorrectionMagnitude:
            corrections.length > 0
              ? corrections
                  .filter(c => c.correctionMagnitude !== null)
                  .reduce((sum, c) => sum + c.correctionMagnitude!, 0) /
                corrections.filter(c => c.correctionMagnitude !== null).length
              : 0,
        };
      })
      .sort((a, b) => b.totalFeedback - a.totalFeedback);
  }

  /**
   * Evaluate if model retraining is needed
   */
  private evaluateRetrainingNeed(records: FeedbackRecord[]): RetrainingRecommendation {
    const windowMs = RETRAINING_THRESHOLDS.WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const windowStart = new Date(Date.now() - windowMs);
    const windowRecords = records.filter(r => r.createdAt >= windowStart);

    // Get most recent model version
    const latestVersion =
      records.length > 0
        ? records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0].modelVersion
        : 'unknown';

    // Calculate metrics
    const feedbackCount = windowRecords.length;
    const negativeCount = windowRecords.filter(r => r.feedbackType === 'THUMBS_DOWN').length;
    const negativeRatio = feedbackCount > 0 ? negativeCount / feedbackCount : 0;

    const corrections = windowRecords.filter(
      r => r.feedbackType === 'SCORE_CORRECTION' && r.correctionMagnitude !== null
    );
    const averageCorrection =
      corrections.length > 0
        ? corrections.reduce((sum, c) => sum + c.correctionMagnitude!, 0) / corrections.length
        : 0;

    // Check thresholds
    const reasons: string[] = [];
    let urgency: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';

    if (feedbackCount < RETRAINING_THRESHOLDS.MIN_FEEDBACK_COUNT) {
      return {
        needed: false,
        urgency: 'none',
        reasons: [`Insufficient feedback (${feedbackCount}/${RETRAINING_THRESHOLDS.MIN_FEEDBACK_COUNT} required)`],
        metrics: {
          feedbackCount,
          negativeRatio,
          averageCorrection,
          windowDays: RETRAINING_THRESHOLDS.WINDOW_DAYS,
        },
        modelVersion: latestVersion,
        recommendation: 'Continue collecting feedback data.',
      };
    }

    if (negativeRatio > RETRAINING_THRESHOLDS.MAX_NEGATIVE_RATIO) {
      reasons.push(
        `High negative feedback ratio: ${(negativeRatio * 100).toFixed(1)}% > ${RETRAINING_THRESHOLDS.MAX_NEGATIVE_RATIO * 100}% threshold`
      );
      urgency = 'high';
    }

    if (averageCorrection > RETRAINING_THRESHOLDS.MAX_AVG_CORRECTION) {
      reasons.push(
        `High average correction: ${averageCorrection.toFixed(1)} > ${RETRAINING_THRESHOLDS.MAX_AVG_CORRECTION} threshold`
      );
      urgency = urgency === 'high' ? 'critical' : 'high';
    }

    const needed = reasons.length > 0;

    if (negativeRatio > RETRAINING_THRESHOLDS.MAX_NEGATIVE_RATIO * 1.5) {
      urgency = 'critical';
    }

    let recommendation = 'Model is performing within acceptable parameters.';
    if (needed) {
      if (urgency === 'critical') {
        recommendation =
          'URGENT: Immediate model retraining recommended. Consider rolling back to previous version.';
      } else if (urgency === 'high') {
        recommendation = 'Model retraining recommended within 1-2 days.';
      } else {
        recommendation = 'Schedule model retraining for next maintenance window.';
      }
    }

    return {
      needed,
      urgency,
      reasons,
      metrics: {
        feedbackCount,
        negativeRatio,
        averageCorrection,
        windowDays: RETRAINING_THRESHOLDS.WINDOW_DAYS,
      },
      modelVersion: latestVersion,
      recommendation,
    };
  }

  /**
   * Calculate trends over time
   */
  private calculateTrends(
    records: FeedbackRecord[],
    periodDays: number
  ): FeedbackAnalytics['trends'] {
    // Daily counts
    const dailyCounts = new Map<string, { count: number; positive: number }>();

    for (let i = 0; i < periodDays; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      dailyCounts.set(dateKey, { count: 0, positive: 0 });
    }

    for (const record of records) {
      const dateKey = record.createdAt.toISOString().split('T')[0];
      if (dailyCounts.has(dateKey)) {
        const current = dailyCounts.get(dateKey)!;
        current.count++;
        if (record.feedbackType === 'THUMBS_UP') {
          current.positive++;
        }
      }
    }

    const dailyFeedbackCounts = Array.from(dailyCounts.entries())
      .map(([date, data]) => ({
        date,
        count: data.count,
        positiveRatio: data.count > 0 ? data.positive / data.count : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Weekly correction averages
    const corrections = records.filter(
      r => r.feedbackType === 'SCORE_CORRECTION' && r.correctionMagnitude !== null
    );

    const weeklyCounts = new Map<string, number[]>();
    for (const correction of corrections) {
      const week = this.getWeekKey(correction.createdAt);
      if (!weeklyCounts.has(week)) {
        weeklyCounts.set(week, []);
      }
      weeklyCounts.get(week)!.push(correction.correctionMagnitude!);
    }

    const weeklyAverageCorrection = Array.from(weeklyCounts.entries())
      .map(([week, magnitudes]) => ({
        week,
        average: magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length,
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return {
      dailyFeedbackCounts,
      weeklyAverageCorrection,
    };
  }

  /**
   * Generate recommendations based on analytics
   */
  private generateRecommendations(records: FeedbackRecord[]): string[] {
    const recommendations: string[] = [];
    const summary = this.calculateSummary(records);
    const corrections = this.calculateCorrectionDistribution(records);
    const categories = this.analyzeCategoryDistribution(records);

    // Low feedback volume
    if (summary.total < 50) {
      recommendations.push(
        'Consider prompting users for feedback more frequently to improve data quality.'
      );
    }

    // High negative ratio
    if (summary.negativeRatio > 0.3) {
      recommendations.push(
        'High negative feedback ratio indicates model output quality issues. Review recent scoring decisions.'
      );
    }

    // High correction magnitude
    if (corrections.averageMagnitude > 15) {
      recommendations.push(
        `Average correction magnitude of ${corrections.averageMagnitude.toFixed(1)} points suggests systematic bias. Investigate scoring model.`
      );
    }

    // Directional bias
    if (corrections.averageDirection === 'up') {
      recommendations.push(
        'Corrections tend to increase scores. Model may be systematically underscoring leads.'
      );
    } else if (corrections.averageDirection === 'down') {
      recommendations.push(
        'Corrections tend to decrease scores. Model may be systematically overscoring leads.'
      );
    }

    // Category-specific issues
    const topCategory = categories[0];
    if (topCategory && topCategory.percentage > 40) {
      const categoryMessages: Record<FeedbackCategory, string> = {
        SCORE_TOO_HIGH: 'Review model calibration - frequently scoring too high.',
        SCORE_TOO_LOW: 'Review model calibration - frequently scoring too low.',
        WRONG_FACTORS: 'Review feature weights and factor importance.',
        MISSING_CONTEXT: 'Consider adding more data sources to scoring pipeline.',
        DATA_QUALITY: 'Improve input data validation and cleansing.',
        OTHER: 'Review free-text feedback for additional insights.',
      };
      recommendations.push(categoryMessages[topCategory.category]);
    }

    // Severe corrections
    if (corrections.severe > corrections.minor) {
      recommendations.push(
        'High proportion of severe corrections (>50 points). Urgent model review recommended.'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Model performance is within acceptable parameters. Continue monitoring.'
      );
    }

    return recommendations;
  }

  /**
   * Get ISO week key for a date
   */
  private getWeekKey(date: Date): string {
    const jan1 = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + jan1.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
  }
}

/**
 * Default analytics generator instance
 */
export const feedbackAnalyticsGenerator = new FeedbackAnalyticsGenerator(
  join(process.cwd(), 'artifacts/misc/feedback-analytics.json')
);

/**
 * CLI entry point for generating analytics
 */
export async function generateFeedbackAnalyticsCLI(): Promise<void> {
  logger.info('Generating feedback analytics from CLI...');

  // In a real implementation, this would query the database
  // For now, generate with empty records (or mock data for testing)
  const mockRecords: FeedbackRecord[] = [];

  await feedbackAnalyticsGenerator.generateAndSave(mockRecords);

  logger.info('Feedback analytics generation complete');
}
