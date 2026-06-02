/**
 * IntelliFlow CRM AI Worker
 * Entry point for AI processing services
 */

// CRITICAL: env.ts MUST be the first import.
// ES import hoisting causes all module-level code to run before any statements.
// This module loads .env, .env.local, .env.development into process.env
// so that aiConfig and chain constructors see the correct values.
import './env';

// CRITICAL: OTel MUST be the second import — before LangChain, BullMQ, express.
// Auto-instrumentation patches Node.js module hooks; if libraries load first
// they will not be instrumented.
import './tracing/otel.js';

import pino from 'pino';
import { requiredProdEnv } from '@intelliflow/validators/required-url';

const logger = pino({
  name: 'ai-worker',
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

// Export all public APIs
export { aiConfig, loadAIConfig, calculateCost } from './config/ai.config';
export { costTracker, CostTracker } from './utils/cost-tracker';
export { leadScoringChain, LeadScoringChain } from './chains/scoring.chain';
export { embeddingChain, EmbeddingChain } from './chains/embedding.chain';
export { BaseAgent } from './agents/base.agent';
export {
  qualificationAgent,
  getQualificationAgent,
  LeadQualificationAgent,
  createQualificationTask,
} from './agents/qualification.agent';
export { createLogger, withContext, withTiming } from './utils/logger';

// M6: conversation-history replay helper
export { replayConversation } from './utils/conversation-replay';
export type { ReplayOptions, ReplayResult } from './utils/conversation-replay';

// IFC-154: Export OCR worker for cross-worker reuse
export {
  OCRWorker,
  createOCRWorker,
  type OCRJobInput,
  type OCRJobResult,
  type OCRProvenance,
  type OCRQualityMetrics,
  type ExtractedTextArtifact,
  type SupportedFormat,
  type OCREngine,
} from './workers/ocr-worker';

// IFC-310: Contact embedding worker for duplicate-detection runtime
export {
  ContactEmbedWorker,
  createContactEmbedWorker,
  CONTACT_EMBED_QUEUE_NAME,
  ContactEmbedJobDataSchema,
  contactToEmbeddableText,
  type ContactEmbedJobData,
  type ContactEmbedJobResult,
  type EmbeddingChainLike,
  type UpdateContactEmbeddingFn,
} from './workers/contact-embed-worker';

// PG-185 Cat-2 follow-through: ticket SLA monitor + auto-close sweepers
export {
  TicketSlaMonitorWorker,
  createTicketSlaMonitorWorker,
  TICKET_SLA_MONITOR_QUEUE_NAME,
  TicketSlaMonitorJobDataSchema,
  type TicketSlaMonitorJobData,
  type TicketSlaMonitorJobResult,
  type SlaMonitorDeps,
  type SlaAutomationFlagsShape,
} from './workers/ticket-sla-monitor.job';

export {
  TicketAutoCloseWorker,
  createTicketAutoCloseWorker,
  TICKET_AUTO_CLOSE_QUEUE_NAME,
  TicketAutoCloseJobDataSchema,
  type TicketAutoCloseJobData,
  type TicketAutoCloseJobResult,
  type AutoCloseDeps,
} from './workers/ticket-auto-close.job';

// IFC-155: Export services for search index management
export {
  DocumentIndexer,
  createDocumentIndexer,
  type IndexerConfig,
  type IndexResult,
  type BatchIndexResult,
  type ReindexProgress,
} from './services/document-indexer';
export {
  EmbeddingPurgeService,
  LegalHoldError,
  createEmbeddingPurgeService,
  type EmbeddingPurgeResult,
} from './services/embedding-purge.service';
export {
  withRetry,
  withTimeout,
  withRetryAndTimeout,
  CircuitBreaker,
  RetryableError,
  RateLimitError,
  TimeoutError,
  NetworkError,
} from './utils/retry';

// Export worker and jobs (IFC-168)
export { AIWorker, createAIWorker } from './ai-worker';
export {
  AI_WORKER_QUEUES,
  SCORING_QUEUE,
  PREDICTION_QUEUE,
  INSIGHT_QUEUE,
  processScoringJob,
  processPredictionJob,
  processInsightJob,
  ScoringJobDataSchema,
  ScoringJobResultSchema,
  PredictionJobDataSchema,
  PredictionJobResultSchema,
  InsightJobDataSchema,
  InsightJobResultSchema,
  DEFAULT_SCORING_JOB_OPTIONS,
  DEFAULT_PREDICTION_JOB_OPTIONS,
  DEFAULT_INSIGHT_JOB_OPTIONS,
} from './jobs';

// Export types
export type { AIConfig, AIProvider, ModelName } from './config/ai.config';
export type { UsageMetrics, CostStatistics } from './utils/cost-tracker';
export type { LeadInput, ScoringResult } from './chains/scoring.chain';
export type {
  EmbeddingInput,
  EmbeddingResult,
  BatchEmbeddingResult,
} from './chains/embedding.chain';
export type { AgentContext, AgentTask, AgentResult, BaseAgentConfig } from './agents/base.agent';
export type { QualificationInput, QualificationOutput } from './agents/qualification.agent';
export type { LoggerContext, LogLevel } from './utils/logger';
export type { RetryConfig } from './utils/retry';

// Export job types (IFC-168)
export type {
  ScoringJobData,
  ScoringJobResult,
  PredictionJobData,
  PredictionJobResult,
  PredictionType,
  InsightJobData,
  InsightJobResult,
} from './jobs';

// Additional chain exports (IFC-029, IFC-039, IFC-095)
export {
  AutoResponseChain,
  SentimentAnalysisChain,
  sentimentChain,
  sentimentInputSchema,
  sentimentResultSchema,
  SENTIMENT_LABELS,
  EMOTION_LABELS,
  URGENCY_LEVELS,
  ChurnRiskChain,
  churnRiskChain,
  churnRiskInputSchema,
  churnRiskResultSchema,
  riskFactorSchema,
  RISK_LEVEL_CONFIG,
  RAGContextChain,
  ragContextChain,
  createRAGContextChain,
  RAG_SOURCES,
  ragContextInputSchema,
  ragContextResultSchema,
  contextItemSchema,
  chainLeadInputSchema,
  InsightGenerationChain,
  insightGenerationChain,
  getInsightGenerationChain,
  InsightGenerationInputSchema,
  GeneratedInsightSchema,
} from './chains';
export type {
  AutoResponseInput,
  AutoResponseOutput,
  ValidationResult,
  SentimentInput,
  SentimentResult,
  SentimentLabel,
  EmotionLabel,
  UrgencyLevel,
  ChurnRiskInput,
  ChurnRiskResult,
  RiskFactor,
  ChurnRiskLevel,
  RAGSource,
  RAGContextInput,
  RAGContextResult,
  ContextItem,
  IRetrievalService,
  ChainLeadInput,
  ChainScoringResult,
  InsightGenerationInput,
  GeneratedInsight,
} from './chains';

// Analytics module (IFC-024, IFC-025)
export * from './analytics';

// Relevance configuration (IFC-155)
export * from './config';

// Prompt templates
export * from './prompts';

// Shared AI types
export * from './types';

// Agent Status Tracking (Active Agents dashboard)
export {
  extractJobContext,
  markAgentActive,
  markAgentIdle,
  markAgentError,
} from './services/agent-status';
export type { AgentStatusContext, JobCompletionMeta } from './services/agent-status';

// AI Model Monitoring (IFC-117)
export * from './monitoring';

// Chain versioning (IFC-086)
export * from './versioning';

// ═════════════════════════════════════════════════════════════════════════
// IFC-312 — Contact + Account AI chains, shared adapter, job handlers
// ═════════════════════════════════════════════════════════════════════════

export {
  ContactEnrichmentSchema,
  AccountEnrichmentSchema,
  LiteLLMEnrichmentAdapter,
  MockEnrichmentAdapter,
  getEnrichmentAdapter,
  __resetEnrichmentAdapterCache,
} from './shared/enrichment-adapter.js';
export type {
  EnrichmentProvider,
  ContactEnrichment,
  AccountEnrichment,
  ContactSeed,
  AccountSeed,
} from './shared/enrichment-adapter.js';

export { enrichContact } from './contact-enrichment.chain.js';
export type { EnrichContactInput, EnrichContactResult } from './contact-enrichment.chain.js';

export { enrichAccount } from './account-enrichment.chain.js';
export type { EnrichAccountInput, EnrichAccountResult } from './account-enrichment.chain.js';

export { suggestContactTags } from './contact-tag-suggestion.chain.js';
export type {
  SuggestContactTagsInput,
  SuggestContactTagsResult,
  ContactProfileSnapshot,
} from './contact-tag-suggestion.chain.js';

export { suggestAccountTags } from './account-tag-suggestion.chain.js';
export type {
  SuggestAccountTagsInput,
  SuggestAccountTagsResult,
  AccountProfileSnapshot,
} from './account-tag-suggestion.chain.js';

export { generateContactInsight } from './contact-insight.chain.js';
export type {
  GenerateContactInsightInput,
  GenerateContactInsightResult,
  ContactInsightContext,
} from './contact-insight.chain.js';

export { generateAccountInsight } from './account-insight.chain.js';
export type {
  GenerateAccountInsightInput,
  GenerateAccountInsightResult,
  AccountInsightContext,
} from './account-insight.chain.js';

export { draftContactReply } from './contact-reply-draft.chain.js';
export type {
  DraftContactReplyInput,
  DraftContactReplyResult,
  ReplyDraftPayload,
  EmailThreadEntry,
} from './contact-reply-draft.chain.js';

export { inferAccountIndustry } from './account-industry-inference.chain.js';
export type {
  InferAccountIndustryInput,
  InferAccountIndustryResult,
  IndustryVocabularyEntry,
} from './account-industry-inference.chain.js';

export { scoreAccount } from './account-scoring.chain.js';
export type {
  ScoreAccountInput,
  ScoreAccountResult,
  AccountScoringSignals,
} from './account-scoring.chain.js';

// Job processors (BullMQ)
export { processEnrichmentJob, EnrichmentJobDataSchema } from './jobs/enrichment.job.js';
export type { EnrichmentJobData } from './jobs/enrichment.job.js';
export { processEntityInsightJob, EntityInsightJobDataSchema } from './jobs/entity-insight.job.js';
export type { EntityInsightJobData } from './jobs/entity-insight.job.js';
export { processReplyDraftJob, ReplyDraftJobDataSchema } from './jobs/reply-draft.job.js';
export type { ReplyDraftJobData } from './jobs/reply-draft.job.js';
export {
  processAccountScoringJob,
  AccountScoringJobDataSchema,
} from './jobs/account-scoring.job.js';
export type { AccountScoringJobData } from './jobs/account-scoring.job.js';
export { processTagSuggestionJob, TagSuggestionJobDataSchema } from './jobs/tag-suggestion.job.js';
export type { TagSuggestionJobData } from './jobs/tag-suggestion.job.js';

// ---------------------------------------------------------------------------
// Provider display-name helpers (used by initializeWorker)
// ---------------------------------------------------------------------------

function resolveProviderModelName(config: { provider: string; ollama: { model: string } }): string {
  if (config.provider === 'ollama') return config.ollama.model;
  if (config.provider === 'mock') return 'mock';
  return `litellm/${config.provider}`;
}

function resolveProviderEndpointUrl(config: {
  provider: string;
  ollama: { baseUrl: string };
}): string {
  if (config.provider === 'ollama') return config.ollama.baseUrl;
  if (config.provider === 'mock') return 'mock';
  // Only require LITELLM_BASE_URL in prod when LiteLLM is the active provider.
  // For openai/direct this value is display/telemetry only and must not crash
  // startup when unset — consistent with loadAIConfig() and ADR-048.
  if (config.provider === 'litellm') {
    return requiredProdEnv(
      'LITELLM_BASE_URL',
      process.env['LITELLM_BASE_URL'],
      'http://localhost:4000/v1'
    );
  }
  return process.env['LITELLM_BASE_URL'] || 'http://localhost:4000/v1';
}

/**
 * Initialize the AI Worker (legacy mode - library only)
 * @deprecated Use createAIWorker() for queue-based processing
 */
async function initializeWorker() {
  logger.info('🤖 IntelliFlow AI Worker starting (library mode)...');

  try {
    // Validate configuration
    const { aiConfig } = await import('./config/ai.config.js');

    // Derive display model/endpoint from provider config — factory owns actual routing
    const modelName = resolveProviderModelName(aiConfig);
    const endpointUrl = resolveProviderEndpointUrl(aiConfig);
    logger.info(
      {
        provider: aiConfig.provider,
        model: modelName,
        endpoint: endpointUrl,
        costTrackingEnabled: aiConfig.costTracking.enabled,
        cacheEnabled: aiConfig.performance.cacheEnabled,
      },
      'AI Worker configuration loaded'
    );

    // Initialize cost tracker
    const { costTracker } = await import('./utils/cost-tracker.js');
    logger.info('Cost tracker initialized');

    // Initialize chains
    const { leadScoringChain } = await import('./chains/scoring.chain.js');
    logger.info('Lead scoring chain initialized');

    const { embeddingChain } = await import('./chains/embedding.chain.js');
    logger.info('Embedding chain initialized');

    // Initialize agents
    const { qualificationAgent } = await import('./agents/qualification.agent.js');
    logger.info('Qualification agent initialized');

    logger.info('✅ AI Worker initialized successfully (library mode)');

    // Return public API
    return {
      aiConfig,
      costTracker,
      leadScoringChain,
      embeddingChain,
      qualificationAgent,
    };
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      '❌ Failed to initialize AI Worker'
    );
    throw error;
  }
}

/**
 * Shutdown the AI Worker gracefully
 */
async function shutdown() {
  logger.info('🛑 AI Worker shutting down...');

  try {
    // Generate final cost report
    const { costTracker } = await import('./utils/cost-tracker.js');
    const report = costTracker.generateReport();
    logger.info('\n' + report);

    logger.info('✅ AI Worker shutdown complete');
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      '❌ Error during shutdown'
    );
  }
}

/**
 * Handle process signals for graceful shutdown
 */
function setupSignalHandlers() {
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal');
    await shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal');
    await shutdown();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    logger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      'Uncaught exception'
    );
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(
      {
        reason,
      },
      'Unhandled promise rejection'
    );
    process.exit(1);
  });
}

/**
 * Main entry point
 *
 * Supports two modes:
 * 1. Queue mode (default): Starts BullMQ worker to process jobs from Redis
 * 2. Library mode (AI_WORKER_MODE=library): Exports APIs without queue processing
 */
async function main() {
  const mode = process.env.AI_WORKER_MODE || 'queue';

  if (mode === 'library') {
    // Legacy library-only mode
    setupSignalHandlers();
    await initializeWorker();
    logger.info('AI Worker running in library mode (no queue processing)');
    // Keep the process alive indefinitely in library mode. The promise is never resolved;
    // SIGINT/SIGTERM handlers registered by setupSignalHandlers() handle graceful shutdown.
    await new Promise<never>(() => undefined);
  } else {
    // Queue mode - use the new AIWorker class (IFC-168)
    logger.info('🤖 Starting AI Worker in queue mode...');

    try {
      const { createAIWorker } = await import('./ai-worker.js');
      const worker = await createAIWorker();

      logger.info('AI Worker is ready and processing jobs from queues');

      // The worker handles its own shutdown via BaseWorker
      // Keep process alive by waiting for worker status
      await new Promise<void>((resolve) => {
        const checkStatus = setInterval(() => {
          const status = worker.getStatus();
          if (status.state === 'stopped' || status.state === 'error') {
            clearInterval(checkStatus);
            resolve();
          }
        }, 1000);
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Fatal error starting AI Worker'
      );
      process.exit(1);
    }
  }
}

// Run the worker if this file is executed directly.
// `require.main === module` works for plain `node` but is always false under
// `tsx watch` (which transpiles to ESM). Detect tsx by checking if any argv
// entry ends with our source file path.
const isDirectExecution =
  require.main === module ||
  process.argv.some(
    (arg) => arg.replace(/\\/g, '/').endsWith('/ai-worker/src/index.ts') || arg === 'src/index.ts'
  );

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export initialize function for programmatic use
export { initializeWorker, shutdown };
