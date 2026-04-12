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
  DEFAULT_INSIGHT_JOB_OPTIONS,
  DEFAULT_SCORING_JOB_OPTIONS,
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
  recordToolCall,
  type AgentStatusContext,
} from './services/agent-status';
import { hallucinationChecker } from './monitoring';
import { MonitoringFlushService } from './monitoring/monitoring-flush.service';

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
  private monitoringFlushService?: MonitoringFlushService;
  private prisma?: import('@intelliflow/db').PrismaClient;

  constructor() {
    super({
      name: 'ai-worker',
      queues: [...AI_WORKER_QUEUES],
      config: {
        queue: {
          // Ollama/LLM inference can take 30-120s — default 30s lockDuration
          // causes stale-job failures. Use 3 min lock + 90s stall check.
          lockDuration: 180_000,
          stalledInterval: 90_000,
          maxStalledCount: 3,
          concurrency: 2,
        },
        healthCheck: {
          port: Number.parseInt(process.env.HEALTH_PORT || '5000', 10),
          path: process.env.HEALTH_PATH || '/health',
          readyPath: process.env.HEALTH_READY_PATH || '/health/ready',
          livePath: process.env.HEALTH_LIVE_PATH || '/health/live',
          detailedPath: process.env.HEALTH_DETAILED_PATH || '/health/detailed',
          metricsPath: process.env.METRICS_PATH || '/metrics',
        },
      },
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

    // Register scheduled/repeatable jobs
    await this.registerScheduledJobs();

    // Start Bull Board dashboard
    await this.startDashboard();

    // IFC-297: Initialize Prisma and start monitoring data flush to DB
    try {
      const { prisma } = await import('@intelliflow/db');
      this.prisma = prisma;
      this.monitoringFlushService = new MonitoringFlushService(this.prisma);
      this.monitoringFlushService.start();
      this.logger.info('MonitoringFlushService started — flushing metrics to DB every 60s');
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to initialize MonitoringFlushService — monitoring data will remain in-memory only'
      );
    }
  }

  /**
   * Register repeatable (cron) jobs for periodic AI processing.
   *
   * - ai-insights: Refresh insights every 6 hours for all active tenants
   * - ai-scoring: Re-score unscored/stale leads every 4 hours
   *
   * Uses a configurable SYSTEM_TENANT_ID (defaults to seed tenant) so that
   * agent-status tracking can record job activity on the Active Agents dashboard.
   *
   * Jobs are added with a repeatJobKey so BullMQ deduplicates across restarts.
   */
  private async registerScheduledJobs(): Promise<void> {
    const insightsCron = process.env.AI_INSIGHTS_CRON || '0 */6 * * *'; // every 6 hours
    const scoringCron = process.env.AI_SCORING_CRON || '0 */4 * * *'; // every 4 hours

    // Use a real tenant ID so agent-status tracking writes ConversationRecord rows
    const systemTenantId = process.env.SYSTEM_TENANT_ID || '00000000-0000-4000-8000-000000000001';
    const systemUserId = process.env.SYSTEM_USER_ID || '00000000-0000-4000-8000-000000000101';

    try {
      const insightQueue = this.getQueue(INSIGHT_QUEUE);
      await insightQueue.upsertJobScheduler(
        'scheduled-insight-refresh',
        { pattern: insightsCron },
        {
          name: 'scheduled-insight-refresh',
          data: {
            tenantId: systemTenantId,
            userId: systemUserId,
            dealsAtRisk: [],
            hotLeads: [],
            overdueTasksCount: 0,
            staleContacts: [],
            correlationId: `scheduled-insights-${Date.now()}`,
          },
          opts: DEFAULT_INSIGHT_JOB_OPTIONS,
        }
      );
      this.logger.info({ cron: insightsCron }, 'Scheduled insight refresh job registered');

      const scoringQueue = this.getQueue(SCORING_QUEUE);
      await scoringQueue.upsertJobScheduler(
        'scheduled-lead-scoring',
        { pattern: scoringCron },
        {
          name: 'scheduled-lead-scoring',
          data: {
            leadId: '00000000-0000-0000-0000-000000000000',
            tenantId: systemTenantId,
            userId: systemUserId,
            lead: {
              email: 'scheduled@system.internal',
              source: 'cron',
            },
            correlationId: `scheduled-scoring-${Date.now()}`,
          },
          opts: DEFAULT_SCORING_JOB_OPTIONS,
        }
      );
      this.logger.info({ cron: scoringCron }, 'Scheduled lead scoring job registered');
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to register scheduled jobs — will rely on on-demand triggers'
      );
    }
  }

  private async startDashboard(): Promise<void> {
    const port = Number.parseInt(process.env.BULL_BOARD_PORT || '3003', 10);
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/queues');

    // Register AI worker queues (read-write)
    const queues = AI_WORKER_QUEUES.map((name) => new BullMQAdapter(this.getQueue(name)));

    // Also register external worker queues (read-only visibility)
    const { Queue } = await import('bullmq');
    const connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    };
    const externalQueueNames = [
      'intelliflow-document-reindex',
      'intelliflow-text-extraction',
      'intelliflow-ocr-processing',
      'intelliflow-embedding-generation',
    ];
    for (const name of externalQueueNames) {
      queues.push(new BullMQAdapter(new Queue(name, { connection })));
    }

    createBullBoard({ queues, serverAdapter });

    const app = express();
    app.disable('x-powered-by');
    app.use('/queues', serverAdapter.getRouter());
    app.get('/', (_req, res) => {
      res.redirect('/queues');
    });

    this.dashboardServer = app.listen(port, () => {
      this.logger.info({ url: `http://localhost:${port}/queues` }, 'Bull Board dashboard started');
    });
  }

  /**
   * Cleanup on shutdown
   */
  protected async onStop(): Promise<void> {
    this.logger.info('Shutting down AI Worker...');

    // IFC-297: Drain monitoring data before shutdown
    if (this.monitoringFlushService) {
      await this.monitoringFlushService.stop();
    }

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
   *
   * Also records each chain execution as a ToolCallRecord so the
   * Agent Logs page (/agent-approvals/logs) shows real tool invocations.
   */
  protected async processJob(job: Job<AIJobData>): Promise<AIJobResult> {
    const ctx = extractJobContext(job.queueName, job.data);
    const startMs = Date.now();

    if (ctx) {
      await markAgentActive(ctx);
    }

    try {
      let result: AIJobResult;

      // Map queue → chain tool name for ToolCallRecord
      const chainToolName =
        {
          [SCORING_QUEUE]: 'lead_scoring_chain',
          [PREDICTION_QUEUE]: 'prediction_chain',
          [INSIGHT_QUEUE]: 'insight_generation_chain',
        }[job.queueName] ?? job.queueName;

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

      const durationMs = Date.now() - startMs;

      if (ctx) {
        // Record the chain execution as a tool call
        await recordToolCall(
          ctx,
          chainToolName,
          { jobId: job.id, jobName: job.name, queue: job.queueName },
          this.summarizeResult(result),
          'SUCCESS',
          durationMs
        );

        await markAgentIdle(ctx, undefined, { durationMs, result });

        // Run hallucination check on AI output (heuristic, non-blocking)
        this.runHallucinationCheck(ctx, job, result).catch((err) => {
          this.logger.warn({ error: String(err) }, 'Hallucination check failed');
        });
      }

      return result;
    } catch (error) {
      if (ctx) {
        const message = error instanceof Error ? error.message : String(error);
        const durationMs = Date.now() - startMs;

        // Record the failed chain execution as a tool call
        const chainToolName =
          {
            [SCORING_QUEUE]: 'lead_scoring_chain',
            [PREDICTION_QUEUE]: 'prediction_chain',
            [INSIGHT_QUEUE]: 'insight_generation_chain',
          }[job.queueName] ?? job.queueName;

        await recordToolCall(
          ctx,
          chainToolName,
          { jobId: job.id, jobName: job.name, queue: job.queueName },
          { error: message },
          'FAILED',
          durationMs
        );

        await markAgentError(ctx, message, durationMs);
      }
      throw error;
    }
  }

  /**
   * Extract key metrics from a job result for the tool call output record.
   */
  private summarizeResult(result: AIJobResult): Record<string, unknown> {
    const r = result as Record<string, unknown>;
    const summary: Record<string, unknown> = {};

    // Scoring result
    if ('score' in r) summary.score = r.score;
    if ('tier' in r) summary.tier = r.tier;
    if ('confidence' in r) summary.confidence = r.confidence;

    // Insight result
    if ('insightsCreated' in r) summary.insightsCreated = r.insightsCreated;

    // Prediction result
    if ('prediction' in r) summary.prediction = r.prediction;

    if ('processingTimeMs' in r) summary.processingTimeMs = r.processingTimeMs;

    return Object.keys(summary).length > 0 ? summary : { completed: true };
  }

  /**
   * Run hallucination check on a completed job result.
   * Tracks its own agent status as the "hallucination" agent type.
   */
  private async runHallucinationCheck(
    parentCtx: AgentStatusContext,
    job: Job<AIJobData>,
    result: AIJobResult
  ): Promise<void> {
    const hCtx: AgentStatusContext = {
      tenantId: parentCtx.tenantId,
      userId: parentCtx.userId,
      agentType: 'hallucination',
      taskDescription: `Checking ${parentCtx.agentType} output for hallucinations`,
    };
    await markAgentActive(hCtx);
    const startMs = Date.now();

    try {
      const outputStr = JSON.stringify(result);
      const inputStr = JSON.stringify(job.data).slice(0, 2000);
      const checkResult = await hallucinationChecker.checkOutput({
        id: job.id ?? `job-${Date.now()}`,
        model: this.getProviderModel(),
        inputContext: inputStr,
        output: outputStr,
      });

      const durationMs = Date.now() - startMs;
      const summary = checkResult.hallucinated
        ? `Hallucination detected (score: ${checkResult.score.toFixed(2)}, types: ${checkResult.hallucinationTypes.join(', ')})`
        : `Clean output (score: ${checkResult.score.toFixed(2)})`;
      await markAgentIdle(hCtx, summary, {
        durationMs,
        result: {
          hallucinated: checkResult.hallucinated,
          score: checkResult.score,
          types: checkResult.hallucinationTypes,
        },
      });
    } catch (error) {
      const durationMs = Date.now() - startMs;
      await markAgentError(
        hCtx,
        error instanceof Error ? error.message : String(error),
        durationMs
      );
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

  private getConfiguredProviderHealth(
    lastCheck: string
  ): Promise<ComponentHealth> | ComponentHealth {
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
