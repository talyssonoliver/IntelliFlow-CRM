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
import express from 'express';
import type { Server } from 'node:http';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BaseWorker } from '@intelliflow/worker-shared';
import type { ComponentHealth } from '@intelliflow/worker-shared';
import {
  AI_WORKER_QUEUES,
  SCORING_QUEUE,
  PREDICTION_QUEUE,
  INSIGHT_QUEUE,
  processScoringJob,
  processPredictionJob,
  processInsightJob,
  type ScoringJobData,
  type ScoringJobResult,
  type PredictionJobData,
  type PredictionJobResult,
  type InsightJobData,
  type InsightJobResult,
} from './jobs';
import { costTracker } from './utils/cost-tracker';
import { aiConfig, loadAIConfig } from './config/ai.config';
import {
  extractJobContext,
  markAgentActive,
  markAgentIdle,
  markAgentError,
} from './services/agent-status';

// ============================================================================
// Types
// ============================================================================

/** Union type for all job data */
type AIJobData = ScoringJobData | PredictionJobData | InsightJobData;

/** Union type for all job results */
type AIJobResult = ScoringJobResult | PredictionJobResult | InsightJobResult;

// ============================================================================
// AI Worker
// ============================================================================

export class AIWorker extends BaseWorker<AIJobData, AIJobResult> {
  private configLoaded = false;
  private dashboardServer: Server | null = null;

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
    loadAIConfig();
    this.configLoaded = true;

    const model = this.getProviderModel();
    const endpoint = this.getProviderEndpoint();
    this.logger.info(
      {
        provider: aiConfig.provider,
        model,
        endpoint,
        costTrackingEnabled: aiConfig.costTracking.enabled,
        cacheEnabled: aiConfig.performance.cacheEnabled,
      },
      'AI configuration loaded'
    );

    // Initialize cost tracker
    this.logger.info('Cost tracker initialized');

    this.logger.info({ queues: AI_WORKER_QUEUES }, 'AI Worker ready to process jobs');

    // Start Bull Board dashboard
    await this.startDashboard();
  }

  private async startDashboard(): Promise<void> {
    const port = parseInt(process.env.BULL_BOARD_PORT || '3003', 10);
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/queues');

    const queues = AI_WORKER_QUEUES.map((name) => new BullMQAdapter(this.getQueue(name)));
    createBullBoard({ queues, serverAdapter });

    const app = express();
    app.use('/queues', serverAdapter.getRouter());
    app.get('/', (_req, res) => { res.redirect('/queues'); });

    this.dashboardServer = app.listen(port, () => {
      this.logger.info({ url: `http://localhost:${port}/queues` }, 'Bull Board dashboard started');
    });
  }

  /**
   * Cleanup on shutdown
   */
  protected async onStop(): Promise<void> {
    this.logger.info('Shutting down AI Worker...');

    // Close dashboard server
    if (this.dashboardServer) {
      this.dashboardServer.close();
      this.dashboardServer = null;
    }

    // Generate final cost report
    const report = costTracker.generateReport();
    this.logger.info('\n' + report);

    this.logger.info('AI Worker shutdown complete');
  }

  /**
   * Route jobs to appropriate handler based on queue.
   * Wraps each job with agent status tracking so the Active Agents
   * dashboard (/agent-approvals/agents) shows live data.
   */
  protected async processJob(job: Job<AIJobData>): Promise<AIJobResult> {
    const ctx = extractJobContext(job.queueName, job.data);

    if (ctx) {
      await markAgentActive(ctx);
    }

    try {
      let result: AIJobResult;

      switch (job.queueName) {
        case SCORING_QUEUE:
          result = await processScoringJob(job as Job<ScoringJobData>); // NOSONAR
          break;
        case PREDICTION_QUEUE:
          result = await processPredictionJob(job as Job<PredictionJobData>); // NOSONAR
          break;
        case INSIGHT_QUEUE:
          result = await processInsightJob(job as Job<InsightJobData>); // NOSONAR
          break;
        default:
          throw new Error(`Unknown queue: ${job.queueName}`);
      }

      if (ctx) {
        await markAgentIdle(ctx);
      }

      return result;
    } catch (error) {
      if (ctx) {
        const message = error instanceof Error ? error.message : String(error);
        await markAgentError(ctx, message);
      }
      throw error;
    }
  }

  private getProviderModel(): string {
    if (aiConfig.provider === 'openai') return aiConfig.openai.model;
    if (aiConfig.provider === 'ollama') return aiConfig.ollama.model;
    return 'mock';
  }

  private getProviderEndpoint(): string {
    if (aiConfig.provider === 'openai') return aiConfig.openai.baseUrl || 'https://api.openai.com';
    if (aiConfig.provider === 'ollama') return aiConfig.ollama.baseUrl;
    return 'mock';
  }

  private getMockProviderHealth(lastCheck: string): ComponentHealth {
    const inProduction = process.env.NODE_ENV === 'production';
    if (inProduction) {
      return {
        status: 'error',
        latency: 0,
        lastCheck,
        message: 'Mock provider must not run in production',
      };
    }
    return {
      status: 'ok',
      latency: 0,
      lastCheck,
      message: 'Mock provider enabled for non-production environment',
    };
  }

  private getOpenAIProviderHealth(lastCheck: string): ComponentHealth {
    const hasCompatibleEndpoint = Boolean(aiConfig.openai.baseUrl);
    const hasApiKey = Boolean(aiConfig.openai.apiKey);
    const isConfigured = hasApiKey || hasCompatibleEndpoint;
    const endpointLabel = hasCompatibleEndpoint
      ? `openai-compatible (${aiConfig.openai.baseUrl})`
      : 'openai';

    return {
      status: isConfigured ? 'ok' : 'error',
      latency: 0,
      lastCheck,
      message: isConfigured
        ? `provider=${endpointLabel}, model=${aiConfig.openai.model}`
        : 'OPENAI_API_KEY is missing and no OPENAI_BASE_URL is configured',
    };
  }

  private getConfiguredProviderHealth(lastCheck: string): Promise<ComponentHealth> | ComponentHealth {
    if (aiConfig.provider === 'mock') return this.getMockProviderHealth(lastCheck);
    if (aiConfig.provider === 'openai') return this.getOpenAIProviderHealth(lastCheck);
    if (aiConfig.provider === 'ollama') return this.checkOllamaHealth(lastCheck);
    return {
      status: 'error',
      latency: 0,
      lastCheck,
      message: `Unsupported provider: ${aiConfig.provider}`,
    };
  }

  private async getProviderHealth(lastCheck: string): Promise<ComponentHealth> {
    if (!this.configLoaded) {
      return { status: 'error', latency: 0, lastCheck, message: 'AI configuration not loaded' };
    }
    return this.getConfiguredProviderHealth(lastCheck);
  }

  private async checkOllamaHealth(lastCheck: string): Promise<ComponentHealth> {
    const startedAt = Date.now();
    const fetchFn = globalThis.fetch;

    if (!fetchFn) {
      return {
        status: 'error',
        latency: 0,
        lastCheck,
        message: 'Global fetch is unavailable for Ollama health checks',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
      const url = new URL('/api/tags', aiConfig.ollama.baseUrl).toString();
      const response = await fetchFn(url, { method: 'GET', signal: controller.signal });
      const latency = Date.now() - startedAt;

      if (!response.ok) {
        return {
          status: 'error',
          latency,
          lastCheck,
          message: `Ollama health check failed (${response.status})`,
        };
      }

      return {
        status: 'ok',
        latency,
        lastCheck,
        message: `provider=ollama, model=${aiConfig.ollama.model}, endpoint=${aiConfig.ollama.baseUrl}`,
      };
    } catch (error) {
      const latency = Date.now() - startedAt;
      return {
        status: 'error',
        latency,
        lastCheck,
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private errorHealth(error: unknown): ComponentHealth {
    return {
      status: 'error',
      latency: 0,
      lastCheck: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
  }

  /**
   * Check AI-specific dependencies
   */
  protected async getDependencyHealth(): Promise<Record<string, ComponentHealth>> {
    const health: Record<string, ComponentHealth> = {};

    try {
      const lastCheck = new Date().toISOString();
      health.ai_config = { status: this.configLoaded ? 'ok' : 'error', latency: 0, lastCheck };
      health.ai_provider = await this.getProviderHealth(lastCheck);
      const stats = costTracker.getStatistics();
      health.cost_tracker = {
        status: 'ok',
        latency: 0,
        lastCheck,
        message: `ops=${stats.totalOperations}, cost=$${stats.totalCost.toFixed(2)}`,
      };
    } catch (error) {
      health.ai_provider = this.errorHealth(error);
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
