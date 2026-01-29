/**
 * Re-Index Worker (IFC-155)
 *
 * BullMQ worker for background document and note re-indexing.
 * Handles batch processing, progress tracking, and error recovery.
 *
 * Queue: intelliflow-document-reindex
 *
 * @module @intelliflow/ai-worker/workers/reindex-worker
 */

import { Job, Worker, Queue, QueueEvents } from 'bullmq';
import { PrismaClient } from '@intelliflow/db';
import { z } from 'zod';
import {
  DocumentIndexer,
  createDocumentIndexer,
  type ReindexProgress,
  type BatchIndexResult,
} from '../services/document-indexer';

// ============================================
// Configuration
// ============================================

export const REINDEX_QUEUE_NAME = 'intelliflow-document-reindex';

export const ReindexJobDataSchema = z.object({
  // Target scope
  tenantId: z.string().uuid().optional(),
  documentIds: z.array(z.string().uuid()).optional(),
  noteIds: z.array(z.string().uuid()).optional(),

  // Processing options
  indexType: z.enum(['documents', 'notes', 'all']).default('all'),
  batchSize: z.number().min(1).max(100).default(10),
  forceRegenerate: z.boolean().default(false),

  // Job metadata
  requestedBy: z.string().uuid().optional(),
  reason: z.string().optional(),
});

export type ReindexJobData = z.infer<typeof ReindexJobDataSchema>;

export interface ReindexJobResult {
  jobId: string;
  indexType: string;
  documents: BatchIndexResult | null;
  notes: BatchIndexResult | null;
  totalTimeMs: number;
  completedAt: string;
}

// ============================================
// Job Progress Events
// ============================================

export interface ReindexJobProgress {
  stage: 'documents' | 'notes' | 'complete';
  documents?: ReindexProgress;
  notes?: ReindexProgress;
  overallProgress: number; // 0-100
}

// ============================================
// Worker Implementation
// ============================================

export class ReindexWorker {
  private worker: Worker<ReindexJobData, ReindexJobResult> | null = null;
  private queue: Queue<ReindexJobData, ReindexJobResult> | null = null;
  private queueEvents: QueueEvents | null = null;
  private indexer: DocumentIndexer;

  constructor(
    private prisma: PrismaClient,
    private redisConnection: { host: string; port: number; password?: string }
  ) {
    this.indexer = createDocumentIndexer(prisma);
  }

  /**
   * Initialize and start the worker
   */
  async start(): Promise<void> {
    // Create queue
    this.queue = new Queue<ReindexJobData, ReindexJobResult>(REINDEX_QUEUE_NAME, {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 86400, // 24 hours
          count: 100,
        },
        removeOnFail: {
          age: 604800, // 7 days
          count: 1000,
        },
      },
    });

    // Create queue events for monitoring
    this.queueEvents = new QueueEvents(REINDEX_QUEUE_NAME, {
      connection: this.redisConnection,
    });

    // Create worker
    this.worker = new Worker<ReindexJobData, ReindexJobResult>(
      REINDEX_QUEUE_NAME,
      async (job: Job<ReindexJobData, ReindexJobResult>) => this.processJob(job),
      {
        connection: this.redisConnection,
        concurrency: 1, // Process one reindex job at a time
        limiter: {
          max: 1,
          duration: 60000, // Max 1 job per minute
        },
      }
    );

    // Setup event handlers
    this.worker.on('completed', (job: Job<ReindexJobData, ReindexJobResult>, result: ReindexJobResult) => {
      console.log(`[ReindexWorker] Job ${job.id} completed:`, {
        documents: result.documents?.total || 0,
        notes: result.notes?.total || 0,
        timeMs: result.totalTimeMs,
      });
    });

    this.worker.on('failed', (job: Job<ReindexJobData, ReindexJobResult> | undefined, err: Error) => {
      console.error(`[ReindexWorker] Job ${job?.id} failed:`, err.message);
    });

    this.worker.on('progress', (job: Job<ReindexJobData, ReindexJobResult>, progress: unknown) => {
      console.log(`[ReindexWorker] Job ${job.id} progress:`, progress);
    });

    console.log(`[ReindexWorker] Started and listening on queue: ${REINDEX_QUEUE_NAME}`);
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
      this.queueEvents = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
    console.log('[ReindexWorker] Stopped');
  }

  /**
   * Process a reindex job
   */
  private async processJob(job: Job<ReindexJobData, ReindexJobResult>): Promise<ReindexJobResult> {
    const startTime = Date.now();
    const data = ReindexJobDataSchema.parse(job.data);

    console.log(`[ReindexWorker] Processing job ${job.id}:`, {
      indexType: data.indexType,
      tenantId: data.tenantId,
      documentIds: data.documentIds?.length,
      noteIds: data.noteIds?.length,
    });

    let documentsResult: BatchIndexResult | null = null;
    let notesResult: BatchIndexResult | null = null;

    // Index documents
    if (data.indexType === 'documents' || data.indexType === 'all') {
      await job.updateProgress({
        stage: 'documents',
        overallProgress: 0,
      } as ReindexJobProgress);

      if (data.documentIds && data.documentIds.length > 0) {
        // Index specific documents
        documentsResult = await this.indexer.indexBatch(data.documentIds);
      } else {
        // Reindex all documents for tenant
        documentsResult = await this.indexer.reindexAll(
          data.tenantId,
          (progress) => {
            const overallProgress = data.indexType === 'all'
              ? (progress.processed / progress.total) * 50
              : (progress.processed / progress.total) * 100;

            job.updateProgress({
              stage: 'documents',
              documents: progress,
              overallProgress,
            } as ReindexJobProgress);
          }
        );
      }
    }

    // Index notes
    if (data.indexType === 'notes' || data.indexType === 'all') {
      await job.updateProgress({
        stage: 'notes',
        overallProgress: data.indexType === 'all' ? 50 : 0,
      } as ReindexJobProgress);

      if (data.noteIds && data.noteIds.length > 0) {
        // Index specific notes
        notesResult = await this.indexer.indexNotesBatch(data.noteIds);
      } else {
        // Reindex all notes for tenant
        notesResult = await this.indexer.reindexAllNotes(
          data.tenantId,
          (progress) => {
            const baseProgress = data.indexType === 'all' ? 50 : 0;
            const overallProgress = baseProgress + (progress.processed / progress.total) * 50;

            job.updateProgress({
              stage: 'notes',
              notes: progress,
              overallProgress,
            } as ReindexJobProgress);
          }
        );
      }
    }

    // Final progress update
    await job.updateProgress({
      stage: 'complete',
      overallProgress: 100,
    } as ReindexJobProgress);

    const result: ReindexJobResult = {
      jobId: job.id!,
      indexType: data.indexType,
      documents: documentsResult,
      notes: notesResult,
      totalTimeMs: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    };

    // Log to audit
    await this.logReindexCompletion(data, result);

    return result;
  }

  /**
   * Log reindex completion to audit
   */
  private async logReindexCompletion(
    data: ReindexJobData,
    result: ReindexJobResult
  ): Promise<void> {
    try {
      await this.prisma.auditLogEntry.create({
        data: {
          tenantId: data.tenantId || 'system',
          eventType: 'ReindexComplete',
          eventId: `reindex_${result.jobId}`,
          actorType: 'SYSTEM',
          actorId: data.requestedBy || 'system',
          resourceType: 'search_index',
          resourceId: data.tenantId || 'all',
          action: 'UPDATE',
          actionResult: 'SUCCESS',
          metadata: {
            indexType: data.indexType,
            documentsProcessed: result.documents?.total || 0,
            documentsSuccessful: result.documents?.successful || 0,
            notesProcessed: result.notes?.total || 0,
            notesSuccessful: result.notes?.successful || 0,
            totalTimeMs: result.totalTimeMs,
            reason: data.reason,
          },
        },
      });
    } catch (error) {
      console.error('[ReindexWorker] Failed to log audit entry:', error);
    }
  }

  // ========== Queue Management ==========

  /**
   * Add a reindex job to the queue
   */
  async addJob(
    data: ReindexJobData,
    options?: { priority?: number; delay?: number }
  ): Promise<Job<ReindexJobData, ReindexJobResult>> {
    if (!this.queue) {
      throw new Error('Worker not started');
    }

    const validatedData = ReindexJobDataSchema.parse(data);

    return this.queue.add('reindex', validatedData, {
      priority: options?.priority || 10,
      delay: options?.delay,
    });
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<{
    state: string;
    progress: ReindexJobProgress | null;
    result: ReindexJobResult | null;
    error: string | null;
  } | null> {
    if (!this.queue) {
      throw new Error('Worker not started');
    }

    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();

    return {
      state,
      progress: (job.progress as ReindexJobProgress) || null,
      result: state === 'completed' ? (job.returnvalue as ReindexJobResult) : null,
      error: state === 'failed' ? job.failedReason || null : null,
    };
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    if (!this.queue) {
      throw new Error('Worker not started');
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }
}

// ============================================
// Factory Functions
// ============================================

export function createReindexWorker(
  prisma: PrismaClient,
  redisConnection: { host: string; port: number; password?: string }
): ReindexWorker {
  return new ReindexWorker(prisma, redisConnection);
}

// ============================================
// Standalone Job Scheduler (for cron/scheduled tasks)
// ============================================

/**
 * Schedule a reindex job (can be called from API or cron)
 */
export async function scheduleReindexJob(
  queue: Queue<ReindexJobData, ReindexJobResult>,
  data: ReindexJobData,
  options?: { delay?: number; cron?: string }
): Promise<string> {
  const validatedData = ReindexJobDataSchema.parse(data);

  if (options?.cron) {
    // Repeatable job with cron schedule
    const job = await queue.add('scheduled-reindex', validatedData, {
      repeat: {
        pattern: options.cron,
      },
    });
    return job.id!;
  }

  // One-time job with optional delay
  const job = await queue.add('reindex', validatedData, {
    delay: options?.delay,
  });
  return job.id!;
}

export default ReindexWorker;
