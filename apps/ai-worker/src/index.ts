/**
 * IntelliFlow CRM AI Worker
 * Entry point for AI processing services
 */

import dotenv from 'dotenv';
import pino from 'pino';
import path from 'node:path';
import fs from 'node:fs';

// Load environment variables from multiple .env files
// Order: .env -> .env.local -> .env.development (later files override earlier)
function loadEnvFiles() {
  // Find project root (monorepo root with pnpm-workspace.yaml)
  let root = process.cwd();
  while (root !== path.dirname(root)) {
    if (fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))) break;
    root = path.dirname(root);
  }

  const envFiles = [
    path.join(root, '.env'),
    path.join(root, '.env.local'),
    path.join(root, '.env.development'),
  ];

  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      dotenv.config({ path: envFile });
    }
  }
}

loadEnvFiles();

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
  LeadQualificationAgent,
  createQualificationTask,
} from './agents/qualification.agent';
export { createLogger, withContext, withTiming } from './utils/logger';
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
  processScoringJob,
  processPredictionJob,
  ScoringJobDataSchema,
  ScoringJobResultSchema,
  PredictionJobDataSchema,
  PredictionJobResultSchema,
  DEFAULT_SCORING_JOB_OPTIONS,
  DEFAULT_PREDICTION_JOB_OPTIONS,
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
} from './jobs';

/**
 * Initialize the AI Worker (legacy mode - library only)
 * @deprecated Use createAIWorker() for queue-based processing
 */
async function initializeWorker() {
  logger.info('🤖 IntelliFlow AI Worker starting (library mode)...');

  try {
    // Validate configuration
    const { aiConfig } = await import('./config/ai.config.js');

    logger.info(
      {
        provider: aiConfig.provider,
        model: aiConfig.provider === 'openai' ? aiConfig.openai.model : aiConfig.ollama.model,
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
    // Keep process alive for library mode
    await new Promise(() => {});
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

// Run the worker if this file is executed directly
// NOSONAR: S7785 - Top-level await not available in CommonJS modules
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  (async () => {
    // NOSONAR
    try {
      await main();
    } catch (error: unknown) {
      console.error('Fatal error:', error);
      process.exit(1);
    }
  })();
}

// Export initialize function for programmatic use
export { initializeWorker, shutdown };
