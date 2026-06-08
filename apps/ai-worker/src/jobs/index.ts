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

// IFC-312 — Contact + Account AI chain job handlers
export {
  processEnrichmentJob,
  EnrichmentJobDataSchema,
  type EnrichmentJobData,
} from './enrichment.job';

export {
  processEntityInsightJob,
  EntityInsightJobDataSchema,
  type EntityInsightJobData,
} from './entity-insight.job';

export {
  processReplyDraftJob,
  ReplyDraftJobDataSchema,
  type ReplyDraftJobData,
} from './reply-draft.job';

export {
  processAccountScoringJob,
  AccountScoringJobDataSchema,
  type AccountScoringJobData,
} from './account-scoring.job';

export {
  processTagSuggestionJob,
  TagSuggestionJobDataSchema,
  type TagSuggestionJobData,
} from './tag-suggestion.job';

export {
  processPortalSweepJob,
  PortalSweepJobDataSchema,
  PORTAL_SWEEP_QUEUE,
  PORTAL_SWEEP_CRON,
  DEFAULT_PORTAL_SWEEP_JOB_OPTIONS,
  type PortalSweepJobData,
  type PortalSweepJobResult,
} from './portal-sweep.job';

/** All queue names this worker processes */
export const AI_WORKER_QUEUES = [
  'ai-scoring',
  'ai-prediction',
  'ai-insights',
  'ai-summarize-conversation',
  'ai-feedback-analytics',
  'ai-memory-retention',
  // IFC-312 — contact/account AI chain queues
  'ai-enrichment',
  'ai-entity-insight',
  'ai-reply-draft',
  'ai-account-scoring',
  'ai-tag-suggestion',
  // IFC-314 — portal delivery sweep heartbeat
  'portal-sweep',
] as const;

// PG-184 / PG-185 Cat-2 follow-through: AI automation consumers
export {
  DEAL_AI_AUTOMATION_QUEUE,
  DealAiAutomationJobDataSchema,
  processDealAiAutomationJob,
  type DealAiAutomationJobData,
  type DealAiAutomationJobResult,
  type DealAiChainBundle,
} from './deal-ai-automation.job';

export {
  TICKET_AI_AUTOMATION_QUEUE,
  TicketAiAutomationJobDataSchema,
  processTicketAiAutomationJob,
  type TicketAiAutomationJobData,
  type TicketAiAutomationJobResult,
  type TicketAiChainBundle,
} from './ticket-ai-automation.job';
