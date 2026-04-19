/**
 * AI Worker Jobs
 *
 * Export all job handlers and queue configurations.
 *
 * @module ai-worker/jobs
 * @task IFC-168
 */

export {
  SCORING_QUEUE,
  processScoringJob,
  ScoringJobDataSchema,
  ScoringJobResultSchema,
  DEFAULT_SCORING_JOB_OPTIONS,
  type ScoringJobData,
  type ScoringJobResult,
} from './scoring.job';

export {
  PREDICTION_QUEUE,
  processPredictionJob,
  PredictionJobDataSchema,
  PredictionJobResultSchema,
  PredictionTypes,
  DEFAULT_PREDICTION_JOB_OPTIONS,
  type PredictionJobData,
  type PredictionJobResult,
  type PredictionType,
} from './prediction.job';

export {
  INSIGHT_QUEUE,
  processInsightJob,
  InsightJobDataSchema,
  InsightJobResultSchema,
  DEFAULT_INSIGHT_JOB_OPTIONS,
  type InsightJobData,
  type InsightJobResult,
} from './insight-generation.job';

export {
  SUMMARIZE_QUEUE,
  processSummarizeJob,
  SummarizeConversationJobSchema,
  SummarizeConversationJobResultSchema,
  DEFAULT_SUMMARIZE_JOB_OPTIONS,
  shouldSummarizeConversation,
  enqueueSummarizationIfNeeded,
  SUMMARIZATION_MESSAGE_THRESHOLD,
  SUMMARIZATION_TOKEN_THRESHOLD,
  type SummarizeConversationJobData,
  type SummarizeConversationJobResult,
} from './summarize-conversation.job';

export {
  FEEDBACK_ANALYTICS_QUEUE,
  FEEDBACK_ANALYTICS_CRON,
  processFeedbackAnalyticsJob,
  FeedbackAnalyticsJobDataSchema,
  FeedbackAnalyticsJobResultSchema,
  DEFAULT_FEEDBACK_ANALYTICS_JOB_OPTIONS,
  type FeedbackAnalyticsJobData,
  type FeedbackAnalyticsJobResult,
} from './feedback-analytics.job';

export {
  MEMORY_RETENTION_QUEUE,
  MEMORY_RETENTION_CRON,
  processMemoryRetentionJob,
  MemoryRetentionJobDataSchema,
  MemoryRetentionJobResultSchema,
  DEFAULT_MEMORY_RETENTION_JOB_OPTIONS,
  type MemoryRetentionJobData,
  type MemoryRetentionJobResult,
} from './memory-retention.job';

/** All queue names this worker processes */
export const AI_WORKER_QUEUES = [
  'ai-scoring',
  'ai-prediction',
  'ai-insights',
  'ai-summarize-conversation',
  'ai-feedback-analytics',
  'ai-memory-retention',
] as const;
