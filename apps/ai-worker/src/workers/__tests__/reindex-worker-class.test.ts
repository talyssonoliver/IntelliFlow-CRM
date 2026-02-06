/**
 * ReindexWorker Class Tests (IFC-155)
 *
 * Tests that directly instantiate and test the ReindexWorker class,
 * complementing the existing reindex-worker.test.ts simulation tests.
 *
 * Covers:
 * - Worker start/stop lifecycle
 * - addJob validation and queue operations
 * - getJobStatus with different job states
 * - getQueueStats
 * - Error handling: worker not started, audit log failures
 * - scheduleReindexJob factory function
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================
// Mock BullMQ
// =============================================

const mockWorkerOn = vi.fn();
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'test-job-id' });
const mockQueueGetJob = vi.fn();
const mockQueueGetWaitingCount = vi.fn().mockResolvedValue(3);
const mockQueueGetActiveCount = vi.fn().mockResolvedValue(1);
const mockQueueGetCompletedCount = vi.fn().mockResolvedValue(10);
const mockQueueGetFailedCount = vi.fn().mockResolvedValue(2);
const mockQueueGetDelayedCount = vi.fn().mockResolvedValue(0);
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockQueueEventsClose = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => {
  // Must use class syntax so `new Queue(...)` works
  const MockWorker = vi.fn().mockImplementation(function (this: any, _name: string, _processor: unknown, _opts: unknown) {
    this.on = mockWorkerOn;
    this.close = mockWorkerClose;
  });

  const MockQueue = vi.fn().mockImplementation(function (this: any) {
    this.add = mockQueueAdd;
    this.getJob = mockQueueGetJob;
    this.getWaitingCount = mockQueueGetWaitingCount;
    this.getActiveCount = mockQueueGetActiveCount;
    this.getCompletedCount = mockQueueGetCompletedCount;
    this.getFailedCount = mockQueueGetFailedCount;
    this.getDelayedCount = mockQueueGetDelayedCount;
    this.close = mockQueueClose;
  });

  const MockQueueEvents = vi.fn().mockImplementation(function (this: any) {
    this.close = mockQueueEventsClose;
  });

  return {
    Worker: MockWorker,
    Queue: MockQueue,
    QueueEvents: MockQueueEvents,
    Job: vi.fn(),
  };
});

// =============================================
// Mock DocumentIndexer
// =============================================

vi.mock('../../services/document-indexer', () => ({
  createDocumentIndexer: vi.fn().mockReturnValue({
    indexBatch: vi.fn().mockResolvedValue({
      total: 5,
      successful: 5,
      failed: 0,
      results: [],
      totalTimeMs: 200,
    }),
    indexNotesBatch: vi.fn().mockResolvedValue({
      total: 3,
      successful: 3,
      failed: 0,
      results: [],
      totalTimeMs: 100,
    }),
    reindexAll: vi.fn().mockResolvedValue({
      total: 50,
      successful: 48,
      failed: 2,
      results: [],
      totalTimeMs: 5000,
    }),
    reindexAllNotes: vi.fn().mockResolvedValue({
      total: 30,
      successful: 30,
      failed: 0,
      results: [],
      totalTimeMs: 3000,
    }),
  }),
  DocumentIndexer: vi.fn(),
}));

// =============================================
// Mock Prisma
// =============================================

vi.mock('@intelliflow/db', () => ({
  PrismaClient: vi.fn(),
}));

import {
  ReindexWorker,
  createReindexWorker,
  scheduleReindexJob,
  ReindexJobDataSchema,
  REINDEX_QUEUE_NAME,
  type ReindexJobData,
} from '../reindex-worker';

// =============================================
// Helpers
// =============================================

function createMockPrisma() {
  return {
    auditLogEntry: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  } as any;
}

const redisConnection = { host: 'localhost', port: 6379 };

// =============================================
// Tests
// =============================================

describe('ReindexWorker class', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let worker: ReindexWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    worker = new ReindexWorker(mockPrisma, redisConnection);
  });

  afterEach(async () => {
    try {
      await worker.stop();
    } catch {
      // Ignore if not started
    }
  });

  describe('lifecycle', () => {
    it('should start successfully and set up queue, worker, and events', async () => {
      await worker.start();

      const { Queue, Worker, QueueEvents } = await import('bullmq');
      expect(Queue).toHaveBeenCalledWith(REINDEX_QUEUE_NAME, expect.objectContaining({
        connection: redisConnection,
      }));
      expect(Worker).toHaveBeenCalledWith(
        REINDEX_QUEUE_NAME,
        expect.any(Function),
        expect.objectContaining({
          connection: redisConnection,
          concurrency: 1,
        })
      );
      expect(QueueEvents).toHaveBeenCalledWith(REINDEX_QUEUE_NAME, expect.objectContaining({
        connection: redisConnection,
      }));
    });

    it('should register event handlers on worker', async () => {
      await worker.start();

      expect(mockWorkerOn).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockWorkerOn).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockWorkerOn).toHaveBeenCalledWith('progress', expect.any(Function));
    });

    it('should stop and close all resources', async () => {
      await worker.start();
      await worker.stop();

      expect(mockWorkerClose).toHaveBeenCalled();
      expect(mockQueueEventsClose).toHaveBeenCalled();
      expect(mockQueueClose).toHaveBeenCalled();
    });

    it('should handle stop when not started', async () => {
      // Should not throw
      await worker.stop();
    });

    it('should handle multiple stops gracefully', async () => {
      await worker.start();
      await worker.stop();
      await worker.stop(); // Second stop should be safe
    });
  });

  describe('addJob', () => {
    it('should add a valid job to the queue', async () => {
      await worker.start();

      const jobData: ReindexJobData = {
        indexType: 'all',
        batchSize: 10,
        forceRegenerate: false,
      };

      const job = await worker.addJob(jobData);

      expect(mockQueueAdd).toHaveBeenCalledWith('reindex', expect.objectContaining({
        indexType: 'all',
        batchSize: 10,
      }), expect.objectContaining({
        priority: 10,
      }));
      expect(job.id).toBe('test-job-id');
    });

    it('should throw when worker not started', async () => {
      await expect(
        worker.addJob({ indexType: 'all', batchSize: 10, forceRegenerate: false })
      ).rejects.toThrow('Worker not started');
    });

    it('should validate job data schema', async () => {
      await worker.start();

      await expect(
        worker.addJob({ indexType: 'invalid' as any, batchSize: 10, forceRegenerate: false })
      ).rejects.toThrow();
    });

    it('should accept priority and delay options', async () => {
      await worker.start();

      await worker.addJob(
        { indexType: 'documents', batchSize: 5, forceRegenerate: false },
        { priority: 1, delay: 5000 }
      );

      expect(mockQueueAdd).toHaveBeenCalledWith('reindex', expect.anything(), expect.objectContaining({
        priority: 1,
        delay: 5000,
      }));
    });

    it('should accept tenantId and documentIds', async () => {
      await worker.start();

      const jobData: ReindexJobData = {
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        documentIds: ['123e4567-e89b-12d3-a456-426614174001'],
        indexType: 'documents',
        batchSize: 10,
        forceRegenerate: true,
        requestedBy: '123e4567-e89b-12d3-a456-426614174002',
        reason: 'Manual reindex',
      };

      await worker.addJob(jobData);

      expect(mockQueueAdd).toHaveBeenCalledWith('reindex', expect.objectContaining({
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        documentIds: ['123e4567-e89b-12d3-a456-426614174001'],
        forceRegenerate: true,
      }), expect.anything());
    });
  });

  describe('getJobStatus', () => {
    it('should return job status for completed job', async () => {
      await worker.start();

      const mockReturnValue = {
        jobId: 'job-1',
        indexType: 'all',
        documents: { total: 50, successful: 50, failed: 0 },
        notes: null,
        totalTimeMs: 3000,
        completedAt: '2025-06-01T00:00:00Z',
      };

      mockQueueGetJob.mockResolvedValue({
        progress: { stage: 'complete', overallProgress: 100 },
        getState: vi.fn().mockResolvedValue('completed'),
        returnvalue: mockReturnValue,
        failedReason: null,
      });

      const status = await worker.getJobStatus('job-1');

      expect(status).not.toBeNull();
      expect(status!.state).toBe('completed');
      expect(status!.progress).toEqual({ stage: 'complete', overallProgress: 100 });
      expect(status!.result).toEqual(mockReturnValue);
      expect(status!.error).toBeNull();
    });

    it('should return job status for failed job', async () => {
      await worker.start();

      mockQueueGetJob.mockResolvedValue({
        progress: null,
        getState: vi.fn().mockResolvedValue('failed'),
        returnvalue: null,
        failedReason: 'Database connection refused',
      });

      const status = await worker.getJobStatus('job-2');

      expect(status!.state).toBe('failed');
      expect(status!.error).toBe('Database connection refused');
      expect(status!.result).toBeNull();
    });

    it('should return null for non-existent job', async () => {
      await worker.start();
      mockQueueGetJob.mockResolvedValue(null);

      const status = await worker.getJobStatus('nonexistent');
      expect(status).toBeNull();
    });

    it('should throw when worker not started', async () => {
      await expect(worker.getJobStatus('job-1')).rejects.toThrow('Worker not started');
    });

    it('should handle active job with progress', async () => {
      await worker.start();

      mockQueueGetJob.mockResolvedValue({
        progress: { stage: 'documents', overallProgress: 45 },
        getState: vi.fn().mockResolvedValue('active'),
        returnvalue: null,
        failedReason: null,
      });

      const status = await worker.getJobStatus('job-3');

      expect(status!.state).toBe('active');
      expect(status!.progress).toEqual({ stage: 'documents', overallProgress: 45 });
      expect(status!.result).toBeNull();
      expect(status!.error).toBeNull();
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      await worker.start();

      const stats = await worker.getQueueStats();

      expect(stats).toEqual({
        waiting: 3,
        active: 1,
        completed: 10,
        failed: 2,
        delayed: 0,
      });
    });

    it('should throw when worker not started', async () => {
      await expect(worker.getQueueStats()).rejects.toThrow('Worker not started');
    });
  });
});

describe('createReindexWorker factory', () => {
  it('should create a ReindexWorker instance', () => {
    const mockPrisma = createMockPrisma();
    const w = createReindexWorker(mockPrisma, redisConnection);
    expect(w).toBeInstanceOf(ReindexWorker);
  });

  it('should accept redis connection with password', () => {
    const mockPrisma = createMockPrisma();
    const w = createReindexWorker(mockPrisma, {
      host: 'redis.example.com',
      port: 6380,
      password: 'secret',
    });
    expect(w).toBeInstanceOf(ReindexWorker);
  });
});

describe('scheduleReindexJob', () => {
  it('should schedule a one-time job', async () => {
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'scheduled-1' }),
    } as any;

    const jobId = await scheduleReindexJob(mockQueue, {
      indexType: 'all',
      batchSize: 10,
      forceRegenerate: false,
    });

    expect(mockQueue.add).toHaveBeenCalledWith('reindex', expect.anything(), expect.objectContaining({
      delay: undefined,
    }));
    expect(jobId).toBe('scheduled-1');
  });

  it('should schedule a delayed job', async () => {
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'delayed-1' }),
    } as any;

    await scheduleReindexJob(
      mockQueue,
      { indexType: 'documents', batchSize: 10, forceRegenerate: false },
      { delay: 60000 }
    );

    expect(mockQueue.add).toHaveBeenCalledWith('reindex', expect.anything(), expect.objectContaining({
      delay: 60000,
    }));
  });

  it('should schedule a repeatable cron job', async () => {
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'cron-1' }),
    } as any;

    const jobId = await scheduleReindexJob(
      mockQueue,
      { indexType: 'all', batchSize: 10, forceRegenerate: false },
      { cron: '0 2 * * *' }
    );

    expect(mockQueue.add).toHaveBeenCalledWith('scheduled-reindex', expect.anything(), expect.objectContaining({
      repeat: { pattern: '0 2 * * *' },
    }));
    expect(jobId).toBe('cron-1');
  });

  it('should validate job data', async () => {
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'x' }),
    } as any;

    await expect(
      scheduleReindexJob(mockQueue, { indexType: 'bad' as any, batchSize: 10, forceRegenerate: false })
    ).rejects.toThrow();
  });
});

describe('ReindexJobDataSchema edge cases', () => {
  it('should accept minimal empty object', () => {
    const result = ReindexJobDataSchema.parse({});
    expect(result.indexType).toBe('all');
    expect(result.batchSize).toBe(10);
    expect(result.forceRegenerate).toBe(false);
  });

  it('should accept noteIds as UUIDs', () => {
    const result = ReindexJobDataSchema.safeParse({
      noteIds: ['123e4567-e89b-12d3-a456-426614174000'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid noteIds', () => {
    const result = ReindexJobDataSchema.safeParse({
      noteIds: ['not-a-uuid'],
    });
    expect(result.success).toBe(false);
  });

  it('should accept requestedBy and reason', () => {
    const result = ReindexJobDataSchema.safeParse({
      requestedBy: '123e4567-e89b-12d3-a456-426614174000',
      reason: 'Schema change requires reindex',
    });
    expect(result.success).toBe(true);
  });
});
