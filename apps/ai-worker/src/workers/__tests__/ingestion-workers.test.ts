/**
 * Unit tests for ingestion-workers.ts (D5 / issue #259)
 *
 * Verifies that bootIngestionWorkers registers BullMQ Worker instances for
 * intelliflow-text-extraction and intelliflow-ocr-processing without requiring
 * a live Redis connection.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// BullMQ mock — tracks constructor calls and close() invocations
// ---------------------------------------------------------------------------

const bullmqCalls: {
  Queue: unknown[][];
  Worker: unknown[][];
  workerOn: Array<[string, unknown]>;
  closed: { worker: number; queue: number };
} = {
  Queue: [],
  Worker: [],
  workerOn: [],
  closed: { worker: 0, queue: 0 },
};

vi.mock('bullmq', () => {
  class MockQueue {
    constructor(...args: unknown[]) {
      bullmqCalls.Queue.push(args);
    }
    async close() {
      bullmqCalls.closed.queue++;
    }
    async add() {
      return { id: 'job-1' };
    }
  }
  class MockWorker {
    constructor(...args: unknown[]) {
      bullmqCalls.Worker.push(args);
    }
    on(event: string, handler: unknown) {
      bullmqCalls.workerOn.push([event, handler]);
    }
    async close() {
      bullmqCalls.closed.worker++;
    }
  }
  return { Queue: MockQueue, Worker: MockWorker };
});

// ---------------------------------------------------------------------------
// OCRWorker mock (lives in same package, avoid network calls)
// ---------------------------------------------------------------------------

vi.mock('../ocr-worker.js', () => {
  class MockOCRWorker {
    async processDocument() {
      return {
        jobId: 'j1',
        documentId: 'doc-1',
        status: 'completed' as const,
        extractedText: 'hello world',
        confidence: 0.95,
        pageCount: 1,
        processingTimeMs: 10,
        engine: 'tesseract' as const,
        provenance: {
          sourceUrl: 'https://example.com/img.png',
          format: 'png' as const,
          extractedAt: new Date(),
          engineVersion: '5.3.0',
        },
        quality: {
          overallConfidence: 0.95,
          wordCount: 2,
          pageConfidences: [0.95],
          lowConfidenceRegions: [],
        },
      };
    }
    normalizeText(t: string) {
      return t.trim();
    }
    createSearchableChunks(t: string) {
      return [t];
    }
  }
  return { OCRWorker: MockOCRWorker };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import {
  bootIngestionWorkers,
  TEXT_EXTRACTION_QUEUE,
  OCR_PROCESSING_QUEUE,
} from '../ingestion-workers.js';
import pino from 'pino';

describe('bootIngestionWorkers', () => {
  const redisConn = { host: 'localhost', port: 6379 };
  const generateEmbedding = vi.fn().mockResolvedValue(null);
  const logger = pino({ level: 'silent' });

  beforeEach(() => {
    bullmqCalls.Queue.length = 0;
    bullmqCalls.Worker.length = 0;
    bullmqCalls.workerOn.length = 0;
    bullmqCalls.closed.worker = 0;
    bullmqCalls.closed.queue = 0;
  });

  it('registers a Worker for intelliflow-text-extraction', async () => {
    await bootIngestionWorkers(redisConn, generateEmbedding, logger);

    const textWorker = bullmqCalls.Worker.find((args) => args[0] === TEXT_EXTRACTION_QUEUE);
    expect(textWorker, `expected Worker for ${TEXT_EXTRACTION_QUEUE}`).toBeDefined();
  });

  it('registers a Worker for intelliflow-ocr-processing', async () => {
    await bootIngestionWorkers(redisConn, generateEmbedding, logger);

    const ocrWorker = bullmqCalls.Worker.find((args) => args[0] === OCR_PROCESSING_QUEUE);
    expect(ocrWorker, `expected Worker for ${OCR_PROCESSING_QUEUE}`).toBeDefined();
  });

  it('returns a handle whose stop() closes all workers and queues', async () => {
    const handle = await bootIngestionWorkers(redisConn, generateEmbedding, logger);

    await handle.stop();

    expect(bullmqCalls.closed.worker).toBe(2); // text + ocr workers
    expect(bullmqCalls.closed.queue).toBe(2); // text + ocr queues
  });

  it('registers "failed" event listeners on both workers', async () => {
    await bootIngestionWorkers(redisConn, generateEmbedding, logger);

    const failedHandlers = bullmqCalls.workerOn.filter(([ev]) => ev === 'failed');
    expect(failedHandlers.length).toBeGreaterThanOrEqual(2);
  });

  it('passes the redis connection to both Worker constructors', async () => {
    const conn = { host: '10.0.0.1', port: 6380, password: 'secret' };
    await bootIngestionWorkers(conn, generateEmbedding, logger);

    for (const workerArgs of bullmqCalls.Worker) {
      const opts = workerArgs[2] as { connection: typeof conn };
      expect(opts?.connection).toMatchObject(conn);
    }
  });
});

// ---------------------------------------------------------------------------
// Queue-name constant sanity checks
// ---------------------------------------------------------------------------

describe('queue name constants', () => {
  it('TEXT_EXTRACTION_QUEUE matches producer value in upload.router.ts', () => {
    expect(TEXT_EXTRACTION_QUEUE).toBe('intelliflow-text-extraction');
  });

  it('OCR_PROCESSING_QUEUE matches producer value in upload.router.ts', () => {
    expect(OCR_PROCESSING_QUEUE).toBe('intelliflow-ocr-processing');
  });
});
