/**
 * Reindex Worker Module (IFC-155)
 *
 * Re-exports reindex worker types from ai-worker.
 * This package provides the public API for background re-indexing.
 *
 * Implementation: apps/ai-worker/src/workers/reindex-worker.ts
 *
 * @module @intelliflow/search/worker
 */

import { z } from 'zod';
import type { ReindexProgress } from './indexer';

// ============================================
// Queue Configuration
// ============================================

export const REINDEX_QUEUE_NAME = 'intelliflow:document-reindex';

// ============================================
// Job Types
// ============================================

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
  documents: {
    total: number;
    successful: number;
    failed: number;
  } | null;
  notes: {
    total: number;
    successful: number;
    failed: number;
  } | null;
  totalTimeMs: number;
  completedAt: string;
}

export interface ReindexJobProgress {
  stage: 'documents' | 'notes' | 'complete';
  documents?: ReindexProgress;
  notes?: ReindexProgress;
  overallProgress: number; // 0-100
}

export interface ReindexJobStatus {
  state: string;
  progress: ReindexJobProgress | null;
  result: ReindexJobResult | null;
  error: string | null;
}

// ============================================
// Queue Statistics
// ============================================

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

// ============================================
// Worker Interface
// ============================================

/**
 * Interface for the reindex worker.
 * Actual implementation in apps/ai-worker/src/workers/reindex-worker.ts
 */
export interface IReindexWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
  addJob(
    data: ReindexJobData,
    options?: { priority?: number; delay?: number }
  ): Promise<{ id: string }>;
  getJobStatus(jobId: string): Promise<ReindexJobStatus | null>;
  getQueueStats(): Promise<QueueStats>;
}

// ============================================
// Scheduler Options
// ============================================

export interface ScheduleOptions {
  delay?: number;
  cron?: string;
}
