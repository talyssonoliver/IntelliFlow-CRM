/**
 * Analytics Module - IFC-024, IFC-025
 *
 * Exports analytics generators for AI feedback, model performance tracking,
 * and A/B testing statistical analysis.
 */

export {
  FeedbackAnalyticsGenerator,
  feedbackAnalyticsGenerator,
  generateFeedbackAnalyticsCLI,
  type FeedbackRecord,
  type FeedbackSummary,
  type CorrectionDistribution,
  type CategoryAnalysis,
  type ModelVersionStats,
  type RetrainingRecommendation,
  type FeedbackAnalytics,
} from './feedback-analytics-generator';

// A/B Testing Statistical Analysis (IFC-025)
export {
  calculateDescriptiveStats,
  welchTTest,
  welchTTestFromStats,
  chiSquareTest,
  cohensD,
  cohensDFromStats,
  interpretEffectSize,
  requiredSampleSize,
  calculatePower,
  analyzeExperiment,
  type TTestResult,
  type ChiSquareResult,
  type DescriptiveStats,
  type ExperimentAnalysis,
} from './statistical-analysis';
