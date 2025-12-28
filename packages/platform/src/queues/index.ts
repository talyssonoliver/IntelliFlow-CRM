/**
 * BullMQ Job Queue Infrastructure for IntelliFlow CRM
 *
 * Provides async job processing capabilities with:
 * - AI scoring queue for lead scoring
 * - Email notifications queue
 * - Webhook delivery queue
 * - Retry logic with exponential backoff
 * - Bull Board dashboard integration
 * - Job metrics collection
 *
 * @module @intelliflow/platform/queues
 */

// Types and schemas
export {
  // Job data schemas
  aiScoringJobDataSchema,
  aiScoringResultSchema,
  emailNotificationJobDataSchema,
  webhookDeliveryJobDataSchema,
  // Type exports
  type AIScoringJobData,
  type AIScoringResult,
  type EmailNotificationJobData,
  type WebhookDeliveryJobData,
  type RetryBackoffConfig,
  type QueueConfig,
  type JobMetrics,
  type JobEvent,
  type QueueName,
  // Constants
  QUEUE_NAMES,
  DEFAULT_QUEUE_CONFIGS,
} from './types';

// Connection management
export {
  getDefaultConnectionConfig,
  getBullMQConnectionOptions,
  checkConnectionHealth,
  connectionRegistry,
  type RedisConnectionConfig,
  type ConnectionHealthResult,
  type ConnectionOptions,
} from './connection';

// Retry strategy
export {
  calculateBackoffDelay,
  createBackoffStrategy,
  categorizeError,
  shouldRetry,
  RetryBudgetTracker,
  globalRetryBudget,
  ErrorCategory,
  BACKOFF_PRESETS,
} from './retry-strategy';

// Queue factory
export {
  queueRegistry,
  createAIScoringQueue,
  createEmailNotificationsQueue,
  createWebhookDeliveryQueue,
  enqueueAIScoring,
  getQueueHealth,
  pauseQueue,
  resumeQueue,
  shutdownAllQueues,
} from './queue-factory';

// Metrics collector
export {
  JobMetricsCollector,
  AggregateMetricsCollector,
  globalMetricsCollector,
} from './metrics-collector';

// Bull Board integration
export {
  setupBullBoard,
  getBullBoardInstance,
  addQueueToBullBoard,
  removeQueueFromBullBoard,
  configureBullBoardForExpress,
  configureBullBoardForFastify,
  getDashboardInfo,
  getBullBoardScreenshotDescription,
  type BullBoardConfig,
} from './bull-board';
