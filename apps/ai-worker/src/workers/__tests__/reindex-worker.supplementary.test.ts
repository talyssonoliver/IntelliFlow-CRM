/**
 * ReindexWorker Supplementary Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let capturedProcessor: any = null;
const capturedEventHandlers: Record<string, (...args: any[]) => any> = {};

const mockWorkerOn = vi.fn().mockImplementation(function (
  event: string,
  handler: (...args: any[]) => any
) {
  capturedEventHandlers[event] = handler;
});
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
  const MockWorker = vi.fn().mockImplementation(function (
    this: any,
    _name: string,
    processor: unknown,
    _opts: unknown
  ) {
    capturedProcessor = processor;
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
  return { Worker: MockWorker, Queue: MockQueue, QueueEvents: MockQueueEvents, Job: vi.fn() };
});

const { mockIndexBatch, mockIndexNotesBatch, mockReindexAll, mockReindexAllNotes } = vi.hoisted(
  () => ({
    mockIndexBatch: vi
      .fn()
      .mockResolvedValue({ total: 5, successful: 5, failed: 0, results: [], totalTimeMs: 200 }),
    mockIndexNotesBatch: vi
      .fn()
      .mockResolvedValue({ total: 3, successful: 3, failed: 0, results: [], totalTimeMs: 100 }),
    // Invoke the onProgress callback so the worker's progress-reporting closures
    // are exercised (covers the reindexAll/reindexAllNotes branch bodies).
    mockReindexAll: vi.fn().mockImplementation((_tenantId?: string, onProgress?: any) => {
      onProgress?.({
        total: 10,
        processed: 5,
        successful: 5,
        failed: 0,
        currentBatch: 1,
        totalBatches: 1,
        estimatedRemainingMs: 0,
      });
      return Promise.resolve({
        total: 50,
        successful: 48,
        failed: 2,
        results: [],
        totalTimeMs: 5000,
      });
    }),
    mockReindexAllNotes: vi.fn().mockImplementation((_tenantId?: string, onProgress?: any) => {
      onProgress?.({
        total: 10,
        processed: 5,
        successful: 5,
        failed: 0,
        currentBatch: 1,
        totalBatches: 1,
        estimatedRemainingMs: 0,
      });
      return Promise.resolve({
        total: 30,
        successful: 30,
        failed: 0,
        results: [],
        totalTimeMs: 3000,
      });
    }),
  })
);

vi.mock('../../services/document-indexer', () => ({
  createDocumentIndexer: vi.fn().mockReturnValue({
    indexBatch: mockIndexBatch,
    indexNotesBatch: mockIndexNotesBatch,
    reindexAll: mockReindexAll,
    reindexAllNotes: mockReindexAllNotes,
  }),
  DocumentIndexer: vi.fn(),
}));

vi.mock('@intelliflow/db', () => ({ PrismaClient: vi.fn(), prisma: {} }));

import { ReindexWorker, REINDEX_QUEUE_NAME } from '../reindex-worker';

function createMockPrisma() {
  return { auditLogEntry: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) } } as any;
}
const redisConnection = { host: 'localhost', port: 6379 };

describe('ReindexWorker - event handlers', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let worker: ReindexWorker;
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedProcessor = null;
    Object.keys(capturedEventHandlers).forEach((k) => delete capturedEventHandlers[k]);
    mockPrisma = createMockPrisma();
    worker = new ReindexWorker(mockPrisma, redisConnection);
    await worker.start();
  });
  afterEach(async () => {
    try {
      await worker.stop();
    } catch (_e) {
      /* cleanup may fail if worker never started */
    }
  });

  it('should register completed, failed, and progress handlers', () => {
    expect(capturedEventHandlers.completed).toBeDefined();
    expect(capturedEventHandlers.failed).toBeDefined();
    expect(capturedEventHandlers.progress).toBeDefined();
  });
  it('should log on completed event', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    capturedEventHandlers.completed(
      { id: 'j1', name: 'reindex' },
      {
        documents: { total: 5, successful: 5, failed: 0, results: [], totalTimeMs: 100 },
        notes: { total: 3, successful: 3, failed: 0, results: [], totalTimeMs: 50 },
        totalTimeMs: 150,
      }
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it('should log on failed event', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    capturedEventHandlers.failed({ id: 'j2', name: 'reindex' }, new Error('fail'));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it('should log on progress event', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    capturedEventHandlers.progress({ id: 'j3' }, { stage: 'documents', overallProgress: 50 });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('ReindexWorker - processJob via captured processor', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let worker: ReindexWorker;
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedProcessor = null;
    mockPrisma = createMockPrisma();
    worker = new ReindexWorker(mockPrisma, redisConnection);
    await worker.start();
  });
  afterEach(async () => {
    try {
      await worker.stop();
    } catch (_e) {
      /* cleanup may fail if worker never started */
    }
  });

  it('should capture the processor function', () => {
    expect(typeof capturedProcessor).toBe('function');
  });
  it('should process all-type job', async () => {
    if (capturedProcessor == null) return;
    const j = {
      id: 'j-all',
      data: { indexType: 'all', batchSize: 10, forceRegenerate: false },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };
    expect(await capturedProcessor(j)).toBeDefined();
  });
  it('should process documents with IDs', async () => {
    if (capturedProcessor == null) return;
    const j = {
      id: 'j-d',
      data: {
        indexType: 'documents',
        batchSize: 5,
        forceRegenerate: false,
        documentIds: ['11111111-1111-4111-8111-111111111111'],
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };
    expect(await capturedProcessor(j)).toBeDefined();
  });
  it('should log (not throw) when a per-batch progress update rejects', async () => {
    if (capturedProcessor == null) return;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const j = {
      id: 'j-progress-fail',
      data: { indexType: 'all', batchSize: 10, forceRegenerate: false },
      updateProgress: vi
        .fn()
        .mockImplementation((p: { documents?: unknown; notes?: unknown }) =>
          p.documents || p.notes
            ? Promise.reject(new Error('redis down'))
            : Promise.resolve(undefined)
        ),
    };
    expect(await capturedProcessor(j)).toBeDefined();
    await Promise.resolve();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('progress update failed'),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });
  it('should process notes with IDs', async () => {
    if (capturedProcessor == null) return;
    const j = {
      id: 'j-n',
      data: {
        indexType: 'notes',
        batchSize: 5,
        forceRegenerate: false,
        noteIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };
    expect(await capturedProcessor(j)).toBeDefined();
  });
});

describe('ReindexWorker - audit log failure', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let worker: ReindexWorker;
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedProcessor = null;
    mockPrisma = createMockPrisma();
    mockPrisma.auditLogEntry.create.mockRejectedValue(new Error('DB down'));
    worker = new ReindexWorker(mockPrisma, redisConnection);
    await worker.start();
  });
  afterEach(async () => {
    try {
      await worker.stop();
    } catch (_e) {
      /* cleanup may fail if worker never started */
    }
  });

  it('should not fail when audit log write fails', async () => {
    if (capturedProcessor == null) return;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const j = {
      id: 'j-af',
      data: { indexType: 'documents', batchSize: 10, forceRegenerate: false },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };
    expect(await capturedProcessor(j)).toBeDefined();
  });
});

describe('ReindexWorker - progress update failure', () => {
  let worker: ReindexWorker;
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedProcessor = null;
    worker = new ReindexWorker(createMockPrisma(), redisConnection);
    await worker.start();
  });
  afterEach(async () => {
    try {
      await worker.stop();
    } catch (_e) {
      /* cleanup may fail if worker never started */
    }
  });

  it('logs a rejected in-flight updateProgress instead of leaving it unhandled, and still completes', async () => {
    // Fail, not skip, if the Worker mock stopped capturing the processor:
    // returning early here would pass with no assertions.
    expect(capturedProcessor).toBeTypeOf('function');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const progressError = new Error('redis unavailable');
    // Stage-start updateProgress calls (awaited) succeed; the in-flight callback
    // calls fired from reindexAll/reindexAllNotes reject.
    const updateProgress = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(progressError)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(progressError);
    const j = {
      id: 'j-pf',
      data: { indexType: 'all', batchSize: 10, forceRegenerate: false },
      updateProgress,
    };
    await expect(capturedProcessor!(j)).resolves.toBeDefined();
    await new Promise((resolve) => setImmediate(resolve));
    const logged = errorSpy.mock.calls.filter(
      (c) =>
        typeof c[0] === 'string' &&
        c[0].startsWith('[ReindexWorker] Failed to update job progress') &&
        c[1] === progressError
    );
    // Two rejections on the same job, logged once (no flood during an outage).
    expect(logged).toHaveLength(1);
    errorSpy.mockRestore();
  });
});

describe('ReindexWorker progress is best-effort end to end', () => {
  it('completes the job even when EVERY progress write fails (stage-start, in-flight, final)', async () => {
    vi.clearAllMocks();
    capturedProcessor = null;
    const worker = new ReindexWorker(createMockPrisma(), redisConnection);
    await worker.start();
    try {
      expect(capturedProcessor).toBeTypeOf('function');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const updateProgress = vi.fn().mockRejectedValue(new Error('redis down'));
      const j = {
        id: 'j-all-fail',
        data: { indexType: 'all', batchSize: 10, forceRegenerate: false },
        updateProgress,
      };
      await expect(capturedProcessor!(j)).resolves.toBeDefined();
      await new Promise((resolve) => setImmediate(resolve));
      const logged = errorSpy.mock.calls.filter(
        (c) =>
          typeof c[0] === 'string' &&
          c[0].startsWith('[ReindexWorker] Failed to update job progress')
      );
      expect(updateProgress.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(logged).toHaveLength(1);
      errorSpy.mockRestore();
    } finally {
      await worker.stop().catch(() => undefined);
    }
  });
});

describe('ReindexWorker defaults', () => {
  it('should export REINDEX_QUEUE_NAME', () => {
    expect(REINDEX_QUEUE_NAME).toBeDefined();
    expect(typeof REINDEX_QUEUE_NAME).toBe('string');
  });
});
