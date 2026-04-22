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

import { context as otelContext, propagation } from '@opentelemetry/api';
import { Job, Queue, QueueEvents } from 'bullmq';
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
  SUMMARIZE_QUEUE,
  FEEDBACK_ANALYTICS_QUEUE,
  MEMORY_RETENTION_QUEUE,
  processScoringJob,
  processPredictionJob,
  processInsightJob,
  processSummarizeJob,
  processFeedbackAnalyticsJob,
  processMemoryRetentionJob,
  // IFC-312
  processEnrichmentJob,
  processEntityInsightJob,
  processReplyDraftJob,
  processAccountScoringJob,
  processTagSuggestionJob,
  type EnrichmentJobData,
  type EntityInsightJobData,
  type ReplyDraftJobData,
  type AccountScoringJobData,
  type TagSuggestionJobData,
  DEFAULT_INSIGHT_JOB_OPTIONS,
  DEFAULT_SCORING_JOB_OPTIONS,
  DEFAULT_FEEDBACK_ANALYTICS_JOB_OPTIONS,
  DEFAULT_MEMORY_RETENTION_JOB_OPTIONS,
  FEEDBACK_ANALYTICS_CRON,
  MEMORY_RETENTION_CRON,
  type ScoringJobData,
  type ScoringJobResult,
  type PredictionJobData,
  type PredictionJobResult,
  type InsightJobData,
  type InsightJobResult,
  type SummarizeConversationJobData,
  type SummarizeConversationJobResult,
  type FeedbackAnalyticsJobData,
  type FeedbackAnalyticsJobResult,
  type MemoryRetentionJobData,
  type MemoryRetentionJobResult,
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
import { setAuditLogAdapter } from './utils/audit-log';
import { tenantContextStore } from './tracing/tenant-context.js';
import { runWithLogContext } from '@intelliflow/observability';

// ============================================================================
// Constants
// ============================================================================

/** Dead-letter queue name for exhausted AI jobs (H8). */
const AI_DLQ_QUEUE = 'ai-dlq';

/**
 * Fallback max-attempts used when a job does not declare its own
 * `opts.attempts`. Per-queue DEFAULT_*_JOB_OPTIONS set 3; this only applies
 * if a job was enqueued without attempts set explicitly.
 */
const AI_JOB_DEFAULT_MAX_ATTEMPTS = 3;

// ============================================================================
// Types
// ============================================================================

/** Union type for all job data */
type AIJobData =
  | ScoringJobData
  | PredictionJobData
  | InsightJobData
  | SummarizeConversationJobData
  | FeedbackAnalyticsJobData
  | MemoryRetentionJobData;

/** Union type for all job results */
type AIJobResult =
  | ScoringJobResult
  | PredictionJobResult
  | InsightJobResult
  | SummarizeConversationJobResult
  | FeedbackAnalyticsJobResult
  | MemoryRetentionJobResult;

// ============================================================================
// AI Worker
// ============================================================================

export class AIWorker extends BaseWorker<AIJobData, AIJobResult> {
  private configLoaded = false;
  private dashboardServer: Server | null = null;
  private monitoringFlushService?: MonitoringFlushService;
  private prisma?: import('@intelliflow/db').PrismaClient;
  // IFC-310: contact embedding worker for duplicate-detection runtime.
  private contactEmbedWorker?: import('./workers/contact-embed-worker.js').ContactEmbedWorker;
  /** Passive dead-letter queue — no worker, just for inspection and replay. */
  private dlqQueue: Queue | null = null;
  /** QueueEvents instances for each AI queue (used for lifecycle listeners). */
  private queueEventListeners: QueueEvents[] = [];

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

    // H8: Create DLQ and register lifecycle listeners on AI queues
    await this.setupDLQAndLifecycleListeners();

    // Start Bull Board dashboard
    await this.startDashboard();

    // IFC-297: Initialize Prisma and start monitoring data flush to DB
    try {
      const { prisma } = await import('@intelliflow/db');
      // M4 encryption is ACTIVE — prisma from @intelliflow/db is the
      // $extends(fieldEncryptionExtension()) client (AES-256-GCM, bespoke).
      // The `as unknown as` cast aligns the extended type with the field here.
      this.prisma = prisma as unknown as typeof this.prisma;
      this.monitoringFlushService = new MonitoringFlushService(this.prisma as never);
      this.monitoringFlushService.start();
      this.logger.info('MonitoringFlushService started — flushing metrics to DB every 60s');
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to initialize MonitoringFlushService — monitoring data will remain in-memory only'
      );
    }

    // H4: Wire AuditLogPort so logAIAgentAction() writes to DB in addition to pino.
    if (this.prisma) {
      try {
        const { DurableAuditLogAdapter } = await import('@intelliflow/adapters');
        const signingKey = Buffer.from(
          process.env.AUDIT_SIGNING_KEY || 'insecure-dev-key-replace-in-production',
          'utf8'
        );
        const auditAdapter = new DurableAuditLogAdapter(this.prisma as any, signingKey);
        setAuditLogAdapter(auditAdapter);
        this.logger.info('AuditLogPort wired — audit trail will write to DB');
      } catch (err) {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Failed to wire AuditLogPort — falling back to pino-only audit trail'
        );
      }
    }

    // M3: Wire RetrievalService into the global ragContextChain singleton so that
    // NextBestActionAgent (and any other consumer of the singleton) can perform
    // real pgvector-backed RAG retrieval instead of throwing at invocation time.
    if (this.prisma) {
      try {
        const { ragContextChain } = await import('./chains/rag-context.chain.js');
        const { RetrievalService } = await import('./services/retrieval-service.js');
        const retrievalService = new RetrievalService(this.prisma);
        ragContextChain.setRetrievalService(retrievalService);
        this.logger.info('RetrievalService wired into ragContextChain — RAG retrieval enabled');
      } catch (error) {
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to wire RetrievalService into ragContextChain — RAG calls will throw until resolved'
        );
      }
    } else {
      this.logger.warn(
        'Prisma unavailable — skipping RetrievalService wiring; ragContextChain will throw on invocation'
      );
    }

    // IFC-310: boot the ContactEmbedWorker. Consumes intelliflow-contact-embed
    // jobs dispatched by ContactDuplicateDetectionService post-commit.
    if (this.prisma) {
      try {
        const { ContactEmbedWorker } = await import('./workers/contact-embed-worker.js');
        const { embeddingChain } = await import('./chains/embedding.chain.js');
        const { updateContactEmbedding } = await import('@intelliflow/db');
        const redisConnection = {
          host: process.env.REDIS_HOST || 'localhost',
          port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
          ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
        };
        this.contactEmbedWorker = new ContactEmbedWorker(
          this.prisma,
          redisConnection,
          {
            generateEmbedding: async (text: string) => {
              const result = await embeddingChain.generateEmbedding({ text });
              return result?.vector ?? null;
            },
          },
          async (_prisma, contactId, _tenantId, embedding) => {
            await updateContactEmbedding(contactId, embedding);
          },
        );
        await this.contactEmbedWorker.start();
        this.logger.info('ContactEmbedWorker started — intelliflow-contact-embed queue consumed');
      } catch (error) {
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to boot ContactEmbedWorker — contact embeddings will not be populated'
        );
      }
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
  /**
   * H8: Create the passive AI DLQ and register QueueEvents lifecycle listeners
   * for each AI processing queue.
   *
   * - completed → info log (tracing)
   * - stalled   → warn log
   * - failed    → error log; enqueue to ai-dlq when job is exhausted
   */
  private async setupDLQAndLifecycleListeners(): Promise<void> {
    const connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    };

    // Create the passive DLQ — no worker, only used for storage and inspection.
    this.dlqQueue = new Queue(AI_DLQ_QUEUE, {
      connection,
      defaultJobOptions: {
        // DLQ jobs never auto-expire — on-call decides when to replay or discard.
        removeOnFail: false,
        removeOnComplete: false,
      },
    });

    this.logger.info({ queue: AI_DLQ_QUEUE }, 'Dead-letter queue created');

    // Register lifecycle event listeners for every AI processing queue.
    const aiQueues = [
      SCORING_QUEUE,
      PREDICTION_QUEUE,
      INSIGHT_QUEUE,
      SUMMARIZE_QUEUE,
      FEEDBACK_ANALYTICS_QUEUE,
      MEMORY_RETENTION_QUEUE,
    ] as const;

    for (const queueName of aiQueues) {
      const queueEvents = new QueueEvents(queueName, { connection });
      this.queueEventListeners.push(queueEvents);

      // completed — optional info log for distributed tracing
      queueEvents.on('completed', ({ jobId }) => {
        this.logger.info({ jobId, queue: queueName }, 'Job completed');
      });

      // stalled — warn level; indicates the worker lock expired mid-job
      queueEvents.on('stalled', ({ jobId }) => {
        this.logger.warn(
          { jobId, queue: queueName },
          'Job stalled — lock expired before completion'
        );
      });

      // failed — enqueue to DLQ when attempts are exhausted
      queueEvents.on('failed', ({ jobId, failedReason }) => {
        this.logger.error({ jobId, queue: queueName, failedReason }, 'Job failed');

        // We need the full job to read attemptsMade + data; use the queue API.
        this.getQueue(queueName)
          .getJob(jobId)
          .then((job) => {
            if (!job) return;

            const attemptsMade = job.attemptsMade ?? 0;
            // H8 — respect per-job opts.attempts; fall back to global default if unset.
            const maxAttempts = job.opts?.attempts ?? AI_JOB_DEFAULT_MAX_ATTEMPTS;
            if (attemptsMade < maxAttempts) {
              // Still has retries remaining — BullMQ will re-enqueue automatically.
              return;
            }

            // Exhausted — forward to DLQ.
            const tenantId = (job.data as Record<string, unknown>)?.tenantId as string | undefined;
            const dlqPayload = {
              jobName: job.name,
              originalJobId: jobId,
              originalQueue: queueName,
              failureReason: failedReason,
              tenantId,
              lastAttemptAt: new Date().toISOString(),
              originalData: job.data,
            };

            this.dlqQueue!.add(`dlq-${job.name}`, dlqPayload, {
              removeOnFail: false,
              removeOnComplete: false,
            })
              .then(() => {
                this.logger.error(
                  { jobId, queue: queueName, dlqQueue: AI_DLQ_QUEUE },
                  'Exhausted job forwarded to DLQ'
                );
              })
              .catch((dlqErr: unknown) => {
                // Extreme edge case — never crash the worker.
                this.logger.error(
                  {
                    jobId,
                    queue: queueName,
                    error: dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
                  },
                  'Failed to enqueue exhausted job to DLQ — job data may be lost'
                );
              });
          })
          .catch((err: unknown) => {
            this.logger.error(
              {
                jobId,
                queue: queueName,
                error: err instanceof Error ? err.message : String(err),
              },
              'Could not retrieve job data for DLQ forwarding'
            );
          });
      });
    }

    this.logger.info(
      { queues: aiQueues, dlqQueue: AI_DLQ_QUEUE },
      'Lifecycle event listeners registered for AI queues'
    );
  }

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

      // Feedback analytics — daily at 02:00 UTC
      const feedbackAnalyticsCron =
        process.env.AI_FEEDBACK_ANALYTICS_CRON || FEEDBACK_ANALYTICS_CRON;
      const feedbackAnalyticsQueue = this.getQueue(FEEDBACK_ANALYTICS_QUEUE);
      await feedbackAnalyticsQueue.upsertJobScheduler(
        'scheduled-feedback-analytics',
        { pattern: feedbackAnalyticsCron },
        {
          name: 'scheduled-feedback-analytics',
          data: {
            periodDays: 30,
            save: false,
            correlationId: `scheduled-feedback-analytics-${Date.now()}`,
          },
          opts: DEFAULT_FEEDBACK_ANALYTICS_JOB_OPTIONS,
        }
      );
      this.logger.info(
        { cron: feedbackAnalyticsCron },
        'Scheduled feedback analytics job registered'
      );

      // Memory retention — daily at 03:00 UTC (offset from feedback analytics)
      const memoryRetentionCron = process.env.AI_MEMORY_RETENTION_CRON || MEMORY_RETENTION_CRON;
      const memoryRetentionQueue = this.getQueue(MEMORY_RETENTION_QUEUE);
      await memoryRetentionQueue.upsertJobScheduler(
        'scheduled-memory-retention',
        { pattern: memoryRetentionCron },
        {
          name: 'scheduled-memory-retention',
          data: {
            dryRun: false,
            correlationId: `scheduled-memory-retention-${Date.now()}`,
          },
          opts: DEFAULT_MEMORY_RETENTION_JOB_OPTIONS,
        }
      );
      this.logger.info({ cron: memoryRetentionCron }, 'Scheduled memory retention job registered');
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

    // Register DLQ in dashboard (read-only inspection)
    if (this.dlqQueue) {
      queues.push(new BullMQAdapter(this.dlqQueue));
    }

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

    // IFC-310: Stop the contact embedding worker cleanly.
    if (this.contactEmbedWorker) {
      try {
        await this.contactEmbedWorker.stop();
        this.logger.info('ContactEmbedWorker stopped');
      } catch (err) {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Error stopping ContactEmbedWorker'
        );
      }
    }

    // H8: Close DLQ queue and lifecycle event listeners
    for (const queueEvents of this.queueEventListeners) {
      await queueEvents.close().catch((err: unknown) => {
        this.logger.warn(
          { error: err instanceof Error ? err.message : String(err) },
          'Error closing QueueEvents listener'
        );
      });
    }
    this.queueEventListeners = [];

    if (this.dlqQueue) {
      await this.dlqQueue.close().catch((err: unknown) => {
        this.logger.warn(
          { error: err instanceof Error ? err.message : String(err) },
          'Error closing DLQ queue'
        );
      });
      this.dlqQueue = null;
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
    // --- OTel trace context restore ---
    // Extract the W3C traceparent carrier injected at enqueue time so all
    // child spans (including llm.invoke) are parented to the originating trace.
    const carrier = (job.data as { _otelCarrier?: Record<string, string> })._otelCarrier ?? {};
    const parentContext = propagation.extract(otelContext.active(), carrier);

    // Extract tenantId for AsyncLocalStorage so wrapModelWithTracing can stamp spans.
    const tenantIdForStore = (job.data as { tenantId?: string }).tenantId ?? 'unknown';

    // L1 — Pino MDC: populate correlationId + tenantId for every log line
    // emitted during job processing. Per-job runWithLogContext calls inside
    // specific handlers may re-enter this ALS with a more specific context
    // (e.g. validated correlationId); those nested calls override cleanly.
    const correlationId =
      (job.data as { correlationId?: string }).correlationId ?? job.id ?? undefined;

    return otelContext.with(parentContext, async () =>
      tenantContextStore.run({ tenantId: tenantIdForStore }, async () =>
        runWithLogContext({ correlationId, tenantId: tenantIdForStore, userId: undefined }, () =>
          this._processJobImpl(job)
        )
      )
    );
  }

  private async _processJobImpl(job: Job<AIJobData>): Promise<AIJobResult> {
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
          [SUMMARIZE_QUEUE]: 'conversation_summarization_chain',
          [FEEDBACK_ANALYTICS_QUEUE]: 'feedback_analytics_chain',
          [MEMORY_RETENTION_QUEUE]: 'memory_retention_chain',
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
        case SUMMARIZE_QUEUE:
          result = await processSummarizeJob(job as Job<SummarizeConversationJobData>); // NOSONAR
          break;
        case FEEDBACK_ANALYTICS_QUEUE:
          result = await processFeedbackAnalyticsJob(job as Job<FeedbackAnalyticsJobData>); // NOSONAR
          break;
        case MEMORY_RETENTION_QUEUE:
          result = await processMemoryRetentionJob(job as Job<MemoryRetentionJobData>); // NOSONAR
          break;
        // IFC-312 — contact/account AI chain queues. Cast through `unknown`
        // because these payloads are outside the legacy `AIJobData` union.
        case 'ai-enrichment':
          result = (await processEnrichmentJob(
            job as unknown as Job<EnrichmentJobData>
          )) as unknown as AIJobResult;
          break;
        case 'ai-entity-insight':
          result = (await processEntityInsightJob(
            job as unknown as Job<EntityInsightJobData>
          )) as unknown as AIJobResult;
          break;
        case 'ai-reply-draft':
          result = (await processReplyDraftJob(
            job as unknown as Job<ReplyDraftJobData>
          )) as unknown as AIJobResult;
          break;
        case 'ai-account-scoring':
          result = (await processAccountScoringJob(
            job as unknown as Job<AccountScoringJobData>
          )) as unknown as AIJobResult;
          break;
        case 'ai-tag-suggestion':
          result = (await processTagSuggestionJob(
            job as unknown as Job<TagSuggestionJobData>
          )) as unknown as AIJobResult;
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
            [SUMMARIZE_QUEUE]: 'conversation_summarization_chain',
            [FEEDBACK_ANALYTICS_QUEUE]: 'feedback_analytics_chain',
            [MEMORY_RETENTION_QUEUE]: 'memory_retention_chain',
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

    // Memory retention result
    if ('tenantsProcessed' in r) summary.tenantsProcessed = r.tenantsProcessed;
    if ('tenantsSkipped' in r) summary.tenantsSkipped = r.tenantsSkipped;

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
    if (aiConfig.provider === 'litellm') return 'litellm-proxy';
    if (aiConfig.provider === 'openai') return aiConfig.openai.model;
    if (aiConfig.provider === 'ollama') return aiConfig.ollama.model;
    return 'mock';
  }

  private getProviderEndpoint(): string {
    if (aiConfig.provider === 'litellm')
      return process.env['LITELLM_BASE_URL'] || 'http://localhost:4000/v1';
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
    if (aiConfig.provider === 'litellm') return this.getOpenAIProviderHealth(lastCheck); // LiteLLM uses same OpenAI-compat check
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
