/**
 * AI Worker
 *
 * BullMQ-based worker for processing AI tasks.
 * Extends BaseWorker from worker-shared for standardized lifecycle management.
 *
 * Queues:
 * - ai:scoring - Lead scoring jobs
 * - ai:prediction - Prediction jobs (churn, NBA, qualification)
 *
 * @module ai-worker
 * @task IFC-168
 */

import { Job } from 'bullmq';
import { BaseWorker } from '@intelliflow/worker-shared';
import type { ComponentHealth } from '@intelliflow/worker-shared';
import {
  AI_WORKER_QUEUES,
  SCORING_QUEUE,
  PREDICTION_QUEUE,
  processScoringJob,
  processPredictionJob,
  type ScoringJobData,
  type ScoringJobResult,
  type PredictionJobData,
  type PredictionJobResult,
} from './jobs';
import { costTracker } from './utils/cost-tracker';
import { aiConfig, loadAIConfig } from './config/ai.config';

// ============================================================================
// Types
// ============================================================================

/** Union type for all job data */
type AIJobData = ScoringJobData | PredictionJobData;

/** Union type for all job results */
type AIJobResult = ScoringJobResult | PredictionJobResult;

// ============================================================================
// AI Worker
// ============================================================================

export class AIWorker extends BaseWorker<AIJobData, AIJobResult> {
  private configLoaded = false;

  constructor() {
    super({
      name: 'ai-worker',
      queues: [...AI_WORKER_QUEUES],
    });
  }

  /**
   * Initialize AI components on startup
   */
  protected async onStart(): Promise<void> {
    this.logger.info('Initializing AI components...');

    // Load AI configuration
    await loadAIConfig();
    this.configLoaded = true;

    this.logger.info(
      {
        provider: aiConfig.provider,
        model: aiConfig.provider === 'openai' ? aiConfig.openai.model : aiConfig.ollama.model,
        costTrackingEnabled: aiConfig.costTracking.enabled,
        cacheEnabled: aiConfig.performance.cacheEnabled,
      },
      'AI configuration loaded'
    );

    // Initialize cost tracker
    this.logger.info('Cost tracker initialized');

    this.logger.info({ queues: AI_WORKER_QUEUES }, 'AI Worker ready to process jobs');
  }

  /**
   * Cleanup on shutdown
   */
  protected async onStop(): Promise<void> {
    this.logger.info('Shutting down AI Worker...');

    // Generate final cost report
    const report = costTracker.generateReport();
    this.logger.info('\n' + report);

    this.logger.info('AI Worker shutdown complete');
  }

  /**
   * Route jobs to appropriate handler based on queue
   */
  protected async processJob(job: Job<AIJobData>): Promise<AIJobResult> {
    switch (job.queueName) {
      case SCORING_QUEUE:
        return processScoringJob(job as Job<ScoringJobData>);
      case PREDICTION_QUEUE:
        return processPredictionJob(job as Job<PredictionJobData>);
      default:
        throw new Error(`Unknown queue: ${job.queueName}`);
    }
  }

  /**
   * Check AI-specific dependencies
   */
  protected async getDependencyHealth(): Promise<Record<string, ComponentHealth>> {
    const health: Record<string, ComponentHealth> = {};

    // Check AI provider connectivity
    try {
      // Simple config check as health indicator
      health.ai_config = {
        status: this.configLoaded ? 'ok' : 'error',
        latency: 0,
        lastCheck: new Date().toISOString(),
      };

      // Cost tracker health
      const stats = costTracker.getStatistics();
      health.cost_tracker = {
        status: 'ok',
        latency: 0,
        lastCheck: new Date().toISOString(),
        message: `ops=${stats.totalOperations}, cost=$${stats.totalCost.toFixed(2)}`,
      };
    } catch (error) {
      health.ai_provider = {
        status: 'error',
        latency: 0,
        lastCheck: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      };
    }

    return health;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and start the AI Worker
 */
export async function createAIWorker(): Promise<AIWorker> {
  const worker = new AIWorker();
  await worker.start();
  return worker;
}
